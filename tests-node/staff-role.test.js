const test = require("node:test");
const assert = require("node:assert/strict");
const firebasePath = require.resolve("../lib/firebase-admin");
const originalFirebaseAdmin = require(firebasePath);
let services;
require.cache[firebasePath].exports = {
    getFirebaseServices() {
        return services || originalFirebaseAdmin.getFirebaseServices();
    }
};
const auth = require("../lib/auth");

function requestWithClaims() {
    return {
        headers: { cookie: "__Host-session=valid" }
    };
}

function invoke(handler, { method = "GET", headers = {}, body, query = {} } = {}) {
    return new Promise(resolve => {
        const response = {
            headers: {},
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(bodyValue) {
                this.body = bodyValue;
                resolve(this);
                return this;
            },
            end() {
                resolve(this);
                return this;
            },
            send(bodyValue) {
                this.body = bodyValue;
                resolve(this);
                return this;
            },
            redirect(code, location) {
                this.statusCode = code;
                this.location = location;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        handler({ method, headers, body, query }, response);
    });
}

test("staff access accepts admins and staff but rejects delivery and accounts without claims", async t => {
    let claims = {};
    services = {
        auth: { verifySessionCookie: async () => claims }
    };
    t.after(() => { services = null; });

    for (const accepted of [{ admin: true }, { staff: true }]) {
        claims = accepted;
        assert.deepEqual(await auth.requireStaffAccess(requestWithClaims()), accepted);
    }
    for (const rejected of [{ delivery: true }, {}]) {
        claims = rejected;
        await assert.rejects(auth.requireStaffAccess(requestWithClaims()), error => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Accesso negato.");
            return true;
        });
    }

    claims = { staff: true };
    assert.deepEqual(await auth.requireDeliveryAccess(requestWithClaims()), claims);
});

test("staff can create a Firebase session", async t => {
    let verifiedToken;
    services = {
        auth: {
            verifyIdToken: async token => {
                verifiedToken = token;
                return { staff: true };
            },
            createSessionCookie: async (token, options) => {
                assert.equal(token, "id-token");
                assert.equal(options.expiresIn, 5 * 24 * 60 * 60 * 1000);
                return "staff-session";
            }
        }
    };
    t.after(() => { services = null; });
    const handler = require("../api/auth/session");
    const response = await invoke(handler, {
        method: "POST",
        headers: { origin: "https://example.test", host: "example.test" },
        body: { idToken: "id-token" }
    });

    assert.equal(verifiedToken, "id-token");
    assert.equal(response.statusCode, 204);
    assert.equal(
        response.headers["Set-Cookie"],
        "__Host-session=staff-session; Max-Age=432000; Path=/; Secure; HttpOnly; SameSite=Lax"
    );
});

test("verify reports staff and gives admin precedence when both claims are present", async t => {
    let claims = { staff: true, email: "staff@example.com" };
    services = {
        auth: { verifySessionCookie: async () => claims }
    };
    t.after(() => { services = null; });
    const handler = require("../api/auth/verify");

    let response = await invoke(handler, { headers: { cookie: "__Host-session=valid" } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        admin: false,
        staff: true,
        delivery: false,
        email: "staff@example.com"
    });

    claims = { admin: true, staff: true, delivery: true };
    response = await invoke(handler, { headers: { cookie: "__Host-session=valid" } });
    assert.deepEqual(response.body, {
        admin: true,
        staff: false,
        delivery: false,
        email: ""
    });
});

test("staff can access protected pages", async t => {
    t.mock.method(auth, "requireStaffAccess", async () => ({ staff: true, email: "staff@example.com" }));
    const handlerPath = require.resolve("../api/pages/[page]");
    delete require.cache[handlerPath];
    const handler = require(handlerPath);
    t.after(() => delete require.cache[handlerPath]);

    const response = await invoke(handler, { query: { page: "gestionale.html" } });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Tutti gli ordini/);
});

test("delivery accounts can access only the delivery page on the server", async t => {
    t.mock.method(auth, "requireDeliveryAccess", async () => ({ delivery: true }));
    t.mock.method(auth, "requireStaffAccess", async () => {
        const error = new Error("Accesso negato.");
        error.statusCode = 403;
        throw error;
    });
    const handlerPath = require.resolve("../api/pages/[page]");
    delete require.cache[handlerPath];
    const handler = require(handlerPath);
    t.after(() => delete require.cache[handlerPath]);

    const deliveryPage = await invoke(handler, { query: { page: "consegne.html" } });
    assert.equal(deliveryPage.statusCode, 200);
    const adminPage = await invoke(handler, { query: { page: "gestionale.html" } });
    assert.equal(adminPage.statusCode, 403);
});

test("staff pages hide only the four daily displayed totals", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const staticPath = path.join(__dirname, "../src/main/resources/static");
    for (const page of ["ritiri.html", "banco.html", "tavoli.html", "gestionale.html"]) {
        const html = fs.readFileSync(path.join(staticPath, page), "utf8");
        assert.match(html, /<div data-hide-for-staff><span>Totale visualizzato<\/span><strong id="totale-ordini">/);
    }
    const deliveries = fs.readFileSync(path.join(staticPath, "consegne.html"), "utf8");
    assert.doesNotMatch(deliveries, /data-hide-for-staff/);
    assert.match(deliveries, /<span>Totale consegne<\/span><strong id="totale-consegne">/);
});

test("gestionale skips calculating the daily total for staff", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const vm = require("node:vm");
    const source = fs.readFileSync(path.join(__dirname, "../src/main/resources/static/gestionale.js"), "utf8");
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                addEventListener() {},
                querySelectorAll() { return []; },
                insertAdjacentHTML() {},
                className: "",
                value: "",
                checked: false
            });
        }
        return elements.get(id);
    }
    const order = { numero: 1, dataOra: new Date().toISOString(), tipo: "tavolo" };
    Object.defineProperty(order, "totale", {
        get() {
            throw new Error("Staff must not calculate the displayed daily total.");
        }
    });
    const context = {
        document: {
            body: { dataset: { serviceType: "" } },
            getElementById: element,
            addEventListener() {},
            visibilityState: "visible"
        },
        window: {
            authReady: Promise.resolve(true),
            currentAccount: { admin: false, staff: true },
            orderCard: { bindReprints() {}, render() { return ""; } }
        },
        fetch: async url => ({
            ok: true,
            async json() { return url === "/api/menu" ? [] : [order]; }
        }),
        setInterval() { return 1; },
        clearInterval() {},
        Intl,
        Date,
        Promise,
        URLSearchParams,
        Set
    };
    vm.runInNewContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element("numero-ordini").textContent, 1);
});
