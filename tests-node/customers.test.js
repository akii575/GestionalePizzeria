const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const menuStore = require("../lib/menu-store");
const { apiRoute } = require("./api-router-helper");
const {
    normalizeCustomerPhone,
    normalizeCustomerAddress,
    customerProfileForOrder
} = require("../lib/customers");
const { backfillCustomerAddresses } = require("../scripts/backfill-clienti");

function createResponse() {
    return {
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        },
        end() {
            return this;
        }
    };
}

async function invoke(handler, request) {
    const response = createResponse();
    await handler(request, response);
    return response;
}

function createOrderDatabase({ order = null, customer = null } = {}) {
    const writes = [];
    const doc = (collection, id) => ({ kind: "doc", collection, id });
    const db = {
        collection(name) {
            return {
                doc(id) {
                    return doc(name, id);
                },
                where(field, operator, value) {
                    return { kind: "query", collection: name, field, operator, value };
                }
            };
        },
        async runTransaction(callback) {
            const transaction = {
                async get(reference) {
                    if (reference.kind === "query") return { docs: [] };
                    const value = reference.collection === "metadata"
                        ? reference.id === "orderCounter"
                            ? { value: 3 }
                            : undefined
                        : reference.collection === "orders"
                            ? order
                            : reference.collection === "clienti"
                                ? customer
                                : undefined;
                    return { exists: value !== null && typeof value !== "undefined", data: () => value };
                },
                set(reference, value, options) {
                    writes.push({ reference, value, options });
                },
                update(reference, value) {
                    writes.push({ reference, value, update: true });
                },
                delete(reference) {
                    writes.push({ reference, delete: true });
                }
            };
            return callback(transaction);
        }
    };
    return { db, writes };
}

const catalog = {
    allProducts: [{
        nome: "Margherita",
        categoria: "pizze",
        prezzo: 5,
        ingredienti: ["Pomodoro"],
        ammetteExtra: true,
        disponibile: true
    }],
    allExtras: [{ id: "bufala", nome: "Bufala", prezzo: 2, disponibile: true }]
};

test("customer phone normalization strips Italian prefixes and rejects short numbers", () => {
    assert.equal(normalizeCustomerPhone("+39 333 123 4567"), "3331234567");
    assert.equal(normalizeCustomerPhone("0039333 123 4567"), "3331234567");
    assert.equal(normalizeCustomerPhone("333-1234567"), "3331234567");
    assert.equal(normalizeCustomerPhone("12345"), null);
});

test("customer address normalization removes accents and extra whitespace", () => {
    assert.equal(normalizeCustomerAddress("  VIA   DE Sànctis 7/F  "), "via de sanctis 7/f");
    assert.equal(normalizeCustomerAddress(null), null);
});

test("customer profiles group order rows by product and extras and omit table cover", () => {
    const profile = customerProfileForOrder({
        tipo: "consegna",
        telefonoConsegna: "+39 333 123 4567",
        indirizzoConsegna: "Via Roma 1",
        coperto: { totale: 4 },
        righe: [
            { prodotto: "Margherita", extra: [{ nome: "Bufala" }, { nome: "Olive" }] },
            { prodotto: "Margherita", extra: [{ nome: "Olive" }, { nome: "Bufala" }] },
            { prodotto: "Margherita", extra: [{ nome: "Bufala" }] },
            { prodotto: "Margherita", extra: [] }
        ]
    }, "2026-11-22T18:00:00.000Z");

    assert.equal(profile.telefono, "3331234567");
    assert.equal(profile.indirizzo, "Via Roma 1");
    assert.equal(profile.indirizzoRicerca, "via roma 1");
    assert.equal("nome" in profile, false);
    assert.deepEqual(profile.ultimoOrdine, {
        data: "2026-11-22T18:00:00.000Z",
        tipo: "consegna",
        righe: [
            { prodotto: "Margherita", quantita: 2, extra: ["Bufala", "Olive"], senza: [] },
            { prodotto: "Margherita", quantita: 1, extra: ["Bufala"], senza: [] },
            { prodotto: "Margherita", quantita: 1, extra: [], senza: [] }
        ]
    });
    assert.equal("coperto" in profile, false);
    assert.equal(customerProfileForOrder({
        tipo: "ritiro",
        telefonoRitiro: "12345",
        righe: []
    }, "2026-11-22T18:00:00.000Z"), null);
});

test("customer repeat orders save removed ingredients and keep them separate from normal rows", () => {
    const profile = customerProfileForOrder({
        tipo: "ritiro",
        telefonoRitiro: "3331234567",
        righe: [
            { prodotto: "Margherita", extra: [], senza: [] },
            { prodotto: "Margherita", extra: [], senza: ["Basilico"] },
            { prodotto: "Margherita", extra: [], senza: ["Basilico"] }
        ]
    }, "2026-11-22T18:00:00.000Z");

    assert.deepEqual(profile.ultimoOrdine.righe, [
        { prodotto: "Margherita", quantita: 1, extra: [], senza: [] },
        { prodotto: "Margherita", quantita: 2, extra: [], senza: ["Basilico"] }
    ]);
});

test("customer profiles keep at most 30 distinct product and extra combinations", () => {
    const righe = Array.from({ length: 31 }, (_, indice) => ({
        prodotto: `Prodotto ${indice}`,
        extra: []
    }));
    const profile = customerProfileForOrder({
        tipo: "ritiro",
        telefonoRitiro: "3331234567",
        tavoloOCliente: "Anna Rossi",
        righe
    }, "2026-11-22T18:00:00.000Z");

    assert.equal(profile.nome, "Anna Rossi");
    assert.equal(profile.ultimoOrdine.righe.length, 30);
});

test("customer address lookup normalizes a prefix, limits results and rejects riders", async t => {
    const whereCalls = [];
    let resultLimit = 0;
    let readCount = 0;
    t.mock.method(auth, "requireStaffAccess", async req => {
        if (req.headers.role === "delivery") {
            const error = new Error("Accesso negato.");
            error.statusCode = 403;
            throw error;
        }
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({
        db: {
            collection(name) {
                assert.equal(name, "clienti");
                return {
                    where(field, operator, value) {
                        whereCalls.push([field, operator, value]);
                        return this;
                    },
                    limit(value) {
                        resultLimit = value;
                        return this;
                    },
                    async get() {
                        readCount++;
                        return {
                            docs: [{
                                id: "3331234567",
                                data: () => ({
                                    indirizzo: "Via De Sanctis 7/F",
                                    ordiniTotali: 3,
                                    ultimoOrdine: { tipo: "consegna", righe: [] }
                                })
                            }]
                        };
                    }
                };
            }
        }
    }));

    const handler = apiRoute("clienti");
    const response = await invoke(handler, {
        method: "GET",
        headers: { role: "staff" },
        query: { indirizzo: "  VIA   DE Sànctis " }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.deepEqual(whereCalls, [
        ["indirizzoRicerca", ">=", "via de sanctis"],
        ["indirizzoRicerca", "<=", "via de sanctis\uf8ff"]
    ]);
    assert.equal(resultLimit, 5);
    assert.deepEqual(response.body, {
        risultati: [{
            telefono: "3331234567",
            indirizzo: "Via De Sanctis 7/F",
            ordiniTotali: 3,
            ultimoOrdine: { tipo: "consegna", righe: [] }
        }]
    });

    const invalid = await invoke(handler, {
        method: "GET",
        headers: { role: "staff" },
        query: { indirizzo: " à " }
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(readCount, 1);

    const blocked = await invoke(handler, {
        method: "GET",
        headers: { role: "delivery" },
        query: { indirizzo: "Via" }
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(readCount, 1);
});

test("customer address backfill dry run calculates missing keys without writing", async () => {
    const updates = [];
    let commits = 0;
    const docs = [
        { id: "3331234567", ref: "one", data: () => ({ indirizzo: "Via   Roma 1" }) },
        { id: "3337654321", ref: "two", data: () => ({ indirizzo: "Città Alta 2" }) },
        { id: "3331111111", ref: "three", data: () => ({ nome: "Anna" }) }
    ];
    const db = {
        collection(name) {
            assert.equal(name, "clienti");
            return {
                orderBy() {
                    return {
                        limit() {
                            return this;
                        },
                        async get() {
                            return { docs };
                        }
                    };
                }
            };
        },
        batch() {
            return {
                update(...args) {
                    updates.push(args);
                },
                async commit() {
                    commits++;
                }
            };
        }
    };

    const summary = await backfillCustomerAddresses({ db, dryRun: true, log() {} });
    assert.deepEqual(summary, { processed: 3, updated: 2 });
    assert.deepEqual(updates, []);
    assert.equal(commits, 0);
});

test("customer lookup is staff-only, normalizes the phone and reads one document", async t => {
    let readCount = 0;
    let readId = "";
    const authCalls = [];
    t.mock.method(auth, "requireStaffAccess", async req => {
        authCalls.push(req.headers.role);
        if (req.headers.role === "delivery") {
            const error = new Error("Accesso negato.");
            error.statusCode = 403;
            throw error;
        }
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({
        db: {
            collection(name) {
                assert.equal(name, "clienti");
                return {
                    doc(id) {
                        readId = id;
                        return {
                            async get() {
                                readCount++;
                                return {
                                    exists: true,
                                    data: () => ({
                                        indirizzo: "Via Roma 1",
                                        nome: "Anna",
                                        ultimoOrdine: { tipo: "ritiro", righe: [] },
                                        ordiniTotali: 4
                                    })
                                };
                            }
                        };
                    }
                };
            }
        }
    }));

    const handler = apiRoute("clienti");
    const request = role => ({
        method: "GET",
        headers: { role },
        query: { telefono: "+39 333 123 4567" }
    });
    const response = await invoke(handler, request("staff"));
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(readId, "3331234567");
    assert.equal(readCount, 1);
    assert.deepEqual(response.body, {
        trovato: true,
        indirizzo: "Via Roma 1",
        nome: "Anna",
        ultimoOrdine: { tipo: "ritiro", righe: [] },
        ordiniTotali: 4
    });

    const blocked = await invoke(handler, request("delivery"));
    assert.equal(blocked.statusCode, 403);
    assert.equal(readCount, 1);
    assert.deepEqual(authCalls, ["staff", "delivery"]);
});

test("customer lookup rejects invalid numbers and returns a not-found response", async t => {
    let readCount = 0;
    t.mock.method(auth, "requireStaffAccess", async () => {});
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({
        db: {
            collection() {
                return {
                    doc() {
                        return {
                            async get() {
                                readCount++;
                                return { exists: false };
                            }
                        };
                    }
                };
            }
        }
    }));

    const handler = apiRoute("clienti");
    const invalid = await invoke(handler, {
        method: "GET",
        headers: {},
        query: { telefono: "12345" }
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(readCount, 0);

    const notFound = await invoke(handler, {
        method: "GET",
        headers: {},
        query: { telefono: "333-1234567" }
    });
    assert.equal(notFound.statusCode, 200);
    assert.deepEqual(notFound.body, { trovato: false });
    assert.equal(readCount, 1);
});

test("creating a delivery order updates the customer inside its order transaction", async t => {
    const { db, writes } = createOrderDatabase();
    t.mock.method(auth, "requireStaffAccess", async () => {});
    t.mock.method(auth, "requireSameOrigin", req => {
        assert.equal(req.headers.origin, "https://pizzeria.example");
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    t.mock.method(menuStore, "getMenuData", async () => catalog);

    const handler = apiRoute("ordini");
    const response = await invoke(handler, {
        method: "POST",
        headers: { origin: "https://pizzeria.example", host: "pizzeria.example" },
        body: {
            tipo: "consegna",
            orario: "20:30",
            indirizzoConsegna: "Via Roma 1",
            telefonoConsegna: "+39 333 123 4567",
            righe: [
                { prodotto: "Margherita", extra: ["bufala"] },
                { prodotto: "Margherita", extra: ["bufala"] }
            ]
        }
    });

    assert.equal(response.statusCode, 201);
    const customerWrite = writes.find(write => write.reference.collection === "clienti");
    assert.ok(customerWrite);
    assert.equal(customerWrite.reference.id, "3331234567");
    assert.equal(customerWrite.value.indirizzo, "Via Roma 1");
    assert.equal(customerWrite.value.indirizzoRicerca, "via roma 1");
    assert.equal("nome" in customerWrite.value, false);
    assert.equal(customerWrite.value.ordiniTotali.operand, 1);
    assert.deepEqual(customerWrite.value.ultimoOrdine.righe, [{
        prodotto: "Margherita",
        quantita: 2,
        extra: ["Bufala"],
        senza: []
    }]);
    assert.equal(customerWrite.value.ultimoOrdine.data, response.body.dataOra);
    assert.equal("coperto" in customerWrite.value, false);
    assert.equal(customerWrite.options.merge, true);
    assert.ok(writes.some(write => write.reference.collection === "orders"));
});

test("editing an order refreshes customer details without incrementing its order count", async t => {
    const existingOrder = {
        numero: 7,
        tipo: "consegna",
        dataOra: "2026-11-20T18:00:00.000Z",
        righe: [{ prodotto: "Margherita" }],
        stampaCompletata: false,
        stampaInCoda: false,
        messaggioStampa: "Ordine salvato.",
        totale: 5,
        statoPagamento: "non_pagato"
    };
    const { db, writes } = createOrderDatabase({
        order: existingOrder,
        customer: { ordiniTotali: 5 }
    });
    t.mock.method(auth, "requireStaffAccess", async () => {});
    t.mock.method(auth, "requireSameOrigin", () => {});
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    t.mock.method(menuStore, "getMenuData", async () => catalog);

    const handler = apiRoute("ordini/7");
    const response = await invoke(handler, {
        method: "PUT",
        headers: { origin: "https://pizzeria.example", host: "pizzeria.example" },
        query: { numero: "7" },
        body: {
            tipo: "ritiro",
            orario: "20:30",
            tavoloOCliente: "Anna Rossi",
            telefonoRitiro: "333-1234567",
            righe: [{ prodotto: "Margherita" }]
        }
    });

    assert.equal(response.statusCode, 200);
    const customerWrite = writes.find(write => write.reference.collection === "clienti");
    assert.ok(customerWrite);
    assert.equal(customerWrite.reference.id, "3331234567");
    assert.equal(customerWrite.value.nome, "Anna Rossi");
    assert.equal("indirizzo" in customerWrite.value, false);
    assert.equal(customerWrite.value.ordiniTotali, 5);
    assert.equal(customerWrite.value.ultimoOrdine.data, existingOrder.dataOra);
    assert.equal(customerWrite.value.ultimoOrdine.tipo, "ritiro");
});

test("editing an older order preserves the customer's newer last order", async t => {
    const existingOrder = {
        numero: 7,
        tipo: "consegna",
        dataOra: "2026-11-20T18:00:00.000Z",
        righe: [{ prodotto: "Margherita" }],
        stampaCompletata: false,
        stampaInCoda: false,
        messaggioStampa: "Ordine salvato.",
        totale: 5,
        statoPagamento: "non_pagato"
    };
    const ultimoOrdine = {
        data: "2026-11-21T18:00:00.000Z",
        tipo: "consegna",
        righe: [{ prodotto: "Margherita", quantita: 2, extra: [] }]
    };
    const { db, writes } = createOrderDatabase({
        order: existingOrder,
        customer: { ordiniTotali: 5, ultimoOrdine }
    });
    t.mock.method(auth, "requireStaffAccess", async () => {});
    t.mock.method(auth, "requireSameOrigin", () => {});
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    t.mock.method(menuStore, "getMenuData", async () => catalog);

    const handler = apiRoute("ordini/7");
    const response = await invoke(handler, {
        method: "PUT",
        headers: { origin: "https://pizzeria.example", host: "pizzeria.example" },
        query: { numero: "7" },
        body: {
            tipo: "consegna",
            orario: "20:30",
            indirizzoConsegna: "Via aggiornata 1",
            telefonoConsegna: "333-1234567",
            righe: [{ prodotto: "Margherita" }]
        }
    });

    assert.equal(response.statusCode, 200);
    const customerWrite = writes.find(write => write.reference.collection === "clienti");
    assert.ok(customerWrite);
    assert.equal(customerWrite.value.indirizzo, "Via aggiornata 1");
    assert.deepEqual(customerWrite.value.ultimoOrdine, ultimoOrdine);
    assert.equal(customerWrite.value.ordiniTotali, 5);
});
