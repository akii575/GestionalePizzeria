const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidPrinterSelection, jobId } = require("../lib/printer-jobs");

const authPath = require.resolve("../lib/auth");
const firebasePath = require.resolve("../lib/firebase-admin");
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
        requireAdmin: async () => {},
        requireSameOrigin: () => {}
    }
};
require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { getFirebaseServices: () => ({ db: database }) }
};

const resetHandler = require("../api/reset-numeri");
const orderHandler = require("../api/ordini/[numero]");

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
        async set(value) {
            documents(name).set(String(id), value);
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
            const deletions = [];
            return {
                delete(documentRef) {
                    deletions.push(documentRef);
                },
                async commit() {
                    await Promise.all(deletions.map(documentRef => documentRef.delete()));
                }
            };
        },
        async runTransaction(callback) {
            return callback({
                get: documentRef => documentRef.get(),
                set: (documentRef, value) => {
                    if (documentRef.collectionName === "metadata" && documentRef.id === "printerControl"
                            && value.paused === false && remainingUnpauseFailures > 0) {
                        remainingUnpauseFailures--;
                        const error = new Error("deadline exceeded");
                        error.code = 4;
                        throw error;
                    }
                    return documentRef.set(value);
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

test("order updates keep queued main jobs as complete receipts", async () => {
    database = createDatabase({
        orders: { "7": { numero: 7, dataOra: "2026-10-12T12:00:00.000Z" } },
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
    assert.equal(database.documents("printerJobs").get("000000000007").tipoStampa, "completa");
    assert.equal(database.documents("printerJobs").get("000000000007").motivo, undefined);
    assert.deepEqual(database.documents("printerJobs").get("000000000007").printedPrinters, []);
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
