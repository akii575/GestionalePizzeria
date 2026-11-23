const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/index.html"),
    "utf8"
);
const navigation = page.match(/<nav class="home-links"[^>]*>([\s\S]*?)<\/nav>/)?.[1];

test("home keeps navigation and provides evening summaries and printer status", () => {
    assert.ok(navigation);
    for (const title of ["Nuova comanda", "Tutti gli ordini", "Consegne", "Ritiri", "Banco", "Tavoli"]) {
        assert.match(navigation, new RegExp(`<strong>${title}</strong>`));
    }
    for (const [label, href] of [
        ["tavoli-summary", "/tavoli.html"],
        ["consegne-summary", "/consegne.html"],
        ["ritiri-summary", "/ritiri.html"],
        ["banco-summary", "/banco.html"],
        ["incasso-summary", "/gestionale.html"]
    ]) {
        assert.match(page, new RegExp(`id="${label}"`));
        assert.match(page, new RegExp(`href="${href}"`));
    }
    assert.match(page, /<h2 id="printer-title">Stampa<\/h2>/);
    assert.match(page, /id="printer-status"/);
    assert.match(page, /src="\/printer-status\.js"/);
    assert.doesNotMatch(page, /controllo ordini ogni 10 secondi|installa-stampa-automatica\.bat/i);
});
