const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrinterAgent, formatReceipt } = require("../scripts/printer-agent");
const { Timestamp } = require("firebase-admin/firestore");

function createDatabase(seed = {}, { emitInitial = true, failReads = [] } = {}) {
    const initialData = { ...seed };
    if (!Object.prototype.hasOwnProperty.call(seed, "menuCategorie")) {
        initialData.menuCategorie = {
            pizze: { nome: "Pizze", ordine: 0, archiviata: false }
        };
        initialData.menuProdotti = {
            margherita: { nome: "Margherita", categoriaId: "pizze", ingredienti: [] }
        };
    }
    const collections = new Map(
        Object.entries(initialData).map(([name, documents]) => [name, new Map(Object.entries(documents))])
    );
    const failedReads = new Set(failReads);
    const listeners = new Set();
    const queryReads = new Map();
    let subscriptionCount = 0;
    const documents = name => {
        if (!collections.has(name)) collections.set(name, new Map());
        return collections.get(name);
    };
    const publish = () => {
        for (const listener of listeners) {
            queueMicrotask(() => listener.next(snapshotFor(listener.query)));
        }
    };
    const documentRef = (name, id) => ({
        id: String(id),
        async get() {
            const value = documents(name).get(String(id));
            return { exists: value !== undefined, data: () => value };
        },
        async set(value) {
            documents(name).set(String(id), value);
            publish();
        },
        async update(value) {
            documents(name).set(String(id), { ...documents(name).get(String(id)), ...value });
            publish();
        }
    });
    const snapshotFor = query => {
        let entries = [...documents(query.name).entries()].filter(([, data]) => (
            query.filters.every(filter => data[filter.field] === filter.value)
        ));
        if (query.sortByDocumentId) entries.sort(([first], [second]) => first.localeCompare(second));
        entries = entries.slice(0, query.maximum);
        return {
            empty: entries.length === 0,
            docs: entries.map(([id, value]) => ({
                id,
                ref: documentRef(query.name, id),
                data: () => value
            }))
        };
    };
    const makeQuery = (name, filters = [], sortByDocumentId = false, maximum = Infinity) => ({
        name,
        filters,
        sortByDocumentId,
        maximum,
        where(field, operator, value) {
            assert.equal(operator, "==");
            return makeQuery(name, [...filters, { field, value }], sortByDocumentId, maximum);
        },
        orderBy() {
            return makeQuery(name, filters, true, maximum);
        },
        limit(size) {
            return makeQuery(name, filters, sortByDocumentId, size);
        },
        async get() {
            const key = `${name}:${filters.map(filter => `${filter.field}=${filter.value}`).join(",")}`;
            queryReads.set(key, (queryReads.get(key) || 0) + 1);
            return snapshotFor(this);
        },
        onSnapshot(next, error) {
            const listener = { query: this, next, error };
            listeners.add(listener);
            subscriptionCount++;
            if (emitInitial) queueMicrotask(() => next(snapshotFor(this)));
            return () => listeners.delete(listener);
        }
    });
    return {
        collection(name) {
            return {
                doc: id => documentRef(name, id),
                where: (field, operator, value) => makeQuery(name).where(field, operator, value),
                async get() {
                    if (failedReads.has(name)) throw new Error(`read_failed_${name}`);
                    return snapshotFor(makeQuery(name));
                }
            };
        },
        async runTransaction(callback) {
            return callback({
                get: reference => reference.get(),
                set: (reference, value) => reference.set(value),
                update: (reference, value) => reference.update(value)
            });
        },
        documents,
        addDocument(name, id, value, notify = true) {
            documents(name).set(String(id), value);
            if (notify) publish();
        },
        emitSnapshot: publish,
        failListener(error) {
            for (const listener of [...listeners]) listener.error(error);
        },
        get subscriptionCount() {
            return subscriptionCount;
        },
        reads(name, status) {
            return queryReads.get(`${name}:status=${status}`) || 0;
        }
    };
}

function withFakeTimers(callback) {
    const intervals = [];
    const timeouts = [];
    const original = {
        setInterval: global.setInterval,
        clearInterval: global.clearInterval,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout
    };
    global.setInterval = (run, milliseconds) => {
        const timer = { run, milliseconds, cleared: false };
        intervals.push(timer);
        return timer;
    };
    global.clearInterval = timer => {
        if (timer) timer.cleared = true;
    };
    global.setTimeout = (run, milliseconds) => {
        const timer = { run, milliseconds, cleared: false };
        timeouts.push(timer);
        return timer;
    };
    global.clearTimeout = timer => {
        if (timer) timer.cleared = true;
    };
    return Promise.resolve()
        .then(() => callback({ intervals, timeouts }))
        .finally(() => {
            global.setInterval = original.setInterval;
            global.clearInterval = original.clearInterval;
            global.setTimeout = original.setTimeout;
            global.clearTimeout = original.clearTimeout;
        });
}

function makeOrder() {
    return {
        numero: 7,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 2",
        dataOra: "2026-11-11T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", totale: 7 }],
        totale: 7
    };
}

function queuedJob(numero) {
    return {
        numero,
        status: "queued",
        attemptCount: 0,
        printedPrinters: []
    };
}

function readyPrinter() {
    return [{ name: "Cucina", state: "ready", host: "192.168.1.2" }];
}

test("a queued job prints from the snapshot without waiting for the security timer", async () => {
    await withFakeTimers(async ({ intervals }) => {
        const database = createDatabase({
            orders: { "7": makeOrder() },
            printerJobs: { "000000000007": queuedJob(7) }
        });
        const printed = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async () => printed.push(7)
        });

        await agent.run();

        assert.deepEqual(printed, [7]);
        assert.equal(database.documents("printerJobs").get("000000000007").status, "printed");
        assert.deepEqual(intervals.map(timer => timer.milliseconds), [60_000, 60_000]);
        await agent.stop();
    });
});

test("the agent advertises variation capability on lock acquisition and renewal", async () => {
    await withFakeTimers(async ({ intervals }) => {
        const database = createDatabase();
        const agent = createPrinterAgent(database, { getPrinters: async () => readyPrinter() });
        await agent.run();

        const acquiredLock = database.documents("metadata").get("printerAgentLock");
        assert.deepEqual(acquiredLock.capabilities, ["variazione"]);
        assert.ok(acquiredLock.leaseUntil.toMillis() > Date.now());

        await intervals.find(timer => timer.milliseconds === 60_000 && !timer.cleared).run();
        const renewedLock = database.documents("metadata").get("printerAgentLock");
        assert.deepEqual(renewedLock.capabilities, ["variazione"]);
        assert.ok(renewedLock.leaseUntil.toMillis() > Date.now());
        await agent.stop();
    });
});

test("the security timer skips the queue drain when an active listener last saw no jobs", async () => {
    await withFakeTimers(async ({ intervals }) => {
        const database = createDatabase();
        const agent = createPrinterAgent(database, { getPrinters: async () => readyPrinter() });
        await agent.run();
        await new Promise(resolve => setImmediate(resolve));

        assert.equal(database.reads("printerJobs", "queued"), 0);
        await intervals.find(timer => timer.milliseconds === 60_000).run();
        assert.equal(database.reads("printerJobs", "queued"), 0);
        await agent.stop();
    });
});

test("queued jobs drain consecutively in document ID order", async () => {
    await withFakeTimers(async () => {
        const database = createDatabase({
            orders: { "7": makeOrder(), "8": { ...makeOrder(), numero: 8 }, "9": { ...makeOrder(), numero: 9 } },
            printerJobs: {
                "000000000007": queuedJob(7),
                "000000000008": queuedJob(8),
                "000000000009": queuedJob(9)
            }
        });
        const printed = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async order => printed.push(order.numero)
        });

        await agent.run();

        assert.deepEqual(printed, [7, 8, 9]);
        await agent.stop();
    });
});

test("snapshot bursts do not run two drains in parallel", async () => {
    await withFakeTimers(async () => {
        const database = createDatabase({
            orders: { "7": makeOrder(), "8": { ...makeOrder(), numero: 8 } },
            printerJobs: {
                "000000000007": queuedJob(7),
                "000000000008": queuedJob(8)
            }
        });
        let activePrints = 0;
        let maximumActivePrints = 0;
        let startFirst;
        let releaseFirst;
        const firstStarted = new Promise(resolve => {
            startFirst = resolve;
        });
        const firstGate = new Promise(resolve => {
            releaseFirst = resolve;
        });
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async order => {
                activePrints++;
                maximumActivePrints = Math.max(maximumActivePrints, activePrints);
                if (order.numero === 7) {
                    startFirst();
                    await firstGate;
                }
                activePrints--;
            }
        });

        const running = agent.run();
        await firstStarted;
        database.emitSnapshot();
        database.emitSnapshot();
        database.emitSnapshot();
        await new Promise(resolve => setImmediate(resolve));
        releaseFirst();
        await running;

        assert.equal(maximumActivePrints, 1);
        assert.equal(database.documents("printerJobs").get("000000000008").status, "printed");
        await agent.stop();
    });
});

test("the agent does not print while another terminal owns the lock", async () => {
    await withFakeTimers(async () => {
        const database = createDatabase({
            orders: { "7": makeOrder() },
            printerJobs: { "000000000007": queuedJob(7) },
            metadata: {
                printerAgentLock: {
                    instanceId: "other-terminal",
                    leaseUntil: Timestamp.fromMillis(Date.now() + 60_000)
                }
            }
        });
        let printCount = 0;
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async () => { printCount++; }
        });

        await agent.run();

        assert.equal(printCount, 0);
        assert.equal(database.documents("printerJobs").get("000000000007").status, "queued");
        await agent.stop();
    });
});

test("listener errors reconnect with the configured backoff", async () => {
    await withFakeTimers(async ({ timeouts }) => {
        const database = createDatabase();
        const agent = createPrinterAgent(database, { getPrinters: async () => readyPrinter() });
        await agent.run();

        database.failListener(new Error("listener unavailable"));

        assert.equal(timeouts[0].milliseconds, 1_000);
        timeouts[0].run();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(database.subscriptionCount, 2);
        await agent.stop();
    });
});

test("the security timer drains queued jobs when the listener is stopped", async () => {
    await withFakeTimers(async ({ intervals }) => {
        const database = createDatabase({
            orders: { "7": makeOrder() }
        }, { emitInitial: false });
        let printCount = 0;
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async () => { printCount++; }
        });
        await agent.run();
        database.failListener(new Error("listener stopped"));
        database.addDocument("printerJobs", "000000000007", queuedJob(7), false);

        const securityPoll = intervals.find(timer => timer.milliseconds === 60_000);
        await securityPoll.run();

        assert.equal(printCount, 1);
        assert.equal(database.documents("printerJobs").get("000000000007").status, "printed");
        await agent.stop();
    });
});

test("a kitchen job with only excluded categories is completed without printing", async () => {
    await withFakeTimers(async () => {
        const order = {
            ...makeOrder(),
            righe: [{ prodotto: "Acqua", categoria: "bibite", prezzoBase: 2, totale: 2 }]
        };
        const database = createDatabase({
            menuCategorie: {
                bibite: { nome: "Bibite", ordine: 0, stampaCucina: false }
            },
            orders: { "7": order },
            printerJobs: { "000000000007": queuedJob(7) }
        });
        let printCount = 0;
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async () => { printCount++; }
        });

        await agent.run();

        assert.equal(printCount, 0);
        assert.equal(database.documents("printerJobs").get("000000000007").status, "printed");
        assert.equal(database.documents("orders").get("7").stampaCompletata, true);
        await agent.stop();
    });
});

test("kitchen prints all rows when the Firestore menu cannot be read", async () => {
    await withFakeTimers(async () => {
        const order = {
            ...makeOrder(),
            righe: [{ prodotto: "Acqua", categoria: "bibite", prezzoBase: 2, totale: 2 }]
        };
        const database = createDatabase({
            menuCategorie: {
                bibite: { nome: "Bibite", ordine: 0, stampaCucina: false }
            },
            orders: { "7": order },
            printerJobs: { "000000000007": queuedJob(7) }
        }, { failReads: ["menuCategorie"] });
        const receipts = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async (_order, _printer, receipt) => receipts.push(receipt)
        });

        await agent.run();

        assert.equal(receipts.length, 1);
        assert.match(receipts[0], /@@SECTION:BIBITE@@/);
        assert.equal(database.documents("printerJobs").get("000000000007").status, "printed");
        await agent.stop();
    });
});

test("receipts use Firestore category order and fall back to order rows", async () => {
    await withFakeTimers(async () => {
        const order = {
            ...makeOrder(),
            righe: [
                { prodotto: "Bevanda", categoria: "bibite", prezzoBase: 2, totale: 2, extra: [] },
                { prodotto: "Fritto", categoria: "fritti", prezzoBase: 3, totale: 3, extra: [] },
                { prodotto: "Pizza", categoria: "pizze", prezzoBase: 5, totale: 5, extra: [] }
            ],
            totale: 10
        };
        const database = createDatabase({
            metadata: { menuVersion: { versione: 1 } },
            menuCategorie: {
                pizze: { nome: "Pizze", ordine: 0, ammetteExtra: true, archiviata: false },
                fritti: { nome: "Fritti", ordine: 1, ammetteExtra: true, archiviata: false },
                bibite: { nome: "Bibite", ordine: 2, ammetteExtra: false, archiviata: false }
            },
            orders: { "7": order },
            printerJobs: { "000000000007": queuedJob(7) }
        });
        const receipts = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async (_order, _printer, receipt) => receipts.push(receipt)
        });
        await agent.run();
        await agent.stop();

        assert.ok(receipts[0].indexOf("@@SECTION:PIZZE@@")
            < receipts[0].indexOf("@@SECTION:FRITTI@@"));
        assert.ok(receipts[0].indexOf("@@SECTION:FRITTI@@")
            < receipts[0].indexOf("@@SECTION:BIBITE@@"));

        const fallback = formatReceipt(order);
        assert.ok(fallback.indexOf("@@SECTION:BIBITE@@")
            < fallback.indexOf("@@SECTION:FRITTI@@"));
        assert.ok(fallback.indexOf("@@SECTION:FRITTI@@")
            < fallback.indexOf("@@SECTION:PIZZE@@"));
    });
});

test("the agent resolves legacy receipt rows without categories from Firestore", async () => {
    await withFakeTimers(async () => {
        const order = {
            ...makeOrder(),
            righe: [{ prodotto: "Bevanda", prezzoBase: 2, totale: 2, extra: [] }],
            totale: 2
        };
        const database = createDatabase({
            metadata: { menuVersion: { versione: 1 } },
            menuCategorie: {
                bibite: { nome: "Bibite", ordine: 0, ammetteExtra: false, archiviata: false }
            },
            menuProdotti: {
                bevanda: {
                    nome: "Bevanda",
                    categoriaId: "bibite",
                    prezzo: 2,
                    ingredienti: [],
                    ordine: 0,
                    disponibile: true,
                    archiviato: false
                }
            },
            orders: { "7": order },
            printerJobs: { "000000000007": queuedJob(7) }
        });
        const receipts = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinter(),
            printOrder: async (_order, _printer, receipt) => receipts.push(receipt)
        });
        await agent.run();
        await agent.stop();

        assert.match(receipts[0], /^@@SECTION:BIBITE@@$/m);
        assert.doesNotMatch(receipts[0], /^@@SECTION:ALTRO@@$/m);
    });
});
