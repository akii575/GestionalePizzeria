const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidPrinterSelection, jobId } = require("../lib/printer-jobs");
const { apiRoute } = require("./api-router-helper");
const menu = require("../lib/menu.json");
const extras = require("../lib/extras.json");
const extraCategories = new Set(["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"]);
const testCatalog = {
    menu: menu.filter(product => product.nome.trim().toLocaleLowerCase("it-IT") !== "coperto").map(product => ({
        ...product,
        categoriaId: product.categoria,
        ammetteExtra: extraCategories.has(product.categoria),
        disponibile: true
    })),
    extras: extras.map(extra => ({ ...extra, disponibile: true }))
};
let catalogForApi = testCatalog;

const authPath = require.resolve("../lib/auth");
const firebasePath = require.resolve("../lib/firebase-admin");
const menuStorePath = require.resolve("../lib/menu-store");
let database;

require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
        httpError(statusCode, message) {
            const error = new Error(message);
            error.statusCode = statusCode;
            return error;
        },
        requireStaffAccess: async () => {},
        requireDeliveryAccess: async () => ({}),
        requireSameOrigin: () => {}
    }
};
require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { getFirebaseServices: () => ({ db: database }) }
};
require.cache[menuStorePath] = {
    id: menuStorePath,
    filename: menuStorePath,
    loaded: true,
    exports: { getMenuData: async () => catalogForApi }
};

const { prepareOrder: validateOrder } = require("../lib/orders");
function prepareOrder(input) {
    return validateOrder(input, testCatalog);
}
const resetHandler = apiRoute("reset-numeri");
const ordersIndexHandler = apiRoute("ordini");
const orderHandler = apiRoute("ordini/7");

function createDatabase(seed = {}, { failQueueUnpause = 0 } = {}) {
    let remainingUnpauseFailures = failQueueUnpause;
    const collections = new Map(
        Object.entries(seed).map(([name, documents]) => [name, new Map(Object.entries(documents))])
    );
    const documents = name => {
        if (!collections.has(name)) collections.set(name, new Map());
        return collections.get(name);
    };
    const ref = (name, id) => ({
        collectionName: name,
        id: String(id),
        async get() {
            const value = documents(name).get(String(id));
            return { exists: value !== undefined, data: () => value };
        },
        async set(value, options = {}) {
            const current = documents(name).get(String(id)) || {};
            const entries = Object.entries(value).map(([field, nextValue]) => [
                field,
                nextValue?.constructor?.name === "NumericIncrementTransform"
                    ? (Number(current[field]) || 0) + nextValue.operand
                    : nextValue
            ]);
            documents(name).set(String(id), {
                ...(options.merge ? current : {}),
                ...Object.fromEntries(entries)
            });
        },
        async update(value) {
            documents(name).set(String(id), { ...documents(name).get(String(id)), ...value });
        },
        async delete() {
            documents(name).delete(String(id));
        }
    });
    const querySnapshot = (name, entries) => ({
        empty: entries.length === 0,
        docs: entries.map(([id, value]) => ({
            ref: ref(name, id),
            data: () => value
        }))
    });
    const collection = name => ({
        doc: id => ref(name, id),
        limit: size => ({
            async get() {
                return querySnapshot(name, [...documents(name).entries()].slice(0, size));
            }
        }),
        where(field, operator, value) {
            assert.equal(operator, "==");
            let size = Infinity;
            const query = {
                limit(limit) {
                    size = limit;
                    return query;
                },
                async get() {
                    const entries = [...documents(name).entries()]
                        .filter(([, data]) => data[field] === value)
                        .slice(0, size);
                    return querySnapshot(name, entries);
                }
            };
            return query;
        }
    });
    return {
        collection,
        batch() {
            const operations = [];
            return {
                delete(documentRef) {
                    operations.push(() => documentRef.delete());
                },
                set(documentRef, value, options) {
                    operations.push(() => documentRef.set(value, options));
                },
                async commit() {
                    await Promise.all(operations.map(operation => operation()));
                }
            };
        },
        async runTransaction(callback) {
            return callback({
                get: documentRef => documentRef.get(),
                set: (documentRef, value, options) => {
                    if (documentRef.collectionName === "metadata" && documentRef.id === "printerControl"
                            && value.paused === false && remainingUnpauseFailures > 0) {
                        remainingUnpauseFailures--;
                        const error = new Error("deadline exceeded");
                        error.code = 4;
                        throw error;
                    }
                    return documentRef.set(value, options);
                },
                update: (documentRef, value) => documentRef.update(value),
                delete: documentRef => documentRef.delete()
            });
        },
        documents
    };
}

async function invoke(handler, method, query = {}, body = {}) {
    const response = {
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        end() {
            return this;
        },
        setHeader() {}
    };
    await handler({ method, query, headers: {}, body }, response);
    return response;
}

function lease(expiresAt) {
    return { toMillis: () => expiresAt };
}

test("individual order GET returns the public order and reports missing numbers", async () => {
    database = createDatabase({
        orders: { "7": storedOrder({ righe: [{ prodotto: "Margherita" }] }) }
    });

    const response = await invoke(orderHandler, "GET", { numero: "7" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.numero, 7);
    assert.equal(response.body.righe[0].prodotto, "Margherita");

    database = createDatabase();
    const missing = await invoke(orderHandler, "GET", { numero: "7" });
    assert.equal(missing.statusCode, 404);
});

function storedOrder(input, overrides = {}) {
    return {
        ...prepareOrder({
            tipo: "tavolo",
            tavoloOCliente: "Tavolo 7",
            righe: [],
            ...input
        }),
        numero: 7,
        dataOra: "2026-10-12T12:00:00.000Z",
        stampaCompletata: true,
        stampaInCoda: false,
        ...overrides
    };
}

function updateOrderBody(input) {
    return {
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 7",
        ...input
    };
}

test("order update recalculates the automatic cover from the new guest count", async () => {
    const previousCatalog = catalogForApi;
    catalogForApi = {
        ...testCatalog,
        allProducts: [
            ...testCatalog.menu,
            { nome: "Coperto", prezzo: 2, disponibile: true, archiviato: false }
        ]
    };
    database = createDatabase({
        orders: {
            "7": storedOrder({
                numeroPersone: 4,
                righe: [{ prodotto: "Margherita" }]
            }, {
                coperto: { persone: 4, prezzoUnitario: 2, totale: 8 },
                totale: 13
            })
        }
    });

    try {
        const response = await invoke(orderHandler, "PUT", { numero: "7" }, updateOrderBody({
            numeroPersone: 6,
            righe: [{ prodotto: "Margherita" }]
        }));

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body.coperto, { persone: 6, prezzoUnitario: 2, totale: 12 });
        assert.equal(response.body.totale, 17);
    } finally {
        catalogForApi = previousCatalog;
    }
});

test("every order API mutation increments metadata/ordersVersion", async () => {
    const cases = [
        {
            name: "create",
            handler: ordersIndexHandler,
            method: "POST",
            query: {},
            body: {
                tipo: "tavolo",
                tavoloOCliente: "Tavolo 1",
                righe: [{ prodotto: "Margherita" }]
            },
            seed: { metadata: { ordersVersion: { versione: 4 }, orderCounter: { value: 0 } } }
        },
        {
            name: "edit",
            handler: orderHandler,
            method: "PUT",
            query: { numero: "7" },
            body: updateOrderBody({ righe: [{ prodotto: "Margherita" }] }),
            seed: {
                metadata: { ordersVersion: { versione: 4 } },
                orders: { "7": storedOrder({ righe: [{ prodotto: "Margherita" }] }) }
            }
        },
        {
            name: "payment",
            handler: orderHandler,
            method: "PATCH",
            query: { numero: "7" },
            body: { statoPagamento: "pagato" },
            seed: {
                metadata: { ordersVersion: { versione: 4 } },
                orders: { "7": { numero: 7, tipo: "ritiro", statoPagamento: "non_pagato" } }
            }
        },
        {
            name: "reprint",
            handler: orderHandler,
            method: "POST",
            query: { numero: "7" },
            body: { azione: "ristampa", stampanti: ["Cucina"] },
            seed: {
                metadata: { ordersVersion: { versione: 4 } },
                orders: { "7": { numero: 7, contatoreStampe: 0 } }
            }
        },
        {
            name: "delete",
            handler: orderHandler,
            method: "DELETE",
            query: { numero: "7" },
            body: {},
            seed: {
                metadata: { ordersVersion: { versione: 4 } },
                orders: { "7": { numero: 7 } }
            }
        },
        {
            name: "reset",
            handler: resetHandler,
            method: "POST",
            query: {},
            body: {},
            seed: {
                metadata: {
                    ordersVersion: { versione: 4 },
                    orderCounter: { value: 7 },
                    printerControl: { paused: false }
                },
                orders: { "7": { numero: 7 } }
            }
        }
    ];

    for (const entry of cases) {
        database = createDatabase(entry.seed);
        const response = await invoke(entry.handler, entry.method, entry.query, entry.body);
        assert.ok(response.statusCode < 400, `${entry.name} failed: ${response.body?.errore}`);
        assert.equal(
            database.documents("metadata").get("ordersVersion").versione,
            5,
            `${entry.name} did not increment ordersVersion`
        );
    }
});

test("print job IDs and printer selection validation use the shared format", () => {
    assert.equal(jobId(7), "000000000007");
    assert.equal(jobId(7, 1), "000000000007-01");
    assert.equal(jobId(7, 100), "000000000007-100");
    assert.equal(isValidPrinterSelection(["Cucina"]), true);
    assert.equal(isValidPrinterSelection(["Sala", "Cucina"]), true);
    assert.equal(isValidPrinterSelection([]), false);
    assert.equal(isValidPrinterSelection(["Cucina", "Forno"]), false);
    assert.equal(isValidPrinterSelection(["Cucina", "Cucina"]), false);
});

test("manual reprints create incremented jobs with a canonical printer selection", async () => {
    database = createDatabase({
        orders: {
            "7": { numero: 7, contatoreStampe: 0, stampaCompletata: true, stampaInCoda: false }
        }
    });

    const first = await invoke(orderHandler, "POST", { numero: "7" }, {
        azione: "ristampa",
        stampanti: ["Sala", "Cucina"]
    });
    const second = await invoke(orderHandler, "POST", { numero: "7" }, {
        azione: "ristampa",
        stampanti: ["Sala"]
    });

    assert.equal(first.statusCode, 202);
    assert.equal(first.body.messaggioStampa, "Ristampa in coda (Cucina e Sala)");
    assert.equal(second.statusCode, 202);
    assert.equal(second.body.messaggioStampa, "Ristampa in coda (Sala)");
    assert.equal(database.documents("orders").get("7").contatoreStampe, 2);
    const firstJob = database.documents("printerJobs").get("000000000007-01");
    assert.equal(firstJob.numero, 7);
    assert.equal(firstJob.tipoStampa, "ristampa");
    assert.deepEqual(firstJob.stampanti, ["Cucina", "Sala"]);
    assert.equal(firstJob.status, "queued");
    assert.ok(Number.isFinite(Date.parse(firstJob.createdAt)));
    assert.equal(firstJob.attemptCount, 0);
    assert.deepEqual(firstJob.printedPrinters, []);
    assert.equal(database.documents("printerJobs").get("000000000007-02").tipoStampa, "ristampa");
    assert.deepEqual(database.documents("printerJobs").get("000000000007-02").stampanti, ["Sala"]);
    assert.equal(database.documents("orders").get("7").stampaInCoda, true);
});

test("manual reprints reject invalid printer selections", async () => {
    database = createDatabase({ orders: { "7": { numero: 7 } } });

    const response = await invoke(orderHandler, "POST", { numero: "7" }, {
        azione: "ristampa",
        stampanti: ["Forno"]
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body.errore, /stampante valida/);
    assert.equal(database.documents("printerJobs").size, 0);
});

test("manual reprints reject a paused print queue", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        metadata: { printerControl: { paused: true, pausedUntil: Date.now() + 60_000 } }
    });

    const response = await invoke(orderHandler, "POST", { numero: "7" }, {
        azione: "ristampa",
        stampanti: ["Cucina"]
    });

    assert.equal(response.statusCode, 409);
    assert.equal(database.documents("printerJobs").size, 0);
});

test("expired printing leases do not block individual order deletion", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        printerJobs: {
            "000000000007": {
                numero: 7,
                status: "printing",
                leaseUntil: lease(Date.now() - 1)
            },
            "000000000007-01": {
                numero: 7,
                status: "queued"
            }
        }
    });

    const response = await invoke(orderHandler, "DELETE", { numero: "7" });

    assert.equal(response.statusCode, 204);
    assert.equal(database.documents("orders").has("7"), false);
    assert.equal(database.documents("printerJobs").has("000000000007"), false);
});

test("an actively leased secondary print job still blocks individual order deletion", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                status: "printing",
                leaseUntil: lease(Date.now() + 60_000)
            }
        }
    });

    const response = await invoke(orderHandler, "DELETE", { numero: "7" });

    assert.equal(response.statusCode, 409);
    assert.equal(database.documents("orders").has("7"), true);
    assert.equal(database.documents("printerJobs").has("000000000007-01"), true);
});

test("order updates reject a secondary print job even when its lease expired", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7, dataOra: "2026-10-12T12:00:00.000Z" } },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                status: "printing",
                leaseUntil: lease(Date.now() - 1)
            }
        }
    });

    const response = await invoke(orderHandler, "PUT", { numero: "7" }, {
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 7",
        righe: [{ prodotto: "Margherita" }]
    });

    assert.equal(response.statusCode, 409);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printing");
});

test("order updates preserve paid table state and keep queued main jobs as complete receipts", async () => {
    const chiusoAlle = "2026-10-12T12:30:00.000Z";
    database = createDatabase({
        orders: {
            "7": {
                ...storedOrder({ righe: [{ prodotto: "Margherita" }] }),
                tavoloChiuso: true,
                chiusoAlle
            }
        },
        printerJobs: {
            "000000000007": {
                numero: 7,
                status: "queued",
                tipoStampa: "completa",
                printedPrinters: ["Cucina"]
            }
        }
    });

    const response = await invoke(orderHandler, "PUT", { numero: "7" }, {
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 7",
        righe: [{ prodotto: "Margherita" }]
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.tavoloChiuso, true);
    assert.equal(response.body.chiusoAlle, chiusoAlle);
    assert.equal(database.documents("printerJobs").get("000000000007").tipoStampa, "completa");
    assert.equal(database.documents("printerJobs").get("000000000007").motivo, undefined);
    assert.deepEqual(database.documents("printerJobs").get("000000000007").printedPrinters, []);
});

test("editing a printed order queues only newly added rows", async () => {
    const oldOrder = storedOrder({ righe: [{ prodotto: "Margherita" }] });
    database = createDatabase({
        orders: { "7": oldOrder },
        printerJobs: {
            "000000000007": { numero: 7, status: "printed" }
        }
    });

    const response = await invoke(orderHandler, "PUT", { numero: "7" }, updateOrderBody({
        righe: [{ prodotto: "Margherita" }, { prodotto: "Patatine Piccole" }]
    }));

    const newJob = database.documents("printerJobs").get("000000000007-01");
    const expectedAddition = prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 7",
        righe: [{ prodotto: "Patatine Piccole" }]
    }).righe[0];
    expectedAddition.categoria = menu.find(product => product.nome === "Patatine Piccole").categoria;
    assert.equal(response.statusCode, 200);
    assert.equal(newJob.tipoStampa, "aggiunta");
    assert.equal(newJob.status, "queued");
    assert.deepEqual(newJob.righe, [expectedAddition]);
    assert.equal(Object.prototype.hasOwnProperty.call(newJob, "stampanti"), false);
    assert.equal(database.documents("orders").get("7").stampaInCoda, true);
    assert.equal(database.documents("orders").get("7").messaggioStampa, "Aggiunta in coda per la stampa.");
});

test("removing rows from a printed order queues a full reprint and cancels pending additions", async () => {
    database = createDatabase({
        orders: {
            "7": storedOrder({
                righe: [{ prodotto: "Margherita" }, { prodotto: "Patatine Piccole" }]
            }, { contatoreStampe: 1 })
        },
        printerJobs: {
            "000000000007": { numero: 7, status: "printed" },
            "000000000007-01": {
                numero: 7,
                status: "queued",
                tipoStampa: "aggiunta",
                righe: [{ prodotto: "Patatine Piccole" }]
            }
        }
    });

    const response = await invoke(orderHandler, "PUT", { numero: "7" }, updateOrderBody({
        righe: [{ prodotto: "Margherita" }]
    }));

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    const reprint = database.documents("printerJobs").get("000000000007-02");
    const pendingAddition = database.documents("printerJobs").get("000000000007-01");
    assert.equal(reprint.tipoStampa, "ristampa");
    assert.equal(reprint.motivo, "modificata");
    assert.equal(reprint.status, "queued");
    assert.equal(Object.prototype.hasOwnProperty.call(reprint, "stampanti"), false);
    assert.equal(pendingAddition.status, "cancelled");
    assert.equal(pendingAddition.lastError, "sostituita_da_ristampa");
    assert.equal(database.documents("orders").get("7").messaggioStampa, "Comanda modificata: ristampa in coda.");
});

test("editing only notes on a printed order does not create another print job", async () => {
    database = createDatabase({
        orders: { "7": storedOrder({ righe: [{ prodotto: "Margherita" }] }) },
        printerJobs: {
            "000000000007": { numero: 7, status: "printed" }
        }
    });

    const response = await invoke(orderHandler, "PUT", { numero: "7" }, updateOrderBody({
        righe: [{ prodotto: "Margherita" }],
        note: "Senza basilico"
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(database.documents("printerJobs").size, 1);
    assert.equal(database.documents("orders").get("7").note, "Senza basilico");
    assert.equal(database.documents("orders").get("7").stampaInCoda, false);
});

test("editing an order with a queued main job does not create a new print job", async () => {
    database = createDatabase({
        orders: { "7": storedOrder({ righe: [{ prodotto: "Margherita" }] }) },
        printerJobs: {
            "000000000007": { numero: 7, status: "queued" }
        }
    });

    const response = await invoke(orderHandler, "PUT", { numero: "7" }, updateOrderBody({
        righe: [{ prodotto: "Margherita" }, { prodotto: "Patatine Piccole" }]
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(database.documents("printerJobs").size, 1);
});

test("order deletion removes every queued print job", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        printerJobs: {
            "000000000007": { numero: 7, status: "queued" },
            "000000000007-01": { numero: 7, status: "queued" }
        }
    });

    const response = await invoke(orderHandler, "DELETE", { numero: "7" });

    assert.equal(response.statusCode, 204);
    assert.equal(database.documents("printerJobs").size, 0);
});

test("individual deletion clears a stale queue pause from an interrupted reset", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        metadata: { printerControl: { paused: true } }
    });

    const response = await invoke(orderHandler, "DELETE", { numero: "7" });

    assert.equal(response.statusCode, 204);
    assert.equal(database.documents("orders").has("7"), false);
    assert.equal(database.documents("metadata").get("printerControl").paused, false);
});

test("reset clears orders and expired print jobs but waits for active leases", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        printerJobs: {
            "000000000007": {
                numero: 7,
                status: "printing",
                leaseUntil: lease(Date.now() - 1)
            },
            "000000000007-01": {
                numero: 7,
                status: "queued"
            }
        },
        metadata: {
            orderCounter: { value: 7 },
            printerControl: { paused: true }
        }
    });

    const response = await invoke(resetHandler, "POST");

    assert.equal(response.statusCode, 200);
    assert.equal(database.documents("orders").size, 0);
    assert.equal(database.documents("printerJobs").size, 0);
    assert.equal(database.documents("metadata").get("orderCounter").value, 0);
    assert.equal(database.documents("metadata").get("printerControl").paused, false);

    const secondResponse = await invoke(resetHandler, "POST");
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(database.documents("metadata").get("ordersVersion").versione, 2);
});

test("reset waits for an actively leased secondary print job", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                status: "printing",
                leaseUntil: lease(Date.now() + 60_000)
            }
        },
        metadata: {
            orderCounter: { value: 7 },
            printerControl: { paused: false }
        }
    });

    const response = await invoke(resetHandler, "POST");

    assert.equal(response.statusCode, 409);
    assert.equal(database.documents("orders").has("7"), true);
    assert.equal(database.documents("printerJobs").has("000000000007-01"), true);
});

test("reset retries a transient Firestore timeout when releasing its pause", async () => {
    database = createDatabase({
        metadata: {
            orderCounter: { value: 7 },
            printerControl: { paused: false }
        }
    }, { failQueueUnpause: 1 });

    const response = await invoke(resetHandler, "POST");

    assert.equal(response.statusCode, 200);
    assert.equal(database.documents("metadata").get("printerControl").paused, false);
});

test("reset does not remove orders while a print lease is active", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7 } },
        printerJobs: {
            "000000000007": {
                numero: 7,
                status: "printing",
                leaseUntil: lease(Date.now() + 60_000)
            }
        },
        metadata: { printerControl: { paused: false } }
    });

    const response = await invoke(resetHandler, "POST");

    assert.equal(response.statusCode, 409);
    assert.equal(database.documents("orders").has("7"), true);
    assert.equal(database.documents("printerJobs").has("000000000007"), true);
    assert.equal(database.documents("metadata").get("printerControl").paused, false);
});
