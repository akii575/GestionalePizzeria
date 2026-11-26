const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrinterAgent, formatReceipt } = require("../scripts/printer-agent");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { retryFailedPrinterJobs } = require("../lib/printer-jobs");

function createDatabase(seed) {
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
        async delete() {
            documents(name).delete(String(id));
        },
        async update(value) {
            const current = documents(name).get(String(id)) || {};
            const updated = { ...current };
            for (const [field, nextValue] of Object.entries(value)) {
                if (nextValue instanceof FieldValue && nextValue.constructor.name === "ArrayUnionTransform") {
                    updated[field] = [...new Set([
                        ...(Array.isArray(updated[field]) ? updated[field] : []),
                        ...nextValue.elements
                    ])];
                } else if (nextValue instanceof FieldValue && nextValue.constructor.name === "DeleteTransform") {
                    delete updated[field];
                } else {
                    updated[field] = nextValue;
                }
            }
            documents(name).set(String(id), updated);
        }
    });
    const querySnapshot = (name, entries) => ({
        empty: entries.length === 0,
        size: entries.length,
        docs: entries.map(([id, value]) => ({
            id,
            ref: ref(name, id),
            data: () => value
        }))
    });
    return {
        collection(name) {
            return {
                doc: id => ref(name, id),
                async get() {
                    return querySnapshot(name, [...documents(name).entries()]);
                },
                where(field, operator, value) {
                    assert.equal(operator, "==");
                    let size = Infinity;
                    let cursor = null;
                    const query = {
                        orderBy() {
                            return query;
                        },
                        limit(limit) {
                            size = limit;
                            return query;
                        },
                        startAfter(document) {
                            cursor = document.id;
                            return query;
                        },
                        entries() {
                            return [...documents(name).entries()]
                                .filter(([, data]) => data[field] === value)
                                .sort(([first], [second]) => first.localeCompare(second))
                                .filter(([id]) => cursor === null || id.localeCompare(cursor) > 0)
                                .slice(0, size);
                        },
                        onSnapshot(callback) {
                            callback(querySnapshot(name, query.entries()));
                            return () => {};
                        },
                        async get() {
                            return querySnapshot(name, query.entries());
                        }
                    };
                    return query;
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
        batch() {
            const operations = [];
            return {
                set(documentRef, value, options = {}) {
                    operations.push(() => options.merge
                        ? documentRef.update(value)
                        : documentRef.set(value));
                    return this;
                },
                update(documentRef, value) {
                    operations.push(() => documentRef.update(value));
                    return this;
                },
                delete(documentRef) {
                    operations.push(() => documentRef.delete());
                    return this;
                },
                async commit() {
                    await Promise.all(operations.map(operation => operation()));
                }
            };
        },
        documents
    };
}

async function runOneTick(agent) {
    await agent.run();
    await agent.stop();
}

function order(numero = 7) {
    return {
        numero,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 2",
        dataOra: "2026-11-11T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", totale: 7 }],
        totale: 7
    };
}

function readyPrinters(...names) {
    return names.map(name => ({ name, state: "ready", host: `192.168.1.${name === "Cucina" ? "2" : "3"}` }));
}

function queuedPrinterJob(numero, stampanti) {
    return {
        numero,
        stampanti,
        status: "queued",
        attemptCount: 0,
        printedPrinters: []
    };
}

async function withFakeIntervals(callback) {
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    const intervals = [];
    global.setInterval = (run, milliseconds) => {
        const timer = { run, milliseconds };
        intervals.push(timer);
        return timer;
    };
    global.clearInterval = () => {};
    try {
        await callback(intervals);
    } finally {
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
    }
}

async function withFakeTimeouts(callback) {
    const originalNow = Date.now;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    let now = originalNow();
    const timers = [];
    Date.now = () => now;
    global.setTimeout = (run, delay) => {
        const timer = { run, delay, dueAt: now + delay, cleared: false };
        timers.push(timer);
        return timer;
    };
    global.clearTimeout = timer => {
        if (timer) timer.cleared = true;
    };
    try {
        await callback({
            timers,
            async runNext() {
                const timer = timers.find(candidate => !candidate.cleared && !candidate.ran);
                assert.ok(timer, "expected a scheduled retry timer");
                timer.ran = true;
                now = timer.dueAt;
                await timer.run();
            }
        });
    } finally {
        Date.now = originalNow;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    }
}

test("the agent prints a reprint only to its selected printer", async () => {
    const database = createDatabase({
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                tipoStampa: "ristampa",
                stampanti: ["Cucina"],
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            }
        }
    });
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina", "Sala"),
        printOrder: async (_order, printer, receipt) => prints.push({ printer: printer.name, receipt })
    });

    await runOneTick(agent);

    assert.deepEqual(prints.map(print => print.printer), ["Cucina"]);
    assert.match(prints[0].receipt, /@@TITLE:RISTAMPA - TAVOLO@@/);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printed");
    assert.match(database.documents("orders").get("7").messaggioStampa, /^Ristampa completata\.$/);
});

test("the agent leaves a selected reprint queued when its configured printer is offline", async () => {
    const database = createDatabase({
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                tipoStampa: "ristampa",
                stampanti: ["Sala"],
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            }
        }
    });
    let printCount = 0;
    const agent = createPrinterAgent(database, {
        getPrinters: async () => [
            { name: "Cucina", state: "ready", host: "192.168.1.2" },
            { name: "Sala", state: "unavailable", host: "192.168.1.3" }
        ],
        printOrder: async () => { printCount++; }
    });

    await runOneTick(agent);

    const job = database.documents("printerJobs").get("000000000007-01");
    assert.equal(printCount, 0);
    assert.equal(job.status, "queued");
    assert.deepEqual(job.printedPrinters, []);
});

test("the agent prints configured ready printers before failing an unconfigured reprint target", async () => {
    const database = createDatabase({
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                tipoStampa: "ristampa",
                stampanti: ["Cucina", "Sala"],
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            }
        }
    });
    let printCount = 0;
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina"),
        printOrder: async () => { printCount++; }
    });

    await runOneTick(agent);

    const job = database.documents("printerJobs").get("000000000007-01");
    assert.equal(printCount, 1);
    assert.equal(job.status, "failed");
    assert.deepEqual(job.printedPrinters, ["Cucina"]);
    assert.equal(job.lastError, "stampante_non_configurata");
});

test("a Sala-only job fails when getPrinters configures only Cucina", async () => {
    const database = createDatabase({
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                ...queuedPrinterJob(7, ["Sala"]),
                tipoStampa: "ristampa"
            }
        }
    });
    let printCount = 0;
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina"),
        printOrder: async () => { printCount++; }
    });

    await runOneTick(agent);

    const job = database.documents("printerJobs").get("000000000007-01");
    assert.equal(printCount, 0);
    assert.equal(job.status, "failed");
    assert.equal(job.lastError, "stampante_non_configurata");
});

test("the agent prints three queued orders through Cucina while Sala is offline", async () => {
    const numbers = [1, 2, 3];
    const database = createDatabase({
        orders: Object.fromEntries(numbers.map(numero => [String(numero), order(numero)])),
        printerJobs: Object.fromEntries(numbers.map(numero => [
            `00000000000${numero}`,
            queuedPrinterJob(numero, ["Cucina", "Sala"])
        ]))
    });
    const printers = [
        { name: "Cucina", state: "ready", host: "192.168.1.2" },
        { name: "Sala", state: "out_of_paper", host: "192.168.1.3" }
    ];
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => printers,
        printOrder: async (currentOrder, printer) => {
            prints.push({ numero: currentOrder.numero, printer: printer.name });
        }
    });

    await runOneTick(agent);

    assert.deepEqual(prints, numbers.map(numero => ({ numero, printer: "Cucina" })));
    for (const numero of numbers) {
        const job = database.documents("printerJobs").get(`00000000000${numero}`);
        const currentOrder = database.documents("orders").get(String(numero));
        assert.equal(job.status, "queued");
        assert.deepEqual(job.printedPrinters, ["Cucina"]);
        assert.equal(currentOrder.stampaInCoda, true);
        assert.equal(currentOrder.messaggioStampa, "Stampata in Cucina, in attesa di Sala.");
    }
});

test("a printer refresh resumes only the missing Sala copies", async () => {
    await withFakeIntervals(async intervals => {
        const numbers = [1, 2, 3];
        const database = createDatabase({
            orders: Object.fromEntries(numbers.map(numero => [String(numero), {
                ...order(numero),
                stampaInCoda: true,
                messaggioStampa: "Stampata in Cucina, in attesa di Sala."
            }])),
            printerJobs: Object.fromEntries(numbers.map(numero => [
                `00000000000${numero}`,
                {
                    ...queuedPrinterJob(numero, ["Cucina", "Sala"]),
                    printedPrinters: ["Cucina"]
                }
            ]))
        });
        const availablePrinters = [
            { name: "Cucina", state: "ready", host: "192.168.1.2" },
            { name: "Sala", state: "unavailable", host: "192.168.1.3" }
        ];
        const prints = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => availablePrinters,
            printOrder: async (currentOrder, printer) => {
                prints.push({ numero: currentOrder.numero, printer: printer.name });
            }
        });

        try {
            await agent.run();
            for (const numero of numbers) {
                const job = database.documents("printerJobs").get(`00000000000${numero}`);
                assert.equal(job.status, "queued");
                assert.deepEqual(job.printedPrinters, ["Cucina"]);
            }
            assert.deepEqual(prints, []);

            availablePrinters[1].state = "ready";
            await intervals[0].run();

            assert.deepEqual(prints, numbers.map(numero => ({ numero, printer: "Sala" })));
            for (const numero of numbers) {
                const job = database.documents("printerJobs").get(`00000000000${numero}`);
                assert.equal(job.status, "printed");
                assert.deepEqual(job.printedPrinters, ["Cucina", "Sala"]);
            }
        } finally {
            await agent.stop();
        }
    });
});

test("an unavailable Sala-only reprint does not block a newer Cucina order", async () => {
    const database = createDatabase({
        orders: { "7": order(7), "8": order(8) },
        printerJobs: {
            "000000000007-01": {
                ...queuedPrinterJob(7, ["Sala"]),
                tipoStampa: "ristampa"
            },
            "000000000008-01": queuedPrinterJob(8, ["Cucina"])
        }
    });
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => [
            { name: "Cucina", state: "ready", host: "192.168.1.2" },
            { name: "Sala", state: "out_of_paper", host: "192.168.1.3" }
        ],
        printOrder: async (currentOrder, printer) => {
            prints.push({ numero: currentOrder.numero, printer: printer.name });
        }
    });

    await runOneTick(agent);

    assert.deepEqual(prints, [{ numero: 8, printer: "Cucina" }]);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "queued");
    assert.deepEqual(database.documents("printerJobs").get("000000000007-01").printedPrinters, []);
    assert.equal(database.documents("printerJobs").get("000000000008-01").status, "printed");
});

test("more than 20 jobs waiting for an offline Sala do not block a new Cucina order", async () => {
    const orders = {};
    const printerJobs = {};
    for (let numero = 1; numero <= 25; numero++) {
        orders[String(numero)] = order(numero);
        printerJobs[String(numero).padStart(12, "0")] = {
            ...queuedPrinterJob(numero, ["Cucina", "Sala"]),
            printedPrinters: ["Cucina"]
        };
    }
    orders["26"] = order(26);
    printerJobs["000000000026"] = queuedPrinterJob(26, ["Cucina", "Sala"]);
    const database = createDatabase({ orders, printerJobs });
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => [
            { name: "Cucina", state: "ready", host: "192.168.1.2" },
            { name: "Sala", state: "unavailable", host: "192.168.1.3" }
        ],
        printOrder: async (currentOrder, printer) => {
            prints.push({ numero: currentOrder.numero, printer: printer.name });
        }
    });

    await runOneTick(agent);

    assert.deepEqual(prints, [{ numero: 26, printer: "Cucina" }]);
});

test("a transient printer failure retries automatically without printing completed copies twice", async () => {
    await withFakeIntervals(async () => withFakeTimeouts(async clock => {
        const database = createDatabase({
            orders: { "7": order() },
            printerJobs: {
                "000000000007-01": {
                    ...queuedPrinterJob(7, ["Cucina", "Sala"]),
                    tipoStampa: "ristampa"
                }
            }
        });
        const prints = [];
        let salaAttempts = 0;
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinters("Cucina", "Sala"),
            printOrder: async (_order, printer) => {
                prints.push(printer.name);
                if (printer.name === "Sala" && salaAttempts++ === 0) {
                    throw new Error("temporary network error");
                }
            }
        });

        try {
            await agent.run();
            const queuedJob = database.documents("printerJobs").get("000000000007-01");
            assert.equal(queuedJob.status, "queued");
            assert.deepEqual(queuedJob.printedPrinters, ["Cucina"]);
            assert.equal(queuedJob.attemptCount, 1);
            assert.equal(clock.timers[0].delay, 5_000);
            assert.equal(database.documents("orders").get("7").stampaInCoda, true);
            assert.equal(
                database.documents("orders").get("7").messaggioStampa,
                "Stampa non riuscita, nuovo tentativo automatico tra pochi secondi."
            );

            await clock.runNext();

            const printedJob = database.documents("printerJobs").get("000000000007-01");
            assert.equal(printedJob.status, "printed");
            assert.equal(printedJob.attemptCount, 2);
            assert.deepEqual(printedJob.printedPrinters, ["Cucina", "Sala"]);
            assert.deepEqual(prints, ["Cucina", "Sala", "Sala"]);
        } finally {
            await agent.stop();
        }
    }));
});

test("three consecutive printer failures mark the job failed", async () => {
    await withFakeIntervals(async () => withFakeTimeouts(async clock => {
        const database = createDatabase({
            orders: { "7": order() },
            printerJobs: {
                "000000000007-01": {
                    ...queuedPrinterJob(7, ["Cucina"]),
                    tipoStampa: "ristampa"
                }
            }
        });
        let attempts = 0;
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinters("Cucina"),
            printOrder: async () => {
                attempts++;
                throw new Error("temporary network error");
            }
        });

        try {
            await agent.run();
            assert.equal(database.documents("printerJobs").get("000000000007-01").status, "queued");
            await clock.runNext();
            assert.equal(database.documents("printerJobs").get("000000000007-01").status, "queued");
            assert.equal(clock.timers[1].delay, 10_000);
            await clock.runNext();

            const failedJob = database.documents("printerJobs").get("000000000007-01");
            assert.equal(attempts, 3);
            assert.equal(failedJob.status, "failed");
            assert.equal(failedJob.attemptCount, 3);
            assert.equal(Object.hasOwn(failedJob, "retryAfter"), false);
            assert.match(database.documents("orders").get("7").messaggioStampa, /premi Riprova/);
        } finally {
            await agent.stop();
        }
    }));
});

test("retrying failed printer jobs resets attempts and removes retryAfter", async () => {
    const makeDatabase = () => createDatabase({
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                ...queuedPrinterJob(7, ["Cucina"]),
                status: "failed",
                attemptCount: 3,
                retryAfter: Timestamp.fromMillis(Date.now() + 60_000),
                lastError: "invio_stampante_non_riuscito"
            }
        }
    });

    const agentDatabase = makeDatabase();
    const agent = createPrinterAgent(agentDatabase, {
        getPrinters: async () => readyPrinters("Cucina")
    });
    assert.equal(await agent.retryFailed(), 1);
    const agentRetriedJob = agentDatabase.documents("printerJobs").get("000000000007-01");
    assert.equal(agentRetriedJob.status, "queued");
    assert.equal(agentRetriedJob.attemptCount, 0);
    assert.equal(Object.hasOwn(agentRetriedJob, "retryAfter"), false);

    const helperDatabase = makeDatabase();
    assert.equal(await retryFailedPrinterJobs(helperDatabase), 1);
    const helperRetriedJob = helperDatabase.documents("printerJobs").get("000000000007-01");
    assert.equal(helperRetriedJob.status, "queued");
    assert.equal(helperRetriedJob.attemptCount, 0);
    assert.equal(Object.hasOwn(helperRetriedJob, "retryAfter"), false);
});

test("a queued job waiting for retryAfter does not block a new order", async () => {
    await withFakeIntervals(async () => withFakeTimeouts(async clock => {
        const database = createDatabase({
            orders: { "7": order(7), "8": order(8) },
            printerJobs: {
                "000000000007-01": {
                    ...queuedPrinterJob(7, ["Cucina"]),
                    attemptCount: 1,
                    retryAfter: Timestamp.fromMillis(Date.now() + 60_000)
                },
                "000000000008-01": queuedPrinterJob(8, ["Cucina"])
            }
        });
        const prints = [];
        const agent = createPrinterAgent(database, {
            getPrinters: async () => readyPrinters("Cucina"),
            printOrder: async currentOrder => prints.push(currentOrder.numero)
        });

        await runOneTick(agent);

        assert.deepEqual(prints, [8]);
        assert.equal(database.documents("printerJobs").get("000000000007-01").status, "queued");
        assert.equal(database.documents("printerJobs").get("000000000008-01").status, "printed");
        assert.equal(clock.timers[0].cleared, true);
    }));
});

test("modified reprints are labeled on the receipt", () => {
    const receipt = formatReceipt(order(), 80, {
        tipoStampa: "ristampa",
        motivo: "modificata"
    });

    assert.match(receipt, /@@TITLE:RISTAMPA MODIFICATA - TAVOLO@@/);
});

test("the agent prints only added rows and reports both addition totals", async () => {
    const currentOrder = {
        ...order(),
        tipo: "consegna",
        orario: "20:00",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        costoConsegna: 2,
        note: "Senza basilico",
        righe: [{ prodotto: "Margherita", prezzoBase: 5, extra: [], totale: 5 }],
        totale: 10
    };
    const addedRows = [
        { prodotto: "Patatine Piccole", prezzoBase: 3, extra: [], totale: 3 },
        { prodotto: "Patatine Piccole", prezzoBase: 3, extra: [], totale: 3 }
    ];
    const database = createDatabase({
        orders: { "7": currentOrder },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                tipoStampa: "aggiunta",
                righe: addedRows,
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            }
        }
    });
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Sala"),
        printOrder: async (_order, _printer, receipt) => prints.push(receipt)
    });

    await runOneTick(agent);

    const receipt = prints[0];
    assert.match(receipt, /@@TITLE:AGGIUNTA - CONSEGNA@@/);
    assert.match(receipt, /@@BIG:ORARIO 20:00@@$/);
    assert.match(receipt, /TEL: 3331234567/);
    assert.match(receipt, /VIA ROMA 12/);
    assert.match(receipt, /NOTE:\r?\n@@NOTEBIG:SENZA BASILICO@@/);
    assert.match(receipt, /@@ITEM:2X PATATINE PICCOLE@@\r?\n\s+EUR 6,00/);
    assert.doesNotMatch(receipt, /1X MARGHERITA|COSTO CONSEGNA/);
    assert.match(receipt, /TOTALE AGGIUNTA/);
    assert.match(receipt, /NUOVO TOTALE/);
    assert.match(receipt, /EUR 6,00/);
    assert.match(receipt, /EUR 10,00/);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printed");
    assert.equal(database.documents("orders").get("7").messaggioStampa, "Aggiunta completata.");

    const narrowReceipt = formatReceipt(currentOrder, 58, {
        tipoStampa: "aggiunta",
        righe: addedRows
    });
    const narrowLines = narrowReceipt.split(/\r?\n/);
    assert.match(narrowReceipt, /TOTALE AGGIUNTA\r?\n {8}EUR 6,00/);
    assert.match(narrowReceipt, /NUOVO TOTALE\r?\n {7}EUR 10,00/);
    assert.match(narrowReceipt, /@@BIG:ORARIO@@\r?\n@@BIG:20:00@@$/);
    assert.ok(narrowLines.every(line => {
        const marker = /^@@(TITLE|SECTION|BIG|NOTEBIG|ITEM|SMALL|BOLD):(.*)@@$/.exec(line);
        if (!marker) return Array.from(line).length <= 16;
        if (marker[1] === "TITLE" || marker[1] === "SECTION") return true;
        const width = marker[1] === "SMALL"
            ? 32
            : marker[1] === "BIG" || marker[1] === "NOTEBIG" ? 10 : 16;
        return Array.from(marker[2]).length <= width;
    }));
});

test("the queue drain prints consecutive added jobs and clears the queued message", async () => {
    const addedRows = [{ prodotto: "Patatine Piccole", prezzoBase: 3, extra: [], totale: 3 }];
    const database = createDatabase({
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                tipoStampa: "aggiunta",
                righe: addedRows,
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            },
            "000000000007-02": {
                numero: 7,
                tipoStampa: "aggiunta",
                righe: addedRows,
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            }
        }
    });
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina"),
        printOrder: async () => {}
    });

    await runOneTick(agent);

    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printed");
    assert.equal(database.documents("printerJobs").get("000000000007-02").status, "printed");
    assert.equal(database.documents("orders").get("7").stampaInCoda, false);
    assert.equal(database.documents("orders").get("7").messaggioStampa, "Aggiunta completata.");
});

test("variation jobs print only to cucina and Sala completes without printing", async () => {
    const variation = {
        numero: 7,
        tipoStampa: "variazione",
        createdAt: "2026-11-24T17:35:00.000Z",
        aggiunte: [
            { prodotto: "Pizza aggiunta", categoria: "pizze", prezzoBase: 5, totale: 5 },
            { prodotto: "Coca", categoria: "bibite", prezzoBase: 2, totale: 2 }
        ],
        tolte: [],
        cambiate: [],
        status: "queued",
        attemptCount: 0,
        printedPrinters: []
    };
    const database = createDatabase({
        menuCategorie: {
            pizze: { nome: "Pizze", ordine: 0, stampaCucina: false, stampaVariazioni: true },
            bibite: { nome: "Bibite", ordine: 1, stampaCucina: false, stampaVariazioni: false }
        },
        orders: { "7": order() },
        printerJobs: { "000000000007-01": variation }
    });
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina", "Sala"),
        printOrder: async (_order, printer, receipt) => prints.push({ printer: printer.name, receipt })
    });

    await runOneTick(agent);

    assert.deepEqual(prints.map(print => print.printer), ["Cucina"]);
    assert.match(prints[0].receipt, /@@BIG:VARIAZIONE #7@@/);
    assert.match(prints[0].receipt, /PIZZA AGGIUNTA/);
    assert.doesNotMatch(prints[0].receipt, /COCA/);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printed");
});

test("unreadable menu prints all variation rows and the failed load is not cached", async () => {
    const rows = [
        { prodotto: "Pizza aggiunta", categoria: "pizze", prezzoBase: 5, totale: 5 },
        { prodotto: "Coca", categoria: "bibite", prezzoBase: 2, totale: 2 }
    ];
    const variationJob = suffix => ({
        numero: 7,
        tipoStampa: "variazione",
        aggiunte: rows,
        tolte: [],
        cambiate: [],
        status: "queued",
        attemptCount: 0,
        printedPrinters: [],
        suffix
    });
    const database = createDatabase({
        menuCategorie: {
            pizze: { nome: "Pizze", ordine: 0, stampaVariazioni: true },
            bibite: { nome: "Bibite", ordine: 1, stampaVariazioni: false }
        },
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": variationJob("first"),
            "000000000007-02": variationJob("second")
        }
    });
    const originalCollection = database.collection.bind(database);
    let categoryReads = 0;
    database.collection = name => {
        const collection = originalCollection(name);
        if (name !== "menuCategorie") return collection;
        return {
            ...collection,
            async get() {
                categoryReads++;
                if (categoryReads === 1) throw new Error("menu unavailable");
                return collection.get();
            }
        };
    };
    const prints = [];
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina"),
        printOrder: async (_order, _printer, receipt) => prints.push(receipt)
    });

    await runOneTick(agent);

    assert.equal(categoryReads, 2);
    assert.equal(prints.length, 2);
    assert.match(prints[0], /PIZZA AGGIUNTA/);
    assert.match(prints[0], /COCA/);
    assert.match(prints[1], /PIZZA AGGIUNTA/);
    assert.doesNotMatch(prints[1], /COCA/);
});

test("variation jobs with no printable categories complete without printing", async () => {
    const database = createDatabase({
        menuCategorie: {
            bibite: { nome: "Bibite", ordine: 0, stampaCucina: false }
        },
        orders: { "7": order() },
        printerJobs: {
            "000000000007-01": {
                numero: 7,
                tipoStampa: "variazione",
                aggiunte: [{ prodotto: "Coca", categoria: "bibite", prezzoBase: 2, totale: 2 }],
                tolte: [],
                cambiate: [],
                status: "queued",
                attemptCount: 0,
                printedPrinters: []
            }
        }
    });
    let printCount = 0;
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Cucina", "Sala"),
        printOrder: async () => { printCount++; }
    });

    await runOneTick(agent);

    assert.equal(printCount, 0);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printed");
    assert.equal(
        database.documents("orders").get("7").messaggioStampa,
        "Variazione senza pizze: nessuna stampa"
    );
});
