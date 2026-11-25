const test = require("node:test");
const assert = require("node:assert/strict");
const { apiRoute } = require("./api-router-helper");

const protectedHandlers = [
    ["menu", apiRoute("menu"), "GET"],
    ["extras", apiRoute("extra"), "GET"],
    ["orders", apiRoute("ordini"), "GET"],
    ["deliveries", apiRoute("consegne"), "GET"],
    ["evening status", apiRoute("stato-serata"), "GET"],
    ["night history", apiRoute("storico"), "GET"],
    ["order update", apiRoute("ordini/1"), "PUT"],
    ["payment update", apiRoute("ordini/1"), "PATCH"],
    ["order reset", apiRoute("reset-numeri"), "POST"]
];

function invoke(handler, method) {
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
            end() {
                resolve(this);
                return this;
            },
            redirect(code, location) {
                this.statusCode = code;
                this.location = location;
                resolve(this);
                return this;
            },
            send(body) {
                this.body = body;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        handler({ method, headers: {}, query: { numero: "1" } }, response);
    });
}

test("protected HTML pages redirect unauthenticated visitors to login", async () => {
    const handler = apiRoute("pages/index.html");
    const response = await invoke(handler, "GET");
    assert.equal(response.statusCode, 302);
    assert.equal(response.location, "/login.html");
});

for (const [name, handler, method] of protectedHandlers) {
    test(`${name} API rejects unauthenticated requests`, async () => {
        const response = await invoke(handler, method);
        assert.equal(response.statusCode, 401);
        assert.equal(response.body.errore, "Autenticazione richiesta.");
    });
}
