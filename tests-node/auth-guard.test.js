const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const guardSource = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/auth-guard.js"),
    "utf8"
);

async function runGuard(pathname, account = { admin: true, delivery: false, email: "admin@example.com" }) {
    const appendedElements = [];
    const navigationElements = [];
    const adminOnlyElements = Array.from({ length: 6 }, () => ({ hidden: false }));
    const navigation = { append(...elements) { navigationElements.push(...elements); } };
    const document = {
        documentElement: { classList: { add() {}, remove() {} } },
        body: {
            append(...elements) { appendedElements.push(...elements); },
            prepend(...elements) { appendedElements.unshift(...elements); },
            replaceChildren() {}
        },
        querySelectorAll(selector) {
            return selector === "[data-admin-only]" ? adminOnlyElements : [];
        },
        querySelector(selector) {
            return selector === ".dashboard-header nav" ? navigation : null;
        },
        createElement(tagName) {
            return {
                tagName,
                setAttribute() {},
                addEventListener() {},
                append() {}
            };
        }
    };
    const window = {
        location: { pathname, replace() {} },
        fetch: async () => ({
            status: 200,
            ok: true,
            json: async () => account
        })
    };

    vm.runInNewContext(guardSource, { document, window });
    const authorized = await window.authReady;
    return { appendedElements, adminOnlyElements, authorized, navigationElements, window };
}

test("account toolbar is shown on home only", async () => {
    for (const pathname of ["/", "/index.html"]) {
        const result = await runGuard(pathname);
        assert.equal(result.appendedElements.length, 1, `${pathname} should show the toolbar`);
    }

    for (const pathname of ["/ordini.html", "/gestionale.html", "/modifica.html", "/consegne.html", "/ritiri.html", "/banco.html", "/tavoli.html"]) {
        const result = await runGuard(pathname);
        assert.equal(result.appendedElements.length, 0, `${pathname} should not show the toolbar`);
    }
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

test("admin can see admin-only navigation on the delivery page", async () => {
    const page = await runGuard("/consegne.html");
    assert.equal(page.authorized, true);
    assert.deepEqual(page.adminOnlyElements.map(element => element.hidden), [false, false, false, false, false, false]);
    assert.equal(page.appendedElements.length, 0);
    assert.equal(page.navigationElements.length, 1);
});
