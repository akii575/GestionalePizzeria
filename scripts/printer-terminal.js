const http = require("node:http");

const ALLOWED_ORIGIN = "https://gestionale-pizzeria-six.vercel.app";
const PORT = 8765;
const { createPrinterAgent, initializeFirestore } = require("./printer-agent");
const { listNetworkPrinters } = require("./network-printer");

function corsHeaders(request, response) {
    const origin = request.headers.origin;
    if (origin && origin !== ALLOWED_ORIGIN) {
        response.writeHead(403, { "Cache-Control": "no-store" });
        response.end();
        return false;
    }
    if (origin === ALLOWED_ORIGIN) {
        response.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
        response.setHeader("Vary", "Origin, Access-Control-Request-Private-Network");
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return true;
}

function createServer({ getPrinters = listNetworkPrinters, getStatus, retryFailed } = {}) {
    return http.createServer(async (request, response) => {
        if (request.url !== "/status" && request.url !== "/retry-failed") {
            response.writeHead(404, { "Cache-Control": "no-store" });
            response.end();
            return;
        }
        if (!corsHeaders(request, response)) {
            return;
        }
        if (request.method === "OPTIONS") {
            if (request.headers.origin !== ALLOWED_ORIGIN) {
                response.writeHead(403);
                response.end();
                return;
            }
            const headers = {
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "600"
            };
            if (request.headers["access-control-request-private-network"] === "true") {
                headers["Access-Control-Allow-Private-Network"] = "true";
            }
            response.writeHead(204, headers);
            response.end();
            return;
        }
        if (request.url === "/retry-failed") {
            if (request.method !== "POST" || request.headers.origin !== ALLOWED_ORIGIN) {
                response.writeHead(request.method === "POST" ? 403 : 405, { Allow: "POST, OPTIONS" });
                response.end();
                return;
            }
            try {
                const retried = await retryFailed();
                const body = JSON.stringify({ retried });
                response.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Length": Buffer.byteLength(body)
                });
                response.end(body);
            } catch (error) {
                console.error("Unable to retry failed print jobs:", error.code || error.name || "unknown");
                response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "retry_unavailable" }));
            }
            return;
        }
        if (request.method !== "GET") {
            response.writeHead(405, { Allow: "GET, OPTIONS" });
            response.end();
            return;
        }

        try {
            const [printers, agent] = await Promise.all([getPrinters(), getStatus()]);
            const body = JSON.stringify({ printers, agent, checkedAt: new Date().toISOString() });
            response.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": Buffer.byteLength(body)
            });
            response.end(body);
        } catch (error) {
            console.error("Unable to query Windows printers:", error.message);
            const body = JSON.stringify({ error: "printer_status_unavailable" });
            response.writeHead(503, {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": Buffer.byteLength(body)
            });
            response.end(body);
        }
    });
}

function start() {
    const db = initializeFirestore();
    const agent = createPrinterAgent(db);
    const server = createServer({
        getStatus: () => agent.status(),
        retryFailed: () => agent.retryFailed()
    });
    server.on("error", error => {
        console.error("Unable to start the printer terminal:", error.code || error.message);
        process.exitCode = 1;
    });
    server.listen(PORT, "127.0.0.1", () => {
        console.log(`Printer terminal listening on http://127.0.0.1:${PORT}`);
        console.log("Automatic printing is active; keep this computer connected to both network printers.");
        void agent.run();
    });
    process.once("SIGINT", async () => {
        await agent.stop();
        server.close(() => process.exit(0));
    });
}

if (require.main === module) {
    try {
        start();
    } catch (error) {
        console.error("Unable to start the printer terminal:", error.message);
        process.exitCode = 1;
    }
}

module.exports = { createServer };
