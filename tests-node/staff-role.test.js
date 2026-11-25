const test = require("node:test");
const assert = require("node:assert/strict");
const { apiRoute } = require("./api-router-helper");
const firebasePath = require.resolve("../lib/firebase-admin");
const originalFirebaseAdmin = require(firebasePath);
let services;
require.cache[firebasePath].exports = {
    getFirebaseServices() {
        return services || originalFirebaseAdmin.getFirebaseServices();
    }
};
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");

function requestWithClaims(cookie = "valid") {
    return {
        headers: { cookie: `__Host-session=${cookie}` }
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

function createResetDatabase() {
    const collections = new Map();
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
        async set(value, options = {}) {
            const current = documents(name).get(String(id)) || {};
            documents(name).set(String(id), options.merge ? { ...current, ...value } : value);
        },
        async update(value) {
            const current = documents(name).get(String(id)) || {};
            documents(name).set(String(id), { ...current, ...value });
        },
        async delete() {
            documents(name).delete(String(id));
        }
    });
    const snapshot = entries => ({
        empty: entries.length === 0,
        docs: entries.map(([id, value]) => ({
            id,
            ref: ref("unused", id),
            data: () => value
        }))
    });
    const collection = name => ({
        doc: id => ref(name, id),
        async get() {
            return snapshot([...documents(name).entries()]);
        },
        limit() {
            return { get: async () => snapshot([]) };
        },
        where() {
            return { get: async () => snapshot([]) };
        }
    });
    return {
        collection,
        async runTransaction(callback) {
            return callback({
                get: documentRef => documentRef.get(),
                set: (documentRef, value, options) => documentRef.set(value, options),
                update: (documentRef, value) => documentRef.update(value)
            });
        },
        batch() {
            const operations = [];
            return {
                set(documentRef, value, options) {
                    operations.push(() => documentRef.set(value, options));
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
        }
    };
}

test("staff access accepts admins and staff but rejects delivery and accounts without claims", async t => {
    services = {
        auth: {
            verifySessionCookie: async token => ({
                "admin-session": { admin: true },
                "staff-session": { staff: true },
                "delivery-session": { delivery: true },
                "empty-session": {}
            })[token]
        }
    };
    t.after(() => { services = null; });

    for (const [cookie, accepted] of [
        ["admin-session", { admin: true }],
        ["staff-session", { staff: true }]
    ]) {
        assert.deepEqual(await auth.requireStaffAccess(requestWithClaims(cookie)), accepted);
    }
    for (const cookie of ["delivery-session", "empty-session"]) {
        await assert.rejects(auth.requireStaffAccess(requestWithClaims(cookie)), error => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Accesso negato.");
            return true;
        });
    }

    assert.deepEqual(
        await auth.requireDeliveryAccess(requestWithClaims("delivery-session")),
        { delivery: true }
    );
});

test("only admins can reset order numbers", async t => {
    t.mock.method(auth, "requireStaffAccess", async () => ({ staff: true }));
    t.mock.method(auth, "requireAdmin", async request => {
        if (request.headers["x-test-role"] !== "admin") {
            const error = new Error("Accesso negato.");
            error.statusCode = 403;
            throw error;
        }
        return { admin: true };
    });
    t.mock.method(auth, "requireSameOrigin", () => {});
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db: createResetDatabase() }));
    const handler = apiRoute("reset-numeri");
    const responseOptions = {
        method: "POST",
        headers: {
            "x-test-role": "staff",
            origin: "https://example.test",
            host: "example.test"
        }
    };

    const staffResponse = await invoke(handler, responseOptions);
    assert.equal(staffResponse.statusCode, 403);
    assert.equal(staffResponse.body.errore, "Accesso negato.");

    const adminResponse = await invoke(handler, {
        ...responseOptions,
        headers: { ...responseOptions.headers, "x-test-role": "admin" }
    });
    assert.equal(adminResponse.statusCode, 200);
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
    const handler = apiRoute("auth/session");
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
    const claims = {
        "staff-session": { staff: true, email: "staff@example.com" },
        "admin-session": { admin: true, staff: true, delivery: true }
    };
    services = {
        auth: { verifySessionCookie: async token => claims[token] }
    };
    t.after(() => { services = null; });
    const handler = apiRoute("auth/verify");

    let response = await invoke(handler, { headers: { cookie: "__Host-session=staff-session" } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        admin: false,
        staff: true,
        delivery: false,
        email: "staff@example.com"
    });

    response = await invoke(handler, { headers: { cookie: "__Host-session=admin-session" } });
    assert.deepEqual(response.body, {
        admin: true,
        staff: false,
        delivery: false,
        email: ""
    });
});

test("staff can access protected pages", async t => {
    t.mock.method(auth, "requireStaffAccess", async () => ({ staff: true, email: "staff@example.com" }));
    const handler = apiRoute("pages/gestionale.html");

    const response = await invoke(handler);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Tutti gli ordini/);
});

test("the server protects the menu page with the admin-only role", async t => {
    t.mock.method(auth, "requireAdmin", async () => ({ admin: true, email: "admin@example.com" }));
    const handler = apiRoute("pages/menu.html");

    const response = await invoke(handler);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /menu-editor\.js/);
});

test("delivery accounts can access only the delivery page on the server", async t => {
    t.mock.method(auth, "requireDeliveryAccess", async () => ({ delivery: true }));
    t.mock.method(auth, "requireStaffAccess", async () => {
        const error = new Error("Accesso negato.");
        error.statusCode = 403;
        throw error;
    });
    const deliveryHandler = apiRoute("pages/consegne.html");
    const adminHandler = apiRoute("pages/gestionale.html");

    const deliveryPage = await invoke(deliveryHandler);
    assert.equal(deliveryPage.statusCode, 200);
    const adminPage = await invoke(adminHandler);
    assert.equal(adminPage.statusCode, 403);
});

test("staff and delivery roles cannot access the menu page on the server", async t => {
    t.mock.method(auth, "requireAdmin", async () => {
        const error = new Error("Accesso negato.");
        error.statusCode = 403;
        throw error;
    });
    const handler = apiRoute("pages/menu.html");

    const response = await invoke(handler);
    assert.equal(response.statusCode, 403);
});

test("staff pages hide only the four daily displayed totals", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const staticPath = path.join(__dirname, "../src/main/resources/static");
    for (const page of ["ritiri.html", "banco.html", "tavoli.html", "gestionale.html"]) {
        const html = fs.readFileSync(path.join(staticPath, page), "utf8");
        assert.match(html, /class="metriche__totale" data-hide-for-staff[^>]*aria-label="Totale visualizzato"/);
    }
    const deliveries = fs.readFileSync(path.join(staticPath, "consegne.html"), "utf8");
    assert.doesNotMatch(deliveries, /data-hide-for-staff/);
    assert.match(deliveries, /class="metriche__totale"[^>]*aria-label="Totale consegne"/);
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
            body: {
                dataset: { serviceType: "" },
                addEventListener() {}
            },
            getElementById: element,
            addEventListener() {},
            visibilityState: "visible"
        },
        window: {
            authReady: Promise.resolve(true),
            currentAccount: { admin: false, staff: true },
            orderCard: {
                bindReprints() {
                    return { refresh() {}, isOpen() { return false; } };
                },
                bindDateFilter() {},
                currentServiceDate() { return "2026-11-24"; },
                createExpansionState() {
                    return { isOpen() { return false; }, toggle() {} };
                },
                render() { return ""; }
            }
        },
        fetch: async url => ({
            ok: true,
            async json() {
                return url === "/api/menu" ? [] : { versione: 1, ordini: [order] };
            }
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
