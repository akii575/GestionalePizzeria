const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/index.html"),
    "utf8"
);
const navigation = page.match(/<nav class="home-links">([\s\S]*?)<\/nav>/)?.[1];

test("home tiles keep their titles without captions and preserve printer details", () => {
    assert.ok(navigation);
    assert.doesNotMatch(navigation, /<span\b/);
    for (const title of ["Nuova comanda", "Tutti gli ordini", "Consegne", "Ritiri", "Banco", "Tavoli"]) {
        assert.match(navigation, new RegExp(`<strong>${title}</strong>`));
    }
    assert.match(page, /<h2 id="printer-title">Stampa automatica<\/h2>/);
    assert.match(page, /class="printer-hint"/);
    assert.match(page, /id="printer-status"/);
});
