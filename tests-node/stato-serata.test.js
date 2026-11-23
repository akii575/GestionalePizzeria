const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const { apiRoute } = require("./api-router-helper");

function makeDatabase({ orders = [], jobs = [], lock, version = 0 } = {}) {
    const collections = new Map([
        ["metadata", new Map([
            ["ordersVersion", { versione: version }],
            ...(typeof lock === "undefined" ? [] : [["printerAgentLock", lock]])
        ])],
        ["orders", new Map(orders.map(order => [String(order.numero), order]))],
        ["printerJobs", new Map(jobs.map(job => [job.id, job.data]))]
    ]);
    let orderReads = 0;
    const documents = name => collections.get(name) || new Map();
    const reference = (name, id) => ({
        collectionName: name,
        id: String(id),
        async get() {
            const value = documents(name).get(String(id));
            return { exists: value !== undefined, data: () => value };
        }
    });

    function queryFor(name) {
        const filters = [];
        const orderings = [];
        let maximum;
        const query = {
            where(field, operator, value) {
                filters.push([field, operator, value]);
                return query;
            },
            orderBy(field, direction) {
                orderings.push([field, direction]);
                return query;
            },
            limit(value) {
                maximum = value;
                return query;
            },
            matchingDocuments() {
                let result = [...documents(name)].filter(([, value]) => filters.every(([field, operator, expected]) => {
                    if (operator === "==") return value[field] === expected;
                    if (operator === ">=") return value[field] >= expected;
                    if (operator === "<") return value[field] < expected;
                    throw new Error(`Unexpected filter operator: ${operator}`);
                }));
                for (const [field, direction] of orderings.slice().reverse()) {
                    result.sort((first, second) => {
                        const comparison = first[1][field] < second[1][field] ? -1
                            : first[1][field] > second[1][field] ? 1
                                : 0;
                        return direction === "desc" ? -comparison : comparison;
                    });
                }
                if (typeof maximum === "number") result = result.slice(0, maximum);
                return result.map(([id, value]) => ({
                    ref: reference(name, id),
                    data: () => value
                }));
            },
            count() {
                return {
                    async get() {
                        return { data: () => ({ count: query.matchingDocuments().length }) };
                    }
                };
            },
            async get() {
                if (name === "orders") orderReads++;
                const docs = query.matchingDocuments();
                return { docs, empty: docs.length === 0, size: docs.length };
            }
        };
        return query;
    }

    return {
        collection(name) {
            if (!collections.has(name)) collections.set(name, new Map());
            return {
                doc(id) {
                    return reference(name, id);
                },
                where: (...args) => queryFor(name).where(...args),
                orderBy: (...args) => queryFor(name).orderBy(...args),
                limit: (...args) => queryFor(name).limit(...args)
            };
        },
        batch() {
            const writes = [];
            return {
                update(ref, value) {
                    writes.push({ type: "update", ref, value });
                },
                set(ref, value, options) {
                    writes.push({ type: "set", ref, value, options });
                },
                delete(ref) {
                    writes.push({ type: "delete", ref });
                },
                async commit() {
                    for (const write of writes) {
                        const values = documents(write.ref.collectionName);
                        if (write.type === "delete") {
                            values.delete(write.ref.id);
                            continue;
                        }
                        const current = values.get(write.ref.id) || {};
                        const next = { ...current };
                        for (const [field, value] of Object.entries(write.value)) {
                            if (value?.constructor?.name === "DeleteTransform") {
                                delete next[field];
                            } else if (value?.constructor?.name === "NumericIncrementTransform") {
                                next[field] = (Number(current[field]) || 0) + value.operand;
                            } else {
                                next[field] = value;
                            }
                        }
                        values.set(write.ref.id, write.type === "update"
                            ? next
                            : write.options?.merge ? { ...current, ...next } : next);
                    }
                }
            };
        },
        documents,
        get orderReads() {
            return orderReads;
        }
    };
}

function invoke(handler, method = "GET", query = {}, headers = {}) {
    return new Promise(resolve => {
        const response = {
            headers: {},
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        handler({ method, query, headers }, response);
    });
}

function setup(t, db, requireStaffAccess = async () => ({})) {
    t.mock.method(auth, "requireStaffAccess", requireStaffAccess);
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    return apiRoute("stato-serata");
}

test("evening status reports an expired printer lease as inactive", async t => {
    const leaseUntil = Date.now() - 1;
    const db = makeDatabase({
        lock: { leaseUntil: { toMillis: () => leaseUntil } },
        version: 3
    });
    const handler = setup(t, db);

    const response = await invoke(handler, "GET", { data: "2026-03-29" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.body.stampa.attiva, false);
    assert.equal(response.body.stampa.ultimoContatto, new Date(leaseUntil - 120000).toISOString());
});

test("evening status reports live printer lease, counts jobs and summarizes today's orders", async t => {
    const lockLease = Date.now() + 60000;
    const db = makeDatabase({
        version: 7,
        lock: { leaseUntil: { toMillis: () => lockLease } },
        jobs: [
            { id: "q1", data: { status: "queued", numero: 1 } },
            { id: "q2", data: { status: "queued", numero: 2 } },
            { id: "p1", data: { status: "printing", numero: 3 } },
            { id: "f1", data: { status: "failed", numero: 4 } }
        ],
        orders: [
            { numero: 1, dataOra: "2026-03-29T10:00:00.000Z", tipo: "tavolo", tavoloOCliente: "1", numeroPersone: 2, totale: 20, stampaCompletata: true },
            { numero: 2, dataOra: "2026-03-29T11:00:00.000Z", tipo: "sala", tavoloOCliente: "1", numeroPersone: 3, totale: 30, stampaCompletata: false },
            { numero: 3, dataOra: "2026-03-29T12:00:00.000Z", tipo: "tavolo", tavoloOCliente: "2", numeroPersone: 1, totale: 10, stampaCompletata: true },
            { numero: 4, dataOra: "2026-03-29T13:00:00.000Z", tipo: "consegna", statoConsegna: "da_consegnare", totale: 15 },
            { numero: 5, dataOra: "2026-03-29T14:00:00.000Z", tipo: "consegna", statoConsegna: "in_consegna", totale: 16 },
            { numero: 6, dataOra: "2026-03-29T15:00:00.000Z", tipo: "consegna", statoConsegna: "consegnata", totale: 17 },
            { numero: 7, dataOra: "2026-03-29T16:00:00.000Z", tipo: "ritiro", totale: 18 },
            { numero: 8, dataOra: "2026-03-29T17:00:00.000Z", tipo: "banco", totale: 19 },
            { numero: 9, dataOra: "2026-03-29T22:00:00.000Z", tipo: "banco", totale: 100 }
        ]
    });
    const handler = setup(t, db);

    const response = await invoke(handler, "GET", { data: "2026-03-29" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.versione, 7);
    assert.deepEqual(response.body.stampa, {
        attiva: true,
        ultimoContatto: new Date(lockLease - 120000).toISOString(),
        inCoda: 2,
        inStampa: 1,
        nonRiuscite: 1
    });
    assert.deepEqual(response.body.oggi, {
        ordini: 8,
        totale: 145,
        tavoli: 2,
        coperti: 6,
        consegneDaFare: 1,
        consegneInCorso: 1,
        consegneFatte: 1,
        ritiri: 1,
        banco: 1,
        nonStampati: 6
    });
});

test("evening status returns printer data without rereading orders for an unchanged version", async t => {
    const lockLease = Date.now() + 60000;
    const db = makeDatabase({
        version: 12,
        lock: { leaseUntil: { toMillis: () => lockLease } },
        jobs: [{ id: "q1", data: { status: "queued", numero: 1 } }]
    });
    const handler = setup(t, db);

    const response = await invoke(handler, "GET", { versione: "12", data: "2026-03-29" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        invariato: true,
        stampa: {
            attiva: true,
            ultimoContatto: new Date(lockLease - 120000).toISOString(),
            inCoda: 1,
            inStampa: 0,
            nonRiuscite: 0
        }
    });
    assert.equal(db.orderReads, 0);
});

test("retry queues failed jobs and deletes jobs whose orders no longer exist", async t => {
    const db = makeDatabase({
        version: 2,
        jobs: [
            {
                id: "existing",
                data: {
                    numero: 7,
                    status: "failed",
                    attemptCount: 4,
                    lastError: "offline",
                    failedAt: "yesterday",
                    leaseUntil: "expired",
                    claimedBy: "agent"
                }
            },
            { id: "missing", data: { numero: 99, status: "failed" } }
        ],
        orders: [{
            numero: 7,
            dataOra: "2026-03-29T10:00:00.000Z",
            stampaCompletata: true,
            stampaInCoda: false,
            messaggioStampa: "Errore"
        }]
    });
    const handler = setup(t, db);

    const response = await invoke(handler, "POST", { azione: "riprova" }, {
        origin: "https://pizzeria.example",
        host: "pizzeria.example"
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { riprovate: 2 });
    assert.deepEqual(db.documents("printerJobs").get("existing"), {
        numero: 7,
        status: "queued",
        attemptCount: 0
    });
    assert.equal(db.documents("printerJobs").has("missing"), false);
    assert.deepEqual(db.documents("orders").get("7"), {
        numero: 7,
        dataOra: "2026-03-29T10:00:00.000Z",
        stampaCompletata: false,
        stampaInCoda: true,
        messaggioStampa: "Comanda in coda per un nuovo tentativo di stampa."
    });
    assert.equal(db.documents("metadata").get("ordersVersion").versione, 3);
});

test("evening status rejects callers without staff access", async t => {
    const db = makeDatabase();
    const handler = setup(t, db, async () => {
        const error = new Error("Accesso negato.");
        error.statusCode = 403;
        throw error;
    });

    const response = await invoke(handler);

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { errore: "Accesso negato." });
});
