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
    const document = {
        documentElement: { classList: { add() {}, remove() {} } },
        body: {
            append(...elements) { appendedElements.push(...elements); },
            replaceChildren() {}
        },
        querySelectorAll() { return []; },
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
    return { appendedElements, authorized, window };
}

test("account toolbar is shown on home only", async () => {
    for (const pathname of ["/", "/index.html"]) {
        const result = await runGuard(pathname);
        assert.equal(result.appendedElements.length, 1, `${pathname} should show the toolbar`);
    }

    for (const pathname of ["/ordini.html", "/gestionale.html", "/modifica.html", "/ritiri.html", "/tavoli.html"]) {
        const result = await runGuard(pathname);
        assert.equal(result.appendedElements.length, 0, `${pathname} should not show the toolbar`);
    }
});

test("delivery account is allowed only on the delivery page", async () => {
    const delivery = { admin: false, delivery: true, email: "corriere@example.com" };
    const page = await runGuard("/consegne.html", delivery);
    assert.equal(page.authorized, true);
    assert.equal(page.window.currentAccount.delivery, true);
    assert.equal(page.appendedElements.length, 1);

    for (const pathname of ["/gestionale.html", "/ritiri.html", "/tavoli.html", "/ordini.html"]) {
        const adminPage = await runGuard(pathname, delivery);
        assert.equal(adminPage.authorized, false, `${pathname} must remain admin-only`);
        assert.equal(adminPage.window.currentAccount, undefined);
    }
});
