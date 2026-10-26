const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../scripts/printer-terminal");

const allowedOrigin = "https://gestionale-pizzeria-six.vercel.app";

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

test("receipt starts with notes and prints service, destination, unit prices and extras without order number", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 12,
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 4",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", prezzoBase: 8.5, extra: [{ nome: "Bufala", prezzo: 1 }], totale: 9.5 }],
        note: "Senza basilico",
        totale: 9.5
    });
    assert.equal(receipt.split(/\r?\n/)[0], "NOTE");
    assert.ok(receipt.indexOf("Senza basilico") < receipt.indexOf("@@TITLE:"));
    assert.match(receipt, /@@TITLE:SERVIZIO AL TAVOLO@@/);
    assert.match(receipt, /TAVOLO: Tavolo 4/);
    assert.match(receipt, /^@@SECTION:PIZZE@@$/m);
    assert.match(receipt, /1x Margherita\s+EUR 9,50/);
    assert.match(receipt, /\+ Bufala/);
    assert.doesNotMatch(receipt, /COMANDA #12/);
    assert.ok(receipt.includes("EUR 9,50"));
    assert.ok(receipt.split(/\r?\n/).every(line => Array.from(line).length <= 28));
});

test("receipt groups products by menu category in catalog order with their prices", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 13,
        tavoloOCliente: "Tavolo 2",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [
            { prodotto: "Coca Cola / Zero 33cl" },
            { prodotto: "Patatine Piccole" },
            { prodotto: "Margherita" }
        ],
        totale: 15
    });
    const lines = receipt.split(/\r?\n/);
    const pizzaSection = lines.indexOf("@@SECTION:PIZZE@@");
    const friesSection = lines.indexOf("@@SECTION:FRITTI@@");
    const drinksSection = lines.indexOf("@@SECTION:BIBITE@@");

    assert.ok(pizzaSection >= 0 && pizzaSection < friesSection && friesSection < drinksSection);
    assert.match(lines[pizzaSection + 1], /^1x Margherita\s+EUR /);
    assert.match(lines[friesSection + 1], /^1x Patatine Piccole\s+EUR /);
    assert.match(lines[drinksSection + 1], /^1x Coca Cola \/ Zero$/);
    assert.match(lines[drinksSection + 2], /^33cl\s+EUR /);
});

test("receipt combines identical product variants while keeping different extras separate", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        tipo: "ritiro",
        tavoloOCliente: "Anna",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [
            { prodotto: "Margherita", prezzoBase: 5, extra: [{ id: "fior-di-latte", nome: "Fior di latte", prezzo: 1 }], totale: 6 },
            { prodotto: "Margherita", prezzoBase: 5, extra: [{ id: "fior-di-latte", nome: "Fior di latte", prezzo: 1 }], totale: 6 },
            { prodotto: "Margherita", prezzoBase: 5, extra: [], totale: 5 }
        ],
        totale: 17
    });
    const lines = receipt.split(/\r?\n/);
    const itemLines = lines.filter(line => /^\d+x Margherita/.test(line));

    assert.match(receipt, /@@TITLE:RITIRO AL BANCO@@/);
    assert.equal(itemLines.length, 2);
    assert.ok(itemLines.some(line => line.startsWith("2x Margherita") && line.includes("EUR 6,00")));
    assert.ok(itemLines.some(line => line.startsWith("1x Margherita") && line.includes("EUR 5,00")));
});

test("delivery receipt prints customer contact details", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 14,
        tipo: "consegna",
        tavoloOCliente: "Anna Rossi",
        indirizzoConsegna: "Via Roma 12, Napoli",
        telefonoConsegna: "+39 333 1234567",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita" }],
        totale: 5
    });

    assert.match(receipt, /@@TITLE:CONSEGNA A DOMICILIO@@/);
    assert.ok(receipt.includes("CLIENTE: Anna Rossi"));
    assert.ok(receipt.includes("TEL: +39 333 1234567"));
    assert.ok(receipt.replace(/\r?\n/g, " ").includes("INDIRIZZO: Via Roma 12, Napoli"));
});

test("the same receipt is sent to both printers and retries skip a printer that already received it", async () => {
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
    assert.equal(retry[0].receipt, firstAttempt[0].receipt);
    assert.equal(firstAttempt[0].receipt, firstAttempt[1].receipt);
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
        note: "Prima riga della nota\nSeconda riga con ulteriori dettagli molto lunghi per la cucina",
        totale: 12
    });
    const lines = receipt.split(/\r?\n/);

    assert.ok(lines.every(line => Array.from(line).length <= 28));
    assert.ok(receipt.replace(/\r?\n/g, " ").includes("Cliente con un nominativo molto lungo"));
    assert.ok(receipt.replace(/\r?\n/g, " ").includes("Seconda riga con ulteriori dettagli"));
    assert.ok(receipt.replace(/\r?\n/g, " ").includes("  + Extra con nome"));
});
