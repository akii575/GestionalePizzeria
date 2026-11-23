const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const { publicOrder } = require("../lib/orders");
const { apiRoute } = require("./api-router-helper");

function createDatabase(initialOrder, initialVersion = 0) {
    let order = { ...initialOrder };
    let version = initialVersion;
    const writes = [];
    const orderRef = { collectionName: "orders", id: "7" };
    const versionRef = { collectionName: "metadata", id: "ordersVersion" };
    const database = {
        collection(name) {
            if (name === "orders") return { doc: () => orderRef };
            if (name === "metadata") return { doc: () => versionRef };
            if (name === "printerJobs") return { doc: () => ({ collectionName: name }) };
            throw new Error(`Unexpected collection: ${name}`);
        },
        async runTransaction(callback) {
            return callback({
                async get(reference) {
                    if (reference !== orderRef) throw new Error("Unexpected document read.");
                    return { exists: true, data: () => ({ ...order }) };
                },
                update(reference, update) {
                    if (reference !== orderRef) throw new Error("Unexpected document update.");
                    writes.push({ collection: reference.collectionName, update });
                    order = { ...order, ...update };
                },
                set(reference, value) {
                    if (reference !== versionRef) throw new Error("Unexpected document write.");
                    writes.push({ collection: reference.collectionName, value });
                    const increment = value.versione;
                    version += increment?.constructor?.name === "NumericIncrementTransform"
                        ? increment.operand
                        : Number(increment) || 0;
                }
            });
        }
    };
    return {
        database,
        writes,
        order: () => order,
        version: () => version
    };
}

function invoke(handler, role, body, headers = {}) {
    return new Promise(resolve => {
        const response = {
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(value) {
                this.body = value;
                resolve(this);
                return this;
            },
            setHeader() {}
        };
        handler({
            method: "PATCH",
            query: { numero: "7" },
            headers: {
                "x-test-role": role,
                origin: "https://pizzeria.example",
                host: "pizzeria.example",
                ...headers
            },
            body
        }, response);
    });
}

test("delivery status PATCH is role-scoped, versioned, and does not enqueue printing", async t => {
    const roles = {
        admin: { admin: true },
        staff: { staff: true },
        delivery: { delivery: true }
    };
    let state = createDatabase({
        numero: 7,
        tipo: "consegna",
        totale: 18,
        statoPagamento: "non_pagato",
        stampaCompletata: true,
        stampaInCoda: false
    });
    t.mock.method(auth, "requireDeliveryAccess", async req => roles[req.headers["x-test-role"]]);
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db: state.database }));
    const handler = apiRoute("ordini/7");

    assert.equal(publicOrder(state.order()).statoConsegna, "da_consegnare");

    let response = await invoke(handler, "admin", { statoConsegna: "in_consegna" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.statoConsegna, "in_consegna");
    assert.equal(state.version(), 1);

    response = await invoke(handler, "staff", { statoConsegna: "consegnata" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.statoConsegna, "consegnata");
    assert.ok(Number.isFinite(Date.parse(response.body.consegnataAlle)));
    assert.equal(state.version(), 2);

    response = await invoke(handler, "delivery", { statoConsegna: "in_consegna" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.statoConsegna, "in_consegna");
    assert.equal(response.body.consegnataAlle, undefined);
    assert.equal(state.order().totale, 18);
    assert.equal(state.order().statoPagamento, "non_pagato");
    assert.equal(state.order().stampaCompletata, true);
    assert.equal(state.order().stampaInCoda, false);
    assert.equal(state.version(), 3);
    assert.ok(state.writes.every(write => write.collection !== "printerJobs"));

    state = createDatabase({
        numero: 7,
        tipo: "consegna",
        totale: 18,
        statoConsegna: "da_consegnare",
        statoPagamento: "non_pagato"
    });
    response = await invoke(handler, "delivery", {
        statoConsegna: "in_consegna",
        statoPagamento: "pagato"
    });
    assert.equal(response.statusCode, 403);
    assert.equal(state.order().statoConsegna, "da_consegnare");
    assert.equal(state.order().statoPagamento, "non_pagato");
    assert.equal(state.version(), 0);

    response = await invoke(handler, "delivery", { statoPagamento: "pagato" });
    assert.equal(response.statusCode, 403);
    assert.equal(state.version(), 0);

    response = await invoke(handler, "staff", { statoConsegna: "in_arrivo" });
    assert.equal(response.statusCode, 400);
    assert.equal(state.version(), 0);

    state = createDatabase({ numero: 7, tipo: "ritiro" });
    response = await invoke(handler, "admin", { statoConsegna: "consegnata" });
    assert.equal(response.statusCode, 400);
    assert.equal(state.version(), 0);

    state = createDatabase({ numero: 7, tipo: "consegna" });
    response = await invoke(handler, "delivery", { statoConsegna: "consegnata" }, {
        origin: "https://attacker.example"
    });
    assert.equal(response.statusCode, 403);
    assert.equal(state.version(), 0);
});
