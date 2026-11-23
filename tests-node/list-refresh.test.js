const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createPageContext(pageScript, currentAccount = { admin: true, staff: false, delivery: false }) {
    const elements = new Map();
    const listeners = new Map();
    const elementListeners = new Map();
    const requests = [];
    const intervals = new Map();
    const renderCounts = new Map();
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
                insertAdjacentHTML() {
                    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
                },
                replaceChildren() {
                    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
                },
                className: "",
                value: "",
            };
            Object.defineProperty(value, "innerHTML", {
                get() { return ""; },
                set() {
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
            orderCard: { bindReprints() {}, bindDateFilter() {}, render() { return ""; } }
        },
        fetch: async url => {
            requests.push(String(url));
            const body = String(url).startsWith("/api/menu")
                ? []
                : String(url).includes("versione=")
                    ? { invariato: true, versione: 4 }
                    : { versione: 4, ordini: [] };
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
        element,
        advance(milliseconds) {
            clock += milliseconds;
        }
    };
}

async function flushPagePromises() {
    await new Promise(resolve => setImmediate(resolve));
}

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
