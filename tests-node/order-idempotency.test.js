const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const menuStore = require("../lib/menu-store");
const { apiRoute } = require("./api-router-helper");

function createStore() {
    const documents = new Map();
    const reference = (collection, id) => ({ path: `${collection}/${id}` });
    const db = {
        collection(name) {
            return { doc: id => reference(name, id) };
        },
        async runTransaction(callback) {
            const writes = [];
            const transaction = {
                async get(target) {
                    const value = documents.get(target.path);
                    return { exists: typeof value !== "undefined", data: () => value };
                },
                set(target, value) {
                    writes.push(() => documents.set(target.path, value));
                }
            };
            const result = await callback(transaction);
            writes.forEach(write => write());
            return result;
        }
    };
    return { db, documents };
}

function invoke(handler, body) {
    return new Promise(resolve => {
        const response = {
            headers: {},
            status(code) { this.statusCode = code; return this; },
            json(value) { this.body = value; resolve(this); return this; },
            setHeader(name, value) { this.headers[name] = value; }
        };
        handler({ method: "POST", headers: {}, query: {}, body }, response);
    });
}

const catalog = {
    allProducts: [{ nome: "Margherita", categoria: "pizze", prezzo: 5, ingredienti: [], ammetteExtra: true, disponibile: true }],
    allExtras: []
};

function keys(documents, collection) {
    return [...documents.keys()].filter(key => key.startsWith(`${collection}/`));
}

test("repeating an order with the same idempotency key returns the first order without a second print", async t => {
    const { db, documents } = createStore();
    t.mock.method(auth, "requireStaffAccess", async () => ({ staff: true }));
    t.mock.method(auth, "requireSameOrigin", () => {});
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    t.mock.method(menuStore, "getMenuData", async () => catalog);
    const handler = apiRoute("ordini");

    const body = {
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 2,
        righe: [{ prodotto: "Margherita" }],
        idempotencyKey: "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a1b"
    };
    const first = await invoke(handler, body);
    const retry = await invoke(handler, body);

    assert.equal(first.statusCode, 201);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.numero, first.body.numero);
    assert.equal(keys(documents, "orders").length, 1);
    assert.equal(keys(documents, "printerJobs").length, 1);

    const next = await invoke(handler, { ...body, idempotencyKey: "7c9e6679-7425-40de-944b-e07fc1f90ae7" });
    assert.equal(next.statusCode, 201);
    assert.equal(next.body.numero, first.body.numero + 1);

    const invalid = await invoke(handler, { ...body, idempotencyKey: "non-valida" });
    assert.equal(invalid.statusCode, 400);
    assert.equal(keys(documents, "orders").length, 2);
});
