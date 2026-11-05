const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pages = ["gestionale.html", "banco.html", "ritiri.html", "tavoli.html"];

test("order reset button is consistently labeled on every order-list page", () => {
    for (const name of pages) {
        const page = fs.readFileSync(
            path.join(__dirname, "../src/main/resources/static", name),
            "utf8"
        );
        assert.match(page, /<button id="reset-numeri"[^>]*>Reset ordini<\/button>/, name);
        assert.doesNotMatch(page, /Reset numeri/);
    }
});

test("reset confirmation warns that all orders are deleted and numbering restarts at one", () => {
    const script = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/gestionale.js"),
        "utf8"
    );
    assert.match(script, /reset eliminera' tutti gli ordini presenti e riportera' la numerazione a 1/);
});
