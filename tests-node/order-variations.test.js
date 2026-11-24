const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const customers = require("../lib/customers");
const firebaseAdmin = require("../lib/firebase-admin");
const menuStore = require("../lib/menu-store");
const orderOperations = require("../lib/orders");
const { jobId } = require("../lib/printer-jobs");
const { Timestamp } = require("firebase-admin/firestore");
const { apiRoute } = require("./api-router-helper");

function createDatabase(order, jobs = {}, lock) {
    const data = new Map([
        ["orders", new Map([["7", { ...order }]])],
        ["printerJobs", new Map(Object.entries(jobs))],
        ["metadata", new Map([
            ["printerControl", { paused: false }],
            ...(lock ? [["printerAgentLock", lock]] : [])
        ])],
        ["clienti", new Map()]
    ]);
    const collection = name => ({
        doc(id) {
            return { kind: "document", collection: name, id: String(id) };
        },
        where(field, operator, value) {
            assert.equal(operator, "==");
            return { kind: "query", collection: name, field, value };
        }
    });
    const documents = name => {
        if (!data.has(name)) data.set(name, new Map());
        return data.get(name);
    };
    const snapshotFor = reference => {
        if (reference.kind === "query") {
            const docs = [...documents(reference.collection).entries()]
                .filter(([, value]) => value[reference.field] === reference.value)
                .map(([id, value]) => ({
                    id,
                    ref: { kind: "document", collection: reference.collection, id },
                    data: () => value
                }));
            return { docs };
        }
        const value = documents(reference.collection).get(reference.id);
        return { exists: value !== undefined, data: () => value };
    };
    return {
        collection,
        documents,
        async runTransaction(callback) {
            return callback({
                async get(reference) {
                    return snapshotFor(reference);
                },
                set(reference, value, options = {}) {
                    const current = documents(reference.collection).get(reference.id);
                    documents(reference.collection).set(
                        reference.id,
                        options.merge && current ? { ...current, ...value } : { ...value }
                    );
                },
                update(reference, value) {
                    const current = documents(reference.collection).get(reference.id);
                    if (!current) throw new Error(`Missing document ${reference.collection}/${reference.id}`);
                    documents(reference.collection).set(reference.id, { ...current, ...value });
                }
            });
        }
    };
}

function orderRows(righe, contatoreStampe = 0) {
    return {
        numero: 7,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 3",
        dataOra: "2026-11-24T11:00:00.000Z",
        righe,
        totale: 20,
        contatoreStampe,
        stampaCompletata: true,
        stampaInCoda: false
    };
}

function installHandler(t, database, preparedRows) {
    t.mock.method(auth, "requireStaffAccess", async () => ({ staff: true }));
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db: database }));
    t.mock.method(menuStore, "getMenuData", async () => ({}));
    t.mock.method(orderOperations, "prepareOrder", (_body, _catalog, options) => ({
        ...options.existingOrder,
        righe: preparedRows,
        totale: 20
    }));
    t.mock.method(customers, "customerProfileForOrder", () => null);
    return apiRoute("ordini/7");
}

function invoke(handler) {
    return new Promise(resolve => {
        const response = {
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                resolve(this);
                return this;
            },
            setHeader() {}
        };
        void handler({
            method: "PUT",
            query: { numero: "7" },
            headers: { origin: "https://pizzeria.example", host: "pizzeria.example" },
            body: {}
        }, response);
    });
}

function printedMainJob() {
    return {
        [jobId(7)]: { numero: 7, tipoStampa: "completa", status: "printed" }
    };
}

test("PUT creates a new variation job for a live agent with the capability", async t => {
    const margherita = { prodotto: "Margherita", prezzoBase: 5, extra: [], totale: 5 };
    const capricciosa = { prodotto: "Capricciosa", prezzoBase: 7, extra: [], totale: 7 };
    const diavola = { prodotto: "Diavola", prezzoBase: 6, extra: [], totale: 6 };
    const changedMargherita = { ...margherita, senza: ["Basilico"] };
    const changedCapricciosa = {
        ...capricciosa,
        note: ["Ben cotta"],
        extra: [{ nome: "Bufala", prezzo: 2 }],
        totale: 9
    };
    const addition = { prodotto: "Marinara", prezzoBase: 5, extra: [], totale: 5 };
    const existingVariation = {
        numero: 7,
        tipoStampa: "variazione",
        status: "queued",
        aggiunte: [margherita],
        tolte: [],
        cambiate: []
    };
    const database = createDatabase(
        orderRows([margherita, capricciosa, diavola], 4),
        {
            ...printedMainJob(),
            [jobId(7, 4)]: existingVariation
        },
        { leaseUntil: Timestamp.fromMillis(Date.now() + 60_000), capabilities: ["variazione"] }
    );
    const handler = installHandler(
        t,
        database,
        [changedMargherita, changedCapricciosa, addition]
    );

    const response = await invoke(handler);
    const job = database.documents("printerJobs").get(jobId(7, 5));

    assert.equal(response.statusCode, 200);
    assert.equal(job.tipoStampa, "variazione");
    assert.deepEqual(job.aggiunte, [addition]);
    assert.deepEqual(job.tolte, [diavola]);
    assert.deepEqual(job.cambiate, [
        { prima: margherita, dopo: changedMargherita },
        { prima: capricciosa, dopo: changedCapricciosa }
    ]);
    assert.equal(job.status, "queued");
    assert.equal(database.documents("printerJobs").get(jobId(7, 4)).status, "queued");
    assert.equal(database.documents("orders").get("7").contatoreStampe, 5);
    assert.equal(response.body.messaggioStampa, "Variazione in coda per la cucina.");
});

test("PUT retains the legacy reprint for changed rows without variation capability", async t => {
    const previous = { prodotto: "Margherita", prezzoBase: 5, extra: [], totale: 5 };
    const changed = { ...previous, senza: ["Basilico"] };
    const database = createDatabase(orderRows([previous]), printedMainJob());
    const handler = installHandler(t, database, [changed]);

    const response = await invoke(handler);
    const job = database.documents("printerJobs").get(jobId(7, 1));

    assert.equal(response.statusCode, 200);
    assert.equal(job.tipoStampa, "ristampa");
    assert.equal(job.motivo, "modificata");
    assert.equal(job.righe, undefined);
    assert.equal(response.body.messaggioStampa, "Comanda modificata: ristampa in coda.");
});

test("PUT retains the legacy addition when the advertised capability lease has expired", async t => {
    const previous = { prodotto: "Margherita", prezzoBase: 5, extra: [], totale: 5 };
    const addition = { prodotto: "Marinara", prezzoBase: 5, extra: [], totale: 5 };
    const database = createDatabase(
        orderRows([previous]),
        printedMainJob(),
        { leaseUntil: Timestamp.fromMillis(Date.now() - 1), capabilities: ["variazione"] }
    );
    const handler = installHandler(t, database, [previous, addition]);

    const response = await invoke(handler);
    const job = database.documents("printerJobs").get(jobId(7, 1));

    assert.equal(response.statusCode, 200);
    assert.equal(job.tipoStampa, "aggiunta");
    assert.deepEqual(job.righe, [addition]);
    assert.equal(job.aggiunte, undefined);
    assert.equal(response.body.messaggioStampa, "Aggiunta in coda per la stampa.");
});
