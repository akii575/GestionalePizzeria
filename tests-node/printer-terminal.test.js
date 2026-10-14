const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer, normalizePrinter } = require("../scripts/printer-terminal");

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

test("Windows printer states are normalized without treating unknown as online", () => {
    assert.equal(normalizePrinter({ status: "Normal" }).state, "ready");
    assert.equal(normalizePrinter({ status: "Printing" }).state, "busy");
    assert.equal(normalizePrinter({ status: "Offline" }).state, "unavailable");
    assert.equal(normalizePrinter({ status: "Other" }).state, "unknown");
    assert.equal(normalizePrinter({ status: "Normal", isVirtual: true }).isVirtual, true);
});

test("receipt includes order number, destination, product extras and notes", () => {
    const { formatReceipt } = require("../scripts/printer-agent");
    const receipt = formatReceipt({
        numero: 12,
        tavoloOCliente: "Tavolo 4",
        dataOra: "2026-10-14T12:00:00.000Z",
        righe: [{ prodotto: "Margherita", extra: [{ nome: "Bufala" }] }],
        note: "Senza basilico",
        totale: 9.5
    });
    assert.match(receipt, /COMANDA #12/);
    assert.match(receipt, /TAVOLO: Tavolo 4/);
    assert.match(receipt, /Margherita/);
    assert.match(receipt, /\+ Bufala/);
    assert.match(receipt, /Senza basilico/);
    assert.ok(receipt.includes("EUR 9.50"));
});
