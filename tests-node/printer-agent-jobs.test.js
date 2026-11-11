const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrinterAgent, formatReceipt } = require("../scripts/printer-agent");

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
                    let size = Infinity;
                    const query = {
                        orderBy() {
                            return query;
                        },
                        limit(limit) {
                            size = limit;
                            return query;
                        },
                        async get() {
                            const entries = [...documents(name).entries()]
                                .filter(([, data]) => data[field] === value)
                                .sort(([first], [second]) => first.localeCompare(second))
                                .slice(0, size);
                            return querySnapshot(name, entries);
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
        documents
    };
}

async function runOneTick(agent) {
    let releasePoll;
    let signalPollInstalled;
    const pollInstalled = new Promise(resolve => {
        signalPollInstalled = resolve;
    });
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = resolve => {
        releasePoll = resolve;
        signalPollInstalled();
        return 0;
    };
    try {
        const running = agent.run();
        await pollInstalled;
        await agent.stop();
        releasePoll();
        await running;
    } finally {
        global.setTimeout = originalSetTimeout;
    }
}

function order() {
    return {
        numero: 7,
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

test("the agent marks a selected reprint failed when its printer is not configured", async () => {
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
    let printCount = 0;
    const agent = createPrinterAgent(database, {
        getPrinters: async () => readyPrinters("Sala"),
        printOrder: async () => { printCount++; }
    });

    await runOneTick(agent);

    const job = database.documents("printerJobs").get("000000000007-01");
    assert.equal(printCount, 0);
    assert.equal(job.status, "failed");
    assert.equal(job.lastError, "stampante_non_configurata");
});

test("the agent fails a reprint rather than silently skipping one requested printer", async () => {
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
    assert.equal(printCount, 0);
    assert.equal(job.status, "failed");
    assert.equal(job.lastError, "stampante_non_configurata");
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
        getPrinters: async () => readyPrinters("Cucina"),
        printOrder: async (_order, _printer, receipt) => prints.push(receipt)
    });

    await runOneTick(agent);

    const receipt = prints[0];
    assert.match(receipt, /@@TITLE:AGGIUNTA - CONSEGNA@@/);
    assert.match(receipt, /ORARIO RICHIESTO 20:00/);
    assert.match(receipt, /TEL: 3331234567/);
    assert.match(receipt, /VIA ROMA 12/);
    assert.match(receipt, /NOTE:\r?\nSENZA BASILICO/);
    assert.match(receipt, /2X PATATINE\s+PICCOLE\s+EUR 6,00/);
    assert.doesNotMatch(receipt, /1X MARGHERITA|COSTO CONSEGNA/);
    assert.match(receipt, /TOTALE AGGIUNTA\s+EUR 6,00/);
    assert.match(receipt, /NUOVO TOTALE\s+EUR 10,00/);
    assert.equal(database.documents("printerJobs").get("000000000007-01").status, "printed");
    assert.equal(database.documents("orders").get("7").messaggioStampa, "Aggiunta completata.");

    const narrowReceipt = formatReceipt(currentOrder, 58, {
        tipoStampa: "aggiunta",
        righe: addedRows
    });
    const narrowLines = narrowReceipt.split(/\r?\n/);
    assert.match(narrowReceipt, /TOTALE\r?\nAGGIUNTA\r?\n {8}EUR 6,00/);
    assert.match(narrowReceipt, /NUOVO\r?\nTOTALE EUR 10,00/);
    assert.ok(narrowLines.every(line => (
        line.startsWith("@@TITLE:") || line.startsWith("@@SECTION:") || line.startsWith("@@BOLD:")
            ? true
            : Array.from(line).length <= 16
    )));
});

test("an added job keeps the common queued message when another job remains", async () => {
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

    assert.equal(database.documents("orders").get("7").stampaInCoda, true);
    assert.equal(
        database.documents("orders").get("7").messaggioStampa,
        "Comanda in attesa di stampa automatica."
    );
});
