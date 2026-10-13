const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const guardSource = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/auth-guard.js"),
    "utf8"
);

async function runGuard(pathname) {
    const appendedElements = [];
    const document = {
        documentElement: { classList: { add() {}, remove() {} } },
        body: { append(...elements) { appendedElements.push(...elements); } },
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
            json: async () => ({ email: "admin@example.com" })
        })
    };

    vm.runInNewContext(guardSource, { document, window });
    await new Promise(resolve => setImmediate(resolve));
    return appendedElements;
}

test("account toolbar is shown on home only", async () => {
    for (const pathname of ["/", "/index.html"]) {
        const elements = await runGuard(pathname);
        assert.equal(elements.length, 1, `${pathname} should show the toolbar`);
    }

    for (const pathname of ["/ordini.html", "/gestionale.html", "/modifica.html"]) {
        const elements = await runGuard(pathname);
        assert.equal(elements.length, 0, `${pathname} should not show the toolbar`);
    }
});
