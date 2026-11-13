const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createPageContext(pageScript, currentAccount = { admin: true, staff: false, delivery: false }) {
    const elements = new Map();
    const listeners = new Map();
    const requests = [];
    const intervals = new Map();
    let nextIntervalId = 0;

    function element(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                addEventListener() {},
                querySelectorAll() { return []; },
                insertAdjacentHTML() {},
                replaceChildren() {},
                className: "",
                value: "",
                checked: id === "autoAggiorna"
            });
        }
        return elements.get(id);
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
            orderCard: { bindReprints() {}, render() { return ""; } }
        },
        fetch: async url => {
            requests.push(String(url));
            return { ok: true, async json() { return []; } };
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
        Date,
        Promise,
        URLSearchParams,
        Set
    };

    vm.runInNewContext(pageScript, context);
    return {
        document,
        intervals,
        listeners,
        requests
    };
}

async function flushPagePromises() {
    await new Promise(resolve => setImmediate(resolve));
}

for (const [page, endpoint, interval] of [
    ["gestionale.js", "/api/ordini", 15_000],
    ["consegne.js", "/api/consegne", 30_000]
]) {
    test(`${page} loads the menu once and pauses refresh while hidden`, async () => {
        const scriptPath = path.join(__dirname, "../src/main/resources/static", page);
        const state = createPageContext(fs.readFileSync(scriptPath, "utf8"));
        await flushPagePromises();

        assert.equal(state.requests.filter(url => url === "/api/menu").length, 1);
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 1);
        assert.deepEqual([...state.intervals.values()].map(timer => timer.delay), [interval]);

        state.document.visibilityState = "hidden";
        for (const listener of state.listeners.get("visibilitychange") || []) listener();
        await flushPagePromises();
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 1);
        assert.equal(state.intervals.size, 0);

        state.document.visibilityState = "visible";
        for (const listener of state.listeners.get("visibilitychange") || []) listener();
        await flushPagePromises();
        assert.equal(state.requests.filter(url => url.startsWith(endpoint)).length, 2);
        assert.equal(state.requests.filter(url => url === "/api/menu").length, 1);
        assert.deepEqual([...state.intervals.values()].map(timer => timer.delay), [interval]);
    });
}

test("delivery accounts do not request the staff-only menu API", async () => {
    const scriptPath = path.join(__dirname, "../src/main/resources/static/consegne.js");
    const state = createPageContext(fs.readFileSync(scriptPath, "utf8"), {
        admin: false,
        staff: false,
        delivery: true
    });
    await flushPagePromises();

    assert.equal(state.requests.filter(url => url === "/api/menu").length, 0);
    assert.equal(state.requests.filter(url => url === "/api/consegne").length, 1);
});
