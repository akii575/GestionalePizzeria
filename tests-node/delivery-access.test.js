const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");

function invoke(handler, role, method = "GET") {
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
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        handler({ method, headers: { "x-test-role": role }, query: {} }, response);
    });
}

test("delivery accounts can read only delivery orders and cannot use admin order APIs", async t => {
    t.mock.method(auth, "requireDeliveryAccess", async req => {
        if (["admin", "delivery"].includes(req.headers["x-test-role"])) return {};
        const error = new Error("Accesso negato.");
        error.statusCode = 403;
        throw error;
    });
    t.mock.method(auth, "requireAdmin", async req => {
        if (req.headers["x-test-role"] === "admin") return {};
        const error = new Error("Accesso negato.");
        error.statusCode = 403;
        throw error;
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({
        db: {
            collection(name) {
                assert.equal(name, "orders");
                return {
                    where(field, operator, value) {
                        assert.deepEqual([field, operator, value], ["tipo", "==", "consegna"]);
                        return {
                            async get() {
                                return {
                                    docs: [
                                        { data: () => ({ numero: 4, tipo: "consegna", tavoloOCliente: "Cliente A" }) },
                                        { data: () => ({ numero: 3, tipo: "sala", tavoloOCliente: "Tavolo 2" }) }
                                    ]
                                };
                            }
                        };
                    }
                };
            }
        }
    }));

    const deliveriesPath = require.resolve("../api/consegne");
    const ordersPath = require.resolve("../api/ordini/index.js");
    delete require.cache[deliveriesPath];
    delete require.cache[ordersPath];
    const deliveriesHandler = require(deliveriesPath);
    const ordersHandler = require(ordersPath);
    t.after(() => {
        delete require.cache[deliveriesPath];
        delete require.cache[ordersPath];
    });

    const deliveries = await invoke(deliveriesHandler, "delivery");
    assert.equal(deliveries.statusCode, 200);
    assert.deepEqual(deliveries.body.map(order => order.tipo), ["consegna"]);
    assert.equal(deliveries.headers["Cache-Control"], "private, no-store");

    const blockedWrite = await invoke(ordersHandler, "delivery", "POST");
    assert.equal(blockedWrite.statusCode, 403);
    assert.equal(blockedWrite.body.errore, "Accesso negato.");
});
