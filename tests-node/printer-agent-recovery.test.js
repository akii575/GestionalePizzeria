const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrinterAgent } = require("../scripts/printer-agent");

function createDatabase(seed) {
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
        }
    });
    const querySnapshot = (name, entries) => ({
        empty: entries.length === 0,
        docs: entries.map(([id, value]) => ({
            ref: ref(name, id),
            data: () => value
        }))
    });
    return {
        collection(name) {
            return {
                doc: id => ref(name, id),
                where(field, operator, value) {
                    assert.equal(operator, "==");
                    return {
                        limit(size) {
                            return {
                                async get() {
                                    const entries = [...documents(name).entries()]
                                        .filter(([, data]) => data[field] === value)
                                        .slice(0, size);
                                    return querySnapshot(name, entries);
                                }
                            };
                        }
                    };
                }
            };
        },
        async runTransaction(callback) {
            return callback({
                get: documentRef => documentRef.get(),
                set: (documentRef, value) => documentRef.set(value),
                update: (documentRef, value) => documentRef.update(value)
            });
        },
        documents
    };
}

test("expired printing leases are queued again when printers are unavailable", async () => {
    const database = createDatabase({
        orders: {
            "7": { numero: 7, stampaCompletata: false, stampaInCoda: false }
        },
        printerJobs: {
            "000000000007": {
                numero: 7,
                status: "printing",
                leaseUntil: { toMillis: () => Date.now() - 1 },
                claimedBy: "offline-terminal"
            }
        }
    });
    let printerQueryCount = 0;
    const agent = createPrinterAgent(database, {
        getPrinters: async () => {
            printerQueryCount++;
            return [];
        }
    });
    let finishPoll;
    let signalPollInstalled;
    const pollInstalled = new Promise(resolve => {
        signalPollInstalled = resolve;
    });
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = resolve => {
        finishPoll = resolve;
        signalPollInstalled();
        return 0;
    };

    try {
        const running = agent.run();
        await pollInstalled;
        await agent.stop();
        finishPoll();
        await running;
    } finally {
        global.setTimeout = originalSetTimeout;
    }

    const job = database.documents("printerJobs").get("000000000007");
    const order = database.documents("orders").get("7");
    assert.equal(job.status, "queued");
    assert.equal(job.lastError, "stampa_interrotta");
    assert.equal(order.stampaInCoda, true);
    assert.equal(order.messaggioStampa, "Stampa interrotta; la comanda verra' ritentata automaticamente.");
    assert.equal(printerQueryCount, 0);
});
