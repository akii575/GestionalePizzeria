const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../scripts/printer-terminal");

const allowedOrigin = "https://gestionale-pizzeria-six.vercel.app";

function receiptLineFits(line, doubleWidth) {
    const marker = /^@@(TITLE|SECTION|BIG|NOTEBIG|ITEM|SMALL|BOLD):(.*)@@$/.exec(line);
    if (!marker) return Array.from(line).length <= doubleWidth;
    if (marker[1] === "TITLE" || marker[1] === "SECTION") return true;
    const width = marker[1] === "SMALL"
        ? doubleWidth * 2
        : marker[1] === "BIG" || marker[1] === "NOTEBIG" ? Math.floor(doubleWidth * 2 / 3) : doubleWidth;
    return Array.from(marker[2]).length <= width;
}

async function withServer(t, dependencies, run) {
    const server = createServer(dependencies);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(() => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    }));
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
}

test("status endpoint returns only printer status to the production app origin", async t => {
    await withServer(t, {
        getPrinters: async () => [{ name: "Kitchen Printer", isDefault: true, status: "Normal", state: "ready" }],
        getStatus: async () => ({ workerState: "ready", queued: 1, printing: 0, failed: 0 }),
        retryFailed: async () => 0
    }, async base => {
        const response = await fetch(`${base}/status`, {
            headers: { Origin: allowedOrigin }
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const result = await response.json();
        assert.equal(result.agent.workerState, "ready");
        assert.equal(result.agent.queued, 1);
    });
});

test("status endpoint rejects browser requests from untrusted origins", async t => {
    await withServer(t, {
        getPrinters: async () => [],
        getStatus: async () => ({ workerState: "ready", queued: 0, printing: 0, failed: 0 })
    }, async base => {
        const response = await fetch(`${base}/status`, {
            headers: { Origin: "https://attacker.example" }
        });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
    });
});

test("private network preflight is allowed only for the production app", async t => {
    await withServer(t, {
        getPrinters: async () => [],
        getStatus: async () => ({ workerState: "ready", queued: 0, printing: 0, failed: 0 })
    }, async base => {
        const allowed = await fetch(`${base}/status`, {
            method: "OPTIONS",
            headers: {
                Origin: allowedOrigin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Private-Network": "true"
            }
        });
        assert.equal(allowed.status, 204);
        assert.equal(allowed.headers.get("access-control-allow-private-network"), "true");

        const denied = await fetch(`${base}/status`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://attacker.example",
                "Access-Control-Request-Method": "GET"
            }
        });
        assert.equal(denied.status, 403);
    });
});

test("failed print jobs can be retried only from the production app", async t => {
    let retryCount = 0;
    await withServer(t, {
        getPrinters: async () => [],
        getStatus: async () => ({ workerState: "ready", queued: 0, printing: 0, failed: 1 }),
        retryFailed: async () => {
            retryCount++;
            return 1;
        }
    }, async base => {
        const response = await fetch(`${base}/retry-failed`, {
            method: "POST",
            headers: { Origin: allowedOrigin }
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { retried: 1 });
        assert.equal(retryCount, 1);

        const denied = await fetch(`${base}/retry-failed`, {
            method: "POST",
            headers: { Origin: "https://attacker.example" }
        });
        assert.equal(denied.status, 403);
        assert.equal(retryCount, 1);
    });
});

test("receipt prints the number first and uses the fixed-width uppercase layout", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 12,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 4",
        numeroPersone: 3,
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", categoria: "pizze", prezzoBase: 8.5, extra: [{ nome: "Bufala", prezzo: 2 }], totale: 10.5 }],
        note: "Senza basilico",
        totale: 10.5
    });
    assert.match(receipt, /^@@BIG:#12@@\r?\n@@TITLE:TAVOLO X3@@/);
    assert.equal(receipt.split(/\r?\n/)[2], "-".repeat(24));
    assert.match(receipt, /TAVOLO: TAVOLO 4/);
    assert.match(receipt, /PERSONE: 3/);
    assert.ok(receipt.includes("NOTE:"));
    assert.ok(receipt.includes("SENZA BASILICO"));
    assert.ok(receipt.indexOf("NOTE:") > receipt.indexOf("DATA:"));
    assert.ok(receipt.indexOf("NOTE:") < receipt.indexOf("@@SECTION:"));
    assert.ok(receipt.indexOf("NOTE:") < receipt.indexOf("1X MARGHERITA"));
    assert.match(receipt, /^@@SECTION:PIZZE@@$/m);
    assert.match(receipt, /@@ITEM:1X MARGHERITA\s+EUR 8,50@@/);
    assert.match(receipt, /^ {2}\+ BUFALA\s+EUR 2,00$/m);
    assert.doesNotMatch(receipt, /COMANDA #12/);
    assert.ok(receipt.includes("EUR 8,50"));
    assert.ok(receipt.split(/\r?\n/).every(line => receiptLineFits(line, 24)));
});

test("delivery surcharge is printed separately before the total within the paper width", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        tipo: "consegna",
        dataOra: "2026-10-14T12:00:00.000Z",
        orario: "20:00",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        costoConsegna: 2,
        righe: [{ prodotto: "Margherita", prezzoBase: 5, totale: 5 }],
        totale: 7
    });
    const lines = receipt.split(/\r?\n/);
    const surcharge = lines.findIndex(line => line.includes("COSTO CONSEGNA"));
    const total = lines.findIndex(line => line.startsWith("TOTALE"));

    assert.equal(surcharge >= 0, true);
    assert.ok(surcharge < total);
    assert.match(lines[surcharge], /COSTO CONSEGNA\s+EUR 2,00/);
    assert.equal(lines[surcharge].length, 24);
});

test("sala prints cover before the unchanged order total, while cucina and additions omit its line", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const order = {
        numero: 42,
        tipo: "tavolo",
        numeroPersone: 4,
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", prezzoBase: 5, totale: 5 }],
        coperto: { persone: 4, prezzoUnitario: 2, totale: 8 },
        totale: 13
    };
    const sala = formatReceipt(order);
    const lineeSala = sala.split(/\r?\n/);
    const coperto = lineeSala.findIndex(linea => linea.includes("COPERTO 4X"));
    const totale = lineeSala.find(linea => linea.startsWith("TOTALE"));

    assert.ok(coperto >= 0);
    assert.ok(coperto < lineeSala.findIndex(linea => linea.startsWith("TOTALE")));
    assert.match(lineeSala[coperto], /COPERTO 4X\s+EUR 8,00/);
    assert.match(totale, /EUR 13,00/);

    const cucina = formatReceipt(order, 80, { profile: "cucina" });
    assert.doesNotMatch(cucina, /COPERTO|EUR|TOTALE/);

    const aggiunta = formatReceipt(order, 80, {
        tipoStampa: "aggiunta",
        righe: [{ prodotto: "Margherita", prezzoBase: 1, totale: 1 }]
    });
    assert.doesNotMatch(aggiunta, /COPERTO 4X/);
    assert.match(aggiunta, /NUOVO TOTALE\s+EUR 13,00/);
});

test("sala prints row and order discounts plus convention, while cucina omits discount data", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const discounted = {
        numero: 43,
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{
            prodotto: "Margherita",
            prezzoBase: 5,
            totaleLordo: 5,
            totale: 4,
            sconto: { tipo: "omaggio", motivo: "Promozione", importo: 1 }
        }],
        sconto: { tipo: "percentuale", motivo: "Cliente abituale", importo: 0.4 },
        totale: 3.6
    };
    const sala = formatReceipt(discounted);
    const lines = sala.split(/\r?\n/);
    const itemDiscount = lines.findIndex(line => line.includes("OMAGGIO PROMOZIONE"));
    const orderDiscount = lines.findIndex(line => line.includes("SCONTO CLIENTE ABITUALE"));
    const total = lines.findIndex(line => line.startsWith("TOTALE"));

    assert.ok(itemDiscount >= 0);
    assert.ok(orderDiscount > itemDiscount);
    assert.ok(total > orderDiscount);
    assert.match(sala, /OMAGGIO PROMOZIONE\s+-1,00/);
    assert.match(sala, /SCONTO CLIENTE ABITUALE\s+-0,40/);
    assert.match(lines[total], /EUR 3,60/);

    const convention = formatReceipt({
        ...discounted,
        sconto: undefined,
        convenzione: { tipo: "menu", menu: 2, importo: 1.5 },
        totale: 3.5
    });
    assert.match(convention, /CONVENZIONE UNIV\. 2 MENU\s+6 EURO\s+-1,50/);
    const cucina = formatReceipt(discounted, 80, { profile: "cucina" });
    assert.doesNotMatch(cucina, /SCONTO|OMAGGIO|CONVENZIONE|EUR/);
});

test("sala aligns fixed-price convention summaries within the 24-column receipt width", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const percentageLines = formatReceipt({
        numero: 45,
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Prodotti", prezzoBase: 16, totaleLordo: 16, totale: 16 }],
        totaleLordo: 16,
        convenzione: { tipo: "percentuale", importo: 1.6 },
        totale: 14.4
    }, 80).split(/\r?\n/);
    const percentageSubtotal = percentageLines.findIndex(line => line.includes("SUBTOTALE"));
    const percentageConvention = percentageLines.findIndex(line => line.startsWith("CONVENZ. 10%"));
    const percentageTotal = percentageLines.findIndex(line => line.startsWith("TOTALE"));

    assert.ok(percentageSubtotal >= 0);
    assert.ok(percentageSubtotal < percentageConvention);
    assert.ok(percentageConvention < percentageTotal);
    assert.match(percentageLines[percentageSubtotal], /SUBTOTALE\s+EUR 16,00/);
    assert.equal(percentageLines[percentageConvention], "CONVENZ. 10%   EUR -1,60");
    assert.match(percentageLines[percentageTotal], /EUR 14,40/);

    const menuOrder = {
        numero: 46,
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [],
        totaleLordo: 19.5,
        convenzione: {
            tipo: "menu",
            menu: 3,
            importo: 1.5,
            prezzoMenu: 6,
            totaleMenu: 18
        },
        totale: 18
    };
    const menuLines = formatReceipt(menuOrder, 80).split(/\r?\n/);
    const menuSubtotal = menuLines.findIndex(line => line.includes("SUBTOTALE"));
    const menuSummary = menuLines.findIndex(line => line.startsWith("3 MENU X 6,00"));
    const menuTotal = menuLines.findIndex(line => line.startsWith("TOTALE"));

    assert.ok(menuSubtotal >= 0);
    assert.ok(menuSubtotal < menuSummary);
    assert.ok(menuSummary < menuTotal);
    assert.match(menuLines[menuSubtotal], /SUBTOTALE\s+EUR 19,50/);
    assert.equal(menuLines[menuSummary], "3 MENU X 6,00  EUR 18,00");
    assert.match(menuLines[menuTotal], /EUR 18,00/);
    for (const lines of [percentageLines, menuLines]) {
        for (const index of [
            lines.findIndex(line => line.includes("SUBTOTALE")),
            lines.findIndex(line => line.startsWith("CONVENZ. 10%") || line.startsWith("3 MENU X 6,00")),
            lines.findIndex(line => line.startsWith("TOTALE"))
        ]) {
            assert.ok(lines[index].length <= 24);
        }
    }

    assert.equal(
        formatReceipt(menuOrder, 80, { profile: "cucina" }),
        formatReceipt({ ...menuOrder, convenzione: undefined }, 80, { profile: "cucina" })
    );
});

test("orders without a convention keep the exact standard sala receipt bytes", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 99,
        tipo: "banco",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [],
        totale: 0
    }, 80);

    assert.equal(receipt, [
        "@@BIG:#99@@",
        "@@TITLE:BANCO@@",
        "------------------------",
        "DATA: 14/10/2026",
        "------------------------",
        "------------------------",
        "TOTALE          EUR 0,00",
        "------------------------"
    ].join("\r\n"));
});

test("receipt number is first and requested time is the final large line", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const lines = formatReceipt({
        numero: 42,
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        orario: "20:30",
        righe: [],
        totale: 0
    }).split(/\r?\n/);

    assert.equal(lines[0], "@@BIG:#42@@");
    assert.equal(lines[lines.length - 1], "@@BIG:ORARIO 20:30@@");
    assert.equal(lines.some(line => line.includes("ORARIO 20:30") && !line.startsWith("@@BIG:")), false);
});

test("long product names stay separate from the right-aligned price", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const lines = formatReceipt({
        numero: 42,
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "THE PUMPKIN 2.0", prezzoBase: 9, totale: 9 }],
        totale: 9
    }).split(/\r?\n/);
    const productLine = lines.indexOf("@@ITEM:1X THE PUMPKIN 2.0@@");

    assert.ok(productLine >= 0);
    assert.match(lines[productLine + 1], /^\s+EUR 9,00$/);
    assert.doesNotMatch(lines[productLine], /EUR|2\.0\s+EUR/);
});

test("kitchen receipts keep rows whose category is unknown", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 42,
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Fuori Menu", prezzoBase: 8, totale: 8 }],
        totale: 8
    }, 80, {
        profile: "cucina",
        kitchenCategories: new Set(["pizze"]),
        productCategories: {}
    });

    assert.match(receipt, /@@SECTION:ALTRO@@/);
    assert.match(receipt, /@@ITEM:1X FUORI MENU@@/);
});

test("kitchen receipts include only kitchen categories and ingredients, while sala keeps prices", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const order = {
        numero: 42,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 2",
        dataOra: "2026-10-14T12:00:00.000Z",
        orario: "20:30",
        righe: [
            {
                prodotto: "Margherita",
                categoria: "pizze",
                prezzoBase: 8,
                extra: [{ nome: "Bufala", prezzo: 2 }],
                totale: 10
            },
            { prodotto: "Acqua", categoria: "bibite", prezzoBase: 2, totale: 2 }
        ],
        totale: 12
    };
    const options = {
        kitchenCategories: new Set(["pizze"]),
        productIngredients: { Margherita: ["Pomodoro", "Mozzarella"] }
    };
    const kitchen = formatReceipt(order, 80, { ...options, profile: "cucina" });
    const sala = formatReceipt(order, 80, { ...options, profile: "sala" });

    assert.match(kitchen, /@@SECTION:PIZZE@@/);
    assert.doesNotMatch(kitchen, /BIBITE|EUR|TOTALE|COSTO CONSEGNA/);
    assert.match(kitchen, /@@SMALL: {2}POMODORO, MOZZARELLA@@/);
    assert.match(kitchen, /@@ITEM: {2}\+ BUFALA@@/);
    assert.doesNotMatch(sala, /@@SMALL:/);
    assert.match(sala, /@@SECTION:BIBITE@@/);
    assert.match(sala, /EUR 8,00/);
    assert.match(sala, /EUR 2,00/);
    assert.match(sala, /TOTALE/);
    const addedKitchen = formatReceipt(order, 80, {
        ...options,
        profile: "cucina",
        tipoStampa: "aggiunta",
        righe: [
            order.righe[0],
            { prodotto: "Acqua", categoria: "bibite", prezzoBase: 2, totale: 2 }
        ]
    });

    assert.match(addedKitchen, /@@TITLE:AGGIUNTA - TAVOLO@@/);
    assert.match(addedKitchen, /@@SECTION:PIZZE@@/);
    assert.doesNotMatch(addedKitchen, /BIBITE|EUR|TOTALE/);
    assert.equal(kitchen.split(/\r?\n/).some((line, index, lines) => (
        line === "" && lines[index + 1] === ""
    )), false);
});

test("variation receipts contain only filtered additions, removals and changed pizza details", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 42,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 3",
        dataOra: "2026-11-24T11:00:00.000Z",
        orario: "20:30",
        righe: [{ prodotto: "Non modificata", categoria: "pizze", totale: 5 }],
        totale: 5
    }, 80, {
        tipoStampa: "variazione",
        createdAt: "2026-11-24T17:35:00.000Z",
        variationCategories: new Set(["pizze"]),
        productCategories: {},
        productIngredients: { Margherita: ["Pomodoro", "Funghi"] },
        aggiunte: [{
            prodotto: "Margherita",
            categoria: "pizze",
            prezzoBase: 5,
            totale: 5,
            senza: ["Funghi"],
            note: ["Ben cotta"],
            extra: [{ nome: "Bufala", prezzo: 2 }]
        }],
        tolte: [{ prodotto: "Diavola", categoria: "pizze", prezzoBase: 6, totale: 6 }],
        cambiate: [{
            prima: { prodotto: "Capricciosa", categoria: "pizze", prezzoBase: 7, totale: 7 },
            dopo: {
                prodotto: "Capricciosa",
                categoria: "pizze",
                prezzoBase: 7,
                totale: 9,
                senza: ["Funghi"],
                note: ["Ben cotta"],
                extra: [{ nome: "Bufala", prezzo: 2 }]
            }
        }]
    });

    assert.match(receipt, /^@@BIG:VARIAZIONE #42@@\r?\nTAVOLO 3 · 18:35/);
    assert.match(receipt, /--- AGGIUNGERE ---[\s\S]*@@ITEM:1X MARGHERITA@@/);
    assert.match(receipt, /@@ITEM:\s{2}- SENZA FUNGHI@@/);
    assert.match(receipt, /@@ITEM:\s{2}! BEN COTTA@@/);
    assert.match(receipt, /@@ITEM:\s{2}\+ BUFALA@@/);
    assert.match(receipt, /--- TOGLIERE ---[\s\S]*@@ITEM:1X DIAVOLA@@/);
    assert.match(
        receipt,
        /--- CAMBIARE ---[\s\S]*@@ITEM:1X CAPRICCIOSA@@\r?\n@@ITEM:\s{2}ORA:@@\r?\n@@ITEM:\s{2}- SENZA FUNGHI@@\r?\n@@ITEM:\s{2}! BEN COTTA@@\r?\n@@ITEM:\s{2}\+ BUFALA@@/
    );
    assert.match(receipt, /@@BIG:ORARIO 20:30@@$/);
    assert.doesNotMatch(receipt, /NON MODIFICATA/);

    const onlyAddition = formatReceipt({ numero: 43, righe: [] }, 80, {
        tipoStampa: "variazione",
        variationCategories: new Set(["pizze"]),
        aggiunte: [{ prodotto: "Pizza nuova", categoria: "pizze" }],
        tolte: [],
        cambiate: []
    });
    assert.doesNotMatch(onlyAddition, /--- TOGLIERE ---|--- CAMBIARE ---/);

    const unknownCategory = formatReceipt({ numero: 44, righe: [] }, 80, {
        tipoStampa: "variazione",
        variationCategories: new Set(),
        aggiunte: [{ prodotto: "Fuori menu" }],
        tolte: [],
        cambiate: []
    });
    assert.match(unknownCategory, /@@ITEM:1X FUORI MENU@@/);
});

test("receipt prints removed ingredients for kitchen and sala without grouping them with normal rows", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const row = {
        prodotto: "Margherita",
        categoria: "pizze",
        prezzoBase: 8,
        totale: 8,
        ingredienti: ["Pomodoro", "Basilico", "Mozzarella"]
    };
    const order = {
        numero: 42,
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [row, { ...row, senza: ["Basilico"] }],
        totale: 16
    };
    const options = {
        productIngredients: { Margherita: ["Pomodoro", "Basilico", "Mozzarella"] },
        kitchenCategories: new Set(["pizze"])
    };
    const cucina = formatReceipt(order, 80, { ...options, profile: "cucina" });
    const sala = formatReceipt(order, 80, { ...options, profile: "sala" });

    assert.equal((cucina.match(/@@ITEM:1X MARGHERITA@@/g) || []).length, 2);
    assert.match(cucina, /@@SMALL: {2}POMODORO, MOZZARELLA@@/);
    const ingredientLines = cucina.split(/\r?\n/).filter(line => line.startsWith("@@SMALL:"));
    assert.equal(ingredientLines.filter(line => line.includes("BASILICO")).length, 1);
    assert.match(cucina, /@@ITEM:\x20{2}- SENZA BASILICO@@/);
    assert.equal((sala.match(/@@ITEM:1X MARGHERITA/g) || []).length, 2);
    assert.match(sala, /\x20{2}- senza basilico/);
});

test("receipt keeps a pizza with a note separate and prints its notes in the NOTE section", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const plain = {
        prodotto: "Margherita",
        categoria: "pizze",
        prezzoBase: 8,
        totale: 8,
        ingredienti: ["Pomodoro", "Basilico"]
    };
    const order = {
        numero: 43,
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [
            plain,
            { ...plain, senza: ["Basilico"], note: ["Ben cotta"], extra: [{ nome: "Bufala", prezzo: 2 }], totale: 10 }
        ],
        totale: 18
    };
    const options = {
        productIngredients: { Margherita: ["Pomodoro", "Basilico"] },
        kitchenCategories: new Set(["pizze"])
    };
    const cucina = formatReceipt(order, 80, { ...options, profile: "cucina" });
    const sala = formatReceipt(order, 80, { ...options, profile: "sala" });
    for (const receipt of [cucina, sala]) {
        const lines = receipt.split(/\r?\n/);
        const noteHeader = lines.indexOf("NOTE:");
        const section = lines.indexOf("@@SECTION:PIZZE@@");
        const note = lines.indexOf("@@NOTEBIG:! BEN COTTA@@");

        assert.ok(noteHeader >= 0 && noteHeader < note && note < section);
        assert.equal(lines[noteHeader + 1], "@@ITEM:1X MARGHERITA@@");
        assert.equal(lines.filter(line => line.includes("BEN COTTA")).length, 1);
        assert.equal(lines.filter(line => line === "@@ITEM:  > VEDI NOTE@@").length, 1);
    }
    assert.equal((cucina.match(/@@ITEM:1X MARGHERITA@@/g) || []).length, 3);
    assert.match(cucina, /@@ITEM: {2}- SENZA BASILICO@@/);
    assert.match(cucina, /@@ITEM: {2}\+ BUFALA@@/);
    assert.equal((sala.match(/@@ITEM:1X MARGHERITA\s+EUR/g) || []).length, 2);
});

test("receipt groups products in Firestore category order using prices stored in order rows", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 13,
        tavoloOCliente: "Tavolo 2",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [
            { prodotto: "Coca Cola 33cl", categoria: "bibite", prezzoBase: 2.5, totale: 2.5 },
            { prodotto: "Patatine Piccole", categoria: "fritti", prezzoBase: 3, totale: 3 },
            { prodotto: "Margherita", categoria: "pizze", prezzoBase: 5, totale: 5 }
        ],
        totale: 15
    }, 80, { categoryOrder: ["pizze", "fritti", "bibite"] });
    const lines = receipt.split(/\r?\n/);
    const pizzaSection = lines.indexOf("@@SECTION:PIZZE@@");
    const friesSection = lines.indexOf("@@SECTION:FRITTI@@");
    const drinksSection = lines.indexOf("@@SECTION:BIBITE@@");
    const sectionText = index => {
        const nextSection = lines.findIndex((line, lineIndex) => (
            lineIndex > index && line.startsWith("@@SECTION:")
        ));
        return lines.slice(index + 1, nextSection === -1 ? lines.length : nextSection).join("\n");
    };

    assert.ok(pizzaSection >= 0 && pizzaSection < friesSection && friesSection < drinksSection);
    assert.match(sectionText(pizzaSection), /@@ITEM:1X MARGHERITA\s+EUR /);
    assert.match(sectionText(friesSection), /@@ITEM:1X PATATINE PICCOLE@@\n\s+EUR /);
    assert.match(sectionText(drinksSection), /@@ITEM:1X COCA COLA 33CL@@\n\s+EUR /);
});

test("grouped identical products print their combined line total", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [
            { prodotto: "Margherita", prezzoBase: 5, totale: 5 },
            { prodotto: "Margherita", prezzoBase: 5, totale: 5 }
        ],
        totale: 10
    });

    assert.match(receipt, /@@ITEM:2X MARGHERITA\s+EUR 10,00@@/);
});

test("receipt combines identical product variants while keeping different extras separate", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        tipo: "ritiro",
        tavoloOCliente: "Anna",
        telefonoRitiro: "333 1234567",
        dataOra: "2026-10-14T12:00:00.000Z",
        orario: "18:45",
        righe: [
            { prodotto: "Margherita", prezzoBase: 5, extra: [{ id: "bocconcino", nome: "Bocconcino", prezzo: 2 }], totale: 7 },
            { prodotto: "Margherita", prezzoBase: 5, extra: [{ id: "bocconcino", nome: "Bocconcino", prezzo: 2 }], totale: 7 },
            { prodotto: "Margherita", prezzoBase: 5, extra: [], totale: 5 }
        ],
        totale: 17
    });
    const lines = receipt.split(/\r?\n/);
    const itemLines = lines.filter(line => /^@@ITEM:\d+X MARGHERITA/.test(line));

    assert.match(receipt, /@@TITLE:RITIRO@@/);
    assert.match(receipt, /@@BIG:ORARIO 18:45@@$/);
    assert.equal(lines[lines.length - 1], "@@BIG:ORARIO 18:45@@");
    assert.match(receipt, /TEL: 333 1234567/);
    assert.equal(itemLines.length, 2);
    assert.ok(itemLines.some(line => line.startsWith("@@ITEM:2X MARGHERITA") && line.includes("EUR 10,00")));
    assert.equal((receipt.match(/\+ BOCCONCINO/g) || []).length, 1);
    assert.ok(itemLines.some(line => line.startsWith("@@ITEM:1X MARGHERITA") && line.includes("EUR 5,00")));
    assert.match(receipt, /^ {2}\+ BOCCONCINO\s+EUR 4,00$/m);
});

test("delivery receipt prints contact details without a customer name", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 14,
        tipo: "consegna",
        tavoloOCliente: "Anna Rossi",
        indirizzoConsegna: "Via Roma 12, Napoli",
        telefonoConsegna: "+39 333 1234567",
        dataOra: "2026-10-14T12:00:00.000Z",
        orario: "22:00",
        statoPagamento: "pos",
        righe: [{ prodotto: "Margherita" }],
        totale: 5
    });
    const lines = receipt.split(/\r?\n/);

    assert.match(receipt, /@@TITLE:CONSEGNA - POS@@/);
    assert.doesNotMatch(receipt, /CLIENTE:|Anna Rossi/);
    assert.ok(receipt.includes("@@BIG:ORARIO 22:00@@"));
    assert.ok(receipt.includes("DATA: 14/10/2026"));
    assert.ok(receipt.includes("TEL: +39 333 1234567"));
    assert.ok(receipt.includes("INDIRIZZO:\r\n@@BOLD:VIA ROMA 12, NAPOLI@@"));
    assert.ok(receipt.indexOf("DATA:") < receipt.indexOf("TEL:"));
    assert.ok(receipt.indexOf("TEL:") < receipt.indexOf("INDIRIZZO:"));
    assert.ok(receipt.indexOf("@@TITLE:") < receipt.indexOf("@@SECTION:"));
    assert.equal(lines[2], "-".repeat(24));
    const productLine = lines.findIndex(line => line.startsWith("@@ITEM:1X MARGHERITA"));
    assert.ok(productLine >= 0);
    assert.equal(lines.some((line, index) => line === "" && lines[index + 1] === ""), false);
    assert.equal(lines[lines.length - 1], "@@BIG:ORARIO 22:00@@");
});

test("delivery title displays the available payment status", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const order = {
        tipo: "consegna",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [],
        totale: 0
    };

    for (const [status, label] of [
        ["pos", "POS"],
        ["pagato", "PAGATO"],
        ["non_pagato", "NON PAGATO"]
    ]) {
        const titleLine = formatReceipt({ ...order, statoPagamento: status }).split(/\r?\n/)[1];
        assert.equal(titleLine, `@@TITLE:CONSEGNA - ${label}@@`);
        assert.ok(label.length + "CONSEGNA - ".length <= 24);
    }
});

test("counter receipt has a dedicated title without destination details", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        tipo: "banco",
        cognomeBanco: "Rossi",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita" }],
        totale: 5
    });

    assert.match(receipt, /@@TITLE:BANCO@@/);
    assert.match(receipt, /COGNOME: ROSSI/);
    assert.doesNotMatch(receipt, /CLIENTE:|TAVOLO:/);
});

test("printer-specific receipts are sent and retries skip a printer that already received it", async () => {
    const { sendOrderToPrinters } = require("../scripts/printer-agent");
    const order = {
        numero: 19,
        tavoloOCliente: "Tavolo 3",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita" }],
        totale: 7
    };
    const printers = [
        { name: "Cucina", host: "192.168.1.222", port: 9100 },
        { name: "Sala", host: "192.168.1.223", port: 9100 }
    ];
    const successful = [];
    const firstAttempt = [];

    await assert.rejects(sendOrderToPrinters(order, printers, {
        print: async (_order, printer, receipt) => {
            firstAttempt.push({ name: printer.name, receipt });
            if (printer.name === "Sala") throw new Error("sala_offline");
        },
        onPrinterPrinted: async name => successful.push(name)
    }), /sala_offline/);

    assert.deepEqual(successful, ["Cucina"]);
    assert.deepEqual(firstAttempt.map(item => item.name), ["Cucina", "Sala"]);

    const retry = [];
    await sendOrderToPrinters(order, printers, {
        alreadyPrinted: successful,
        print: async (_order, printer, receipt) => retry.push({ name: printer.name, receipt })
    });

    assert.deepEqual(retry.map(item => item.name), ["Sala"]);
    assert.equal(retry[0].receipt, firstAttempt[1].receipt);
    assert.notEqual(firstAttempt[0].receipt, firstAttempt[1].receipt);
});

test("receipt wraps long product, destination and note text to the configured roll width", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 128,
        tavoloOCliente: "Cliente con un nominativo molto lungo da stampare senza tagli",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{
            prodotto: "Pizza speciale con ingredienti molto lunghi e descrittivi",
            extra: [{ nome: "Extra con nome particolarmente lungo da mandare a capo" }]
        }],
        note: "Nota con dettagli importanti per la preparazione",
        totale: 12
    });
    const lines = receipt.split(/\r?\n/);

    assert.ok(lines.every(line => receiptLineFits(line, 24)));
    assert.ok(receipt.replace(/\r?\n/g, " ").includes("CLIENTE CON UN NOMINATIVO MOLTO LUNGO"));
    assert.ok(receipt.includes("NOTE:"));
    assert.ok(receipt.replace(/@@NOTEBIG:(.*)@@/g, "$1").replace(/\r?\n/g, " ").includes("DETTAGLI IMPORTANTI"));
    assert.ok(receipt.indexOf("NOTE:") < receipt.indexOf("@@SECTION:"));
    assert.ok(receipt.replace(/\r?\n/g, " ").includes("  + EXTRA CON NOME"));
});

test("receipt fills the configured 58 mm and 80 mm roll widths", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const order = {
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", totale: 8 }],
        totale: 8
    };
    const narrowReceipt = formatReceipt(order, 58);
    const wideReceipt = formatReceipt(order, 80);

    assert.equal(narrowReceipt.split(/\r?\n/)[2], "-".repeat(16));
    assert.equal(wideReceipt.split(/\r?\n/)[2], "-".repeat(24));
    assert.ok(narrowReceipt.split(/\r?\n/).every(line => receiptLineFits(line, 16)));
    assert.ok(wideReceipt.split(/\r?\n/).every(line => receiptLineFits(line, 24)));
});

test("sala prints cover charge after the convention line and keeps long menu counts on one line", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const lines = formatReceipt({
        numero: 47,
        tipo: "tavolo",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [],
        coperto: { persone: 2, totale: 4 },
        totaleLordo: 17,
        convenzione: { tipo: "menu", menu: 2, importo: 1, prezzoMenu: 6, totaleMenu: 12 },
        totale: 16
    }, 80).split(/\r?\n/);
    const subtotal = lines.findIndex(line => line.startsWith("SUBTOTALE"));
    const menu = lines.findIndex(line => line.startsWith("2 MENU X 6,00"));
    const cover = lines.findIndex(line => line.startsWith("COPERTO 2X"));
    const total = lines.findIndex(line => line.startsWith("TOTALE"));

    assert.match(lines[subtotal], /EUR 13,00$/);
    assert.ok(subtotal < menu && menu < cover && cover < total);
    assert.match(lines[total], /EUR 16,00$/);

    const tenMenus = formatReceipt({
        numero: 48,
        tipo: "ritiro",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [],
        totaleLordo: 70,
        convenzione: { tipo: "menu", menu: 10, importo: 10, prezzoMenu: 6, totaleMenu: 60 },
        totale: 60
    }, 80).split(/\r?\n/);
    assert.ok(tenMenus.includes("10 MENU X 6,00 EUR 60,00"));
});

test("sala keeps long removed ingredients on indented continuation lines", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const lines = formatReceipt({
        numero: 49,
        tipo: "tavolo",
        tavoloOCliente: "1",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{
            prodotto: "Capricciosa",
            categoria: "pizze",
            prezzoBase: 7,
            totale: 7,
            senza: ["olive taggiasche", "carciofini sott'olio"]
        }],
        totale: 7
    }, 80).split(/\r?\n/);

    assert.equal(lines.filter(line => line.startsWith("  - senza ")).length, 2);
    assert.ok(lines.includes("  - senza olive"));
    assert.ok(lines.includes("          taggiasche"));
    assert.ok(lines.includes("  - senza carciofini"));
    assert.ok(lines.includes("          sott'olio"));
});
