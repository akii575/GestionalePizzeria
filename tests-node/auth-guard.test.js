const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const guardSource = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/auth-guard.js"),
    "utf8"
);
const accountCacheKey = "civico7-account-v1";

function createStorage(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, value);
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

function response(status, account) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => account
    };
}

async function runGuard(pathname, account = { admin: true, delivery: false, email: "admin@example.com" }, options = {}) {
    const appendedElements = [];
    const navigationElements = [];
    const adminOnlyElements = Array.from({ length: 6 }, () => ({ hidden: false }));
    const hideForStaffElements = Array.from({ length: 1 }, () => ({ hidden: false }));
    const classNames = new Set();
    const classChanges = [];
    const bodyChildren = [];
    const navigation = {
        append(...elements) { navigationElements.push(...elements); },
        querySelector(selector) {
            return selector === ".auth-logout"
                ? navigationElements.find(element => element.className === "auth-logout") || null
                : null;
        }
    };
    const document = {
        documentElement: {
            classList: {
                add(name) {
                    classNames.add(name);
                    classChanges.push({ action: "add", name });
                },
                remove(name) {
                    classNames.delete(name);
                    classChanges.push({ action: "remove", name });
                }
            }
        },
        body: {
            append(...elements) {
                appendedElements.push(...elements);
                bodyChildren.push(...elements);
            },
            prepend(...elements) {
                appendedElements.unshift(...elements);
                bodyChildren.unshift(...elements);
            },
            replaceChildren() {
                bodyChildren.length = 0;
                appendedElements.length = 0;
            }
        },
        querySelectorAll(selector) {
            if (selector === "[data-admin-only]") return adminOnlyElements;
            if (selector === "[data-hide-for-staff]") return hideForStaffElements;
            return [];
        },
        querySelector(selector) {
            if (selector === ".dashboard-header nav") return navigation;
            if (selector === ".account-toolbar") {
                return bodyChildren.find(element => element.className === "account-toolbar") || null;
            }
            return null;
        },
        createElement(tagName) {
            return {
                tagName,
                children: [],
                listeners: {},
                setAttribute() {},
                addEventListener(name, listener) { this.listeners[name] = listener; },
                append(...elements) { this.children.push(...elements); }
            };
        }
    };
    const localStorage = options.localStorage || createStorage(
        options.cachedAccount
            ? { [accountCacheKey]: JSON.stringify(options.cachedAccount) }
            : {}
    );
    const sessionStorage = options.sessionStorage || createStorage();
    let resolveVerify;
    const verifyPromise = options.pendingVerify
        ? new Promise(resolve => { resolveVerify = resolve; })
        : Promise.resolve(options.verifyResponse || response(200, account));
    const requests = [];
    const location = {
        pathname,
        replacedTo: null,
        reloadCount: 0,
        replace(url) { this.replacedTo = url; },
        reload() { this.reloadCount += 1; }
    };
    const window = {
        location,
        localStorage,
        sessionStorage,
        civico7ClearOfflineCaches: async () => {},
        fetch: async (input, init) => {
            requests.push({ input, init });
            if (input === "/api/auth/verify") return verifyPromise;
            if (input === "/api/auth/logout") return options.logoutResponse || response(200);
            return options.apiResponse || response(200);
        }
    };

    vm.runInNewContext(guardSource, { document, window });
    const authorized = await window.authReady;
    return {
        adminOnlyElements,
        appendedElements,
        authorized,
        classChanges,
        classNames,
        hideForStaffElements,
        localStorage,
        location,
        navigationElements,
        requests,
        resolveVerify,
        sessionStorage,
        window
    };
}

test("the account toolbar is never created on home, including optimistic verification", async () => {
    for (const pathname of ["/", "/index.html"]) {
        const staff = {
            admin: false,
            staff: true,
            delivery: false,
            email: "staff@example.com",
            verificatoAlle: Date.now() - 1000
        };
        const result = await runGuard(pathname, staff, {
            cachedAccount: staff,
            pendingVerify: true
        });

        assert.equal(result.appendedElements.length, 0, `${pathname} should not create a toolbar before verification`);
        result.resolveVerify(response(200, staff));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(result.appendedElements.length, 0, `${pathname} should not create a toolbar after verification`);
    }
    assert.doesNotMatch(guardSource, /account-toolbar|showToolbar/);
});

test("delivery account is allowed only on the delivery page", async () => {
    const delivery = { admin: false, delivery: true, email: "corriere@example.com" };
    const page = await runGuard("/consegne.html", delivery);
    assert.equal(page.authorized, true);
    assert.equal(page.window.currentAccount.delivery, true);
    assert.equal(page.appendedElements.length, 0);
    assert.equal(page.navigationElements.length, 1);
    assert.equal(page.navigationElements[0].textContent, "Esci");
    assert.deepEqual(page.adminOnlyElements.map(element => element.hidden), [true, true, true, true, true, true]);

    for (const pathname of ["/gestionale.html", "/ritiri.html", "/banco.html", "/tavoli.html", "/ordini.html"]) {
        const adminPage = await runGuard(pathname, delivery);
        assert.equal(adminPage.authorized, false, `${pathname} must remain admin-only`);
        assert.equal(adminPage.window.currentAccount, undefined);
    }
});

test("the menu page is restricted to administrators", async () => {
    const admin = await runGuard("/menu.html", { admin: true, staff: false, delivery: false });
    assert.equal(admin.authorized, true);

    for (const account of [
        { admin: false, staff: true, delivery: false },
        { admin: false, staff: false, delivery: true }
    ]) {
        const denied = await runGuard("/menu.html", account);
        assert.equal(denied.authorized, false);
        assert.equal(denied.window.currentAccount, undefined);
    }
});

test("admin can see admin-only navigation on the delivery page", async () => {
    const page = await runGuard("/consegne.html");
    assert.equal(page.authorized, true);
    assert.deepEqual(page.adminOnlyElements.map(element => element.hidden), [false, false, false, false, false, false]);
    assert.deepEqual(page.hideForStaffElements.map(element => element.hidden), [false]);
    assert.equal(page.appendedElements.length, 0);
    assert.equal(page.navigationElements.length, 1);
});

test("staff has admin access without a home toolbar and not staff-hidden summaries", async () => {
    const staff = { admin: false, staff: true, delivery: false, email: "staff@example.com" };
    for (const pathname of ["/", "/gestionale.html", "/ritiri.html", "/banco.html", "/tavoli.html", "/ordini.html", "/consegne.html"]) {
        const page = await runGuard(pathname, staff);
        assert.equal(page.authorized, true, `${pathname} should allow staff`);
        assert.equal(page.window.currentAccount.staff, true);
        assert.deepEqual(page.adminOnlyElements.map(element => element.hidden), [false, false, false, false, false, false]);
        assert.deepEqual(page.hideForStaffElements.map(element => element.hidden), [true]);
        assert.equal(page.appendedElements.length, 0);
    }
});

test("admin claim takes precedence over staff", async () => {
    const page = await runGuard("/gestionale.html", { admin: true, staff: true, delivery: false });
    assert.equal(page.authorized, true);
    assert.equal(page.window.currentAccount.admin, true);
    assert.equal(page.window.currentAccount.staff, false);
    assert.deepEqual(page.hideForStaffElements.map(element => element.hidden), [false]);
});

test("a one-hour staff cache on orders starts immediately and lets API requests run during verification", async () => {
    const staff = {
        admin: false,
        staff: true,
        delivery: false,
        email: "staff@example.com",
        verificatoAlle: Date.now() - 60 * 60 * 1000
    };
    const page = await runGuard("/ordini.html", staff, { cachedAccount: staff, pendingVerify: true });

    assert.equal(page.authorized, true);
    assert.equal(page.classNames.has("auth-loading"), false);
    assert.equal(page.window.currentAccount.staff, true);
    assert.deepEqual(page.adminOnlyElements.map(element => element.hidden), [false, false, false, false, false, false]);

    const apiCall = await page.window.fetch("/api/orders");
    assert.equal(apiCall.status, 200);
    assert.equal(page.requests.some(request => request.input === "/api/orders"), true);
    page.resolveVerify(response(200, staff));
});

test("delivery cache is not optimistic on the orders page", async () => {
    const delivery = {
        admin: false,
        staff: false,
        delivery: true,
        email: "corriere@example.com",
        verificatoAlle: Date.now() - 60 * 60 * 1000
    };
    const page = await runGuard("/ordini.html", delivery, { cachedAccount: delivery });

    assert.equal(page.authorized, false);
    assert.equal(page.classChanges[0].name, "auth-loading");
    assert.equal(page.classChanges[0].action, "add");
    assert.equal(page.requests[0].input, "/api/auth/verify");
});

test("a 13-hour account cache is not eligible for optimistic startup", async () => {
    const cached = {
        admin: false,
        staff: true,
        delivery: false,
        verificatoAlle: Date.now() - 13 * 60 * 60 * 1000
    };
    const page = await runGuard("/ordini.html", cached, { cachedAccount: cached });

    assert.equal(page.authorized, true);
    assert.equal(page.classChanges[0].name, "auth-loading");
    assert.equal(page.window.civico7AuthRules.isOptimisticAccount(cached, "/ordini.html"), false);
});

test("a 401 from an API request during optimistic startup clears the account and redirects to login", async () => {
    const cached = {
        admin: true,
        staff: false,
        delivery: false,
        email: "admin@example.com",
        verificatoAlle: Date.now() - 1000
    };
    const page = await runGuard("/", cached, {
        cachedAccount: cached,
        pendingVerify: true,
        apiResponse: response(401)
    });

    await page.window.fetch("/api/orders");

    assert.equal(page.localStorage.getItem(accountCacheKey), null);
    assert.equal(page.location.replacedTo, "/login.html");
    page.resolveVerify(response(200, cached));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.localStorage.getItem(accountCacheKey), null);
});

test("a changed role updates the cache and triggers at most one reload", async () => {
    const staff = {
        admin: false,
        staff: true,
        delivery: false,
        email: "staff@example.com",
        verificatoAlle: Date.now() - 1000
    };
    const admin = { admin: true, staff: false, delivery: false, email: "admin@example.com" };
    const sessionStorage = createStorage();
    const firstLoad = await runGuard("/ordini.html", admin, {
        cachedAccount: staff,
        sessionStorage
    });

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(firstLoad.location.reloadCount, 1);
    assert.equal(JSON.parse(firstLoad.localStorage.getItem(accountCacheKey)).admin, true);

    const secondLoad = await runGuard("/ordini.html", admin, {
        localStorage: firstLoad.localStorage,
        sessionStorage
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(secondLoad.location.reloadCount, 0);
    assert.equal(sessionStorage.getItem("civico7-account-role-reload"), null);
});

test("guard logout removes the account cache", async () => {
    const page = await runGuard("/consegne.html");
    const logoutButton = page.navigationElements[0];

    assert.notEqual(page.localStorage.getItem(accountCacheKey), null);
    await logoutButton.listeners.click();
    assert.equal(page.localStorage.getItem(accountCacheKey), null);
    assert.equal(page.location.replacedTo, "/login.html");
});

test("a network failure during optimistic verification keeps the cached account usable", async () => {
    const cached = {
        admin: false,
        staff: true,
        delivery: false,
        email: "staff@example.com",
        verificatoAlle: Date.now() - 1000
    };
    const page = await runGuard("/ordini.html", cached, {
        cachedAccount: cached,
        verifyResponse: Promise.reject(new Error("offline"))
    });

    assert.equal(page.authorized, true);
    assert.equal(page.window.currentAccount.staff, true);
    assert.equal(page.location.replacedTo, null);
});
