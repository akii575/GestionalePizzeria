const test = require("node:test");
const assert = require("node:assert/strict");

const protectedHandlers = [
    ["menu", require("../api/menu"), "GET"],
    ["extras", require("../api/extra"), "GET"],
    ["orders", require("../api/ordini"), "GET"],
    ["deliveries", require("../api/consegne"), "GET"],
    ["order update", require("../api/ordini/[numero]"), "PUT"],
    ["payment update", require("../api/ordini/[numero]"), "PATCH"],
    ["order reset", require("../api/reset-numeri"), "POST"]
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
    const handler = require("../api/pages/[page]");
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
