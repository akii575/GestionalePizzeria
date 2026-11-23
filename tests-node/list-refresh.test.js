const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createPageContext(pageScript, currentAccount = { admin: true, staff: false, delivery: false }, orders = []) {
    const elements = new Map();
    const listeners = new Map();
    const elementListeners = new Map();
    const requests = [];
    const intervals = new Map();
    const renderCounts = new Map();
    const renderedCards = [];
    const renderedMarkup = new Map();
    let nextIntervalId = 0;
    let clock = 1_000;

    function element(id) {
        if (!elements.has(id)) {
            const value = {
                addEventListener(name, callback) {
                    if (!elementListeners.has(id)) elementListeners.set(id, new Map());
                    const byName = elementListeners.get(id);
                    if (!byName.has(name)) byName.set(name, []);
                    byName.get(name).push(callback);
                },
                querySelectorAll() { return []; },
                insertAdjacentHTML(_position, markup) {
                    renderedCards.push(String(markup));
                    renderedMarkup.set(id, (renderedMarkup.get(id) || "") + String(markup));
                    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
                },
                replaceChildren() {
                    renderedCards.length = 0;
                    renderedMarkup.set(id, "");
                    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
                },
                className: "",
                value: "",
            };
            Object.defineProperty(value, "innerHTML", {
                get() { return ""; },
                set(markup) {
                    if (id.startsWith("lista-")) {
                        renderedCards.length = 0;
                        renderedMarkup.set(id, String(markup));
                    }
                    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
                }
            });
            elements.set(id, value);
        }
        return elements.get(id);
    }

    class PageDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [clock]));
        }
        static now() {
            return clock;
        }
    }

    const document = {
        body: { dataset: { serviceType: "" } },
        visibilityState: "visible",
        getElementById: element,
        addEventListener(name, callback) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(callback);
        }
    };
    const context = {
        document,
        window: {
            authReady: Promise.resolve(true),
            currentAccount,
            orderCard: { bindReprints() {}, bindDateFilter() {}, render(order) { return `|#${order.numero}|`; } }
        },
        fetch: async url => {
            requests.push(String(url));
            const body = String(url).startsWith("/api/menu")
                ? []
                : String(url).includes("versione=")
                    ? { invariato: true, versione: 4 }
                    : { versione: 4, ordini: orders };
            return { ok: true, async json() { return body; } };
        },
        setInterval(callback, delay) {
            const id = ++nextIntervalId;
            intervals.set(id, { callback, delay });
            return id;
        },
        clearInterval(id) {
            intervals.delete(id);
        },
        Intl,
        Date: PageDate,
        Promise,
        URLSearchParams,
        Set
    };

    vm.runInNewContext(pageScript, context);
    return {
        document,
        intervals,
        listeners,
        elementListeners,
        requests,
        renderCounts,
        renderedCards,
        renderedMarkup,
        element,
        advance(milliseconds) {
            clock += milliseconds;
        }
    };
}

async function flushPagePromises() {
    await new Promise(resolve => setImmediate(resolve));
}

test("the all-orders list sorts newest order numbers first", async () => {
    const scriptPath = path.join(__dirname, "../src/main/resources/static/gestionale.js");
    const state = createPageContext(fs.readFileSync(scriptPath, "utf8"), undefined, [
        { numero: 2, totale: 0 },
        { numero: 10, totale: 0 },
        { numero: 4, totale: 0 }
    ]);
    await flushPagePromises();

    assert.deepEqual(state.renderedCards, ["|#10|", "|#4|", "|#2|"]);
});

test("the delivery list sorts active deliveries by requested time and completed ones last", async () => {
    const scriptPath = path.join(__dirname, "../src/main/resources/static/consegne.js");
    const state = createPageContext(fs.readFileSync(scriptPath, "utf8"), undefined, [
        { numero: 2, totale: 0, orario: "20:30", statoConsegna: "da_consegnare" },
        { numero: 7, totale: 0, orario: "19:30", statoConsegna: "in_consegna" },
        { numero: 9, totale: 0, statoConsegna: "da_consegnare" },
        { numero: 8, totale: 0, statoConsegna: "consegnata", consegnataAlle: "2026-10-27T19:30:00.000Z" },
        { numero: 4, totale: 0, statoConsegna: "consegnata", consegnataAlle: "2026-10-27T20:30:00.000Z" }
    ]);
    await flushPagePromises();

    const markup = state.renderedMarkup.get("lista-consegne");
    const orderNumbers = ["7", "2", "9", "4", "8"].map(numero => markup.indexOf(`|#${numero}|`));
    assert.ok(orderNumbers.every(index => index >= 0));
    assert.deepEqual(orderNumbers, [...orderNumbers].sort((first, second) => first - second));
    assert.match(markup, /<details class="consegne-completate"><summary>Consegnate \(2\)<\/summary>/);
    assert.equal(
        state.element("riepilogo-stati-consegna").textContent,
        "2 da consegnare · 1 in consegna · 2 consegnate"
    );
});

for (const [page, endpoint, interval, listId] of [
    ["gestionale.js", "/api/ordini", 15_000, "lista-ordini"],
    ["consegne.js", "/api/consegne", 15_000, "lista-consegne"]
]) {
    test(`${page} polls by version, forces full refreshes, and pauses while hidden`, async () => {
        const scriptPath = path.join(__dirname, "../src/main/resources/static", page);
        const state = createPageContext(fs.readFileSync(scriptPath, "utf8"));
        await flushPagePromises();

        assert.equal(state.requests.filter(url => url === "/api/menu").length, 1);
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 1);
        assert.doesNotMatch(state.requests.find(url => url.startsWith(endpoint)), /versione=/);
        assert.deepEqual([...state.intervals.values()].map(timer => timer.delay), [interval]);

        const beforeUnchangedPoll = state.renderCounts.get(listId) || 0;
        await [...state.intervals.values()][0].callback();
        assert.match(state.requests.filter(url => url.startsWith(endpoint))[1], /versione=4/);
        assert.equal(state.renderCounts.get(listId) || 0, beforeUnchangedPoll);

        state.advance(120_000);
        await [...state.intervals.values()][0].callback();
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 3);
        assert.doesNotMatch(state.requests.filter(url => url.startsWith(endpoint))[2], /versione=/);

        state.element("data").value = "2026-11-18";
        for (const listener of state.elementListeners.get("data")?.get("change") || []) listener();
        await flushPagePromises();
        assert.doesNotMatch(state.requests.filter(url => url.startsWith(endpoint))[3], /versione=/);

        for (const listener of state.elementListeners.get("aggiorna")?.get("click") || []) listener();
        await flushPagePromises();
        assert.doesNotMatch(state.requests.filter(url => url.startsWith(endpoint))[4], /versione=/);

        state.document.visibilityState = "hidden";
        for (const listener of state.listeners.get("visibilitychange") || []) listener();
        await flushPagePromises();
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 5);
        assert.equal(state.intervals.size, 0);

        state.document.visibilityState = "visible";
        for (const listener of state.listeners.get("visibilitychange") || []) listener();
        await flushPagePromises();
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 6);
        assert.doesNotMatch(state.requests.filter(url => url.startsWith(endpoint))[5], /versione=/);
        assert.equal(state.requests.filter(url => url === "/api/menu").length, 1);
        assert.deepEqual([...state.intervals.values()].map(timer => timer.delay), [interval]);
    });
}

test("gestionale always polls while visible and pauses only while hidden", async () => {
    const scriptPath = path.join(__dirname, "../src/main/resources/static/gestionale.js");
    const state = createPageContext(fs.readFileSync(scriptPath, "utf8"));
    await flushPagePromises();
    assert.equal(state.intervals.size, 1);
    assert.doesNotMatch(fs.readFileSync(scriptPath, "utf8"), /autoAggiorna/);

    state.document.visibilityState = "hidden";
    for (const listener of state.listeners.get("visibilitychange") || []) listener();
    assert.equal(state.intervals.size, 0);
    state.document.visibilityState = "visible";
    for (const listener of state.listeners.get("visibilitychange") || []) listener();
    await flushPagePromises();

    const orderRequests = state.requests.filter(url => url.startsWith("/api/ordini"));
    assert.equal(orderRequests.length, 2);
    assert.doesNotMatch(orderRequests[1], /versione=/);
    assert.equal(state.intervals.size, 1);
});

test("delivery accounts do not request the staff-only menu API", async () => {
    const scriptPath = path.join(__dirname, "../src/main/resources/static/consegne.js");
    const state = createPageContext(fs.readFileSync(scriptPath, "utf8"), {
        admin: false,
        staff: false,
        delivery: true
    });
    await flushPagePromises();

    assert.equal(state.requests.filter(url => url === "/api/menu").length, 0);
    assert.equal(state.requests.filter(url => url.startsWith("/api/consegne")).length, 1);
});
