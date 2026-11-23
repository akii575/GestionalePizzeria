const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/index.html"),
    "utf8"
);
const styles = fs.readFileSync(
    path.join(__dirname, "../src/main/resources/static/home.css"),
    "utf8"
);
const navigation = page.match(/<nav class="home-actions"[^>]*>([\s\S]*?)<\/nav>/)?.[1];

test("home presents one primary action, linked summary cards and printer status", () => {
    assert.ok(navigation);
    assert.equal([...navigation.matchAll(/<a\b/g)].length, 1);
    assert.match(navigation, /href="\/ordini\.html"/);
    assert.match(navigation, /<strong>Nuova comanda<\/strong>/);
    assert.match(navigation, /aria-hidden="true">\+<\/span>/);
    assert.doesNotMatch(navigation, /Tutti gli ordini|Consegne|Ritiri|Banco|Tavoli/);

    for (const [tile, href, value, label] of [
        ["riepilogo-tavoli", "/tavoli.html", "tavoli-value", "tavoli-label"],
        ["riepilogo-consegne", "/consegne.html", "consegne-value", "consegne-label"],
        ["riepilogo-ritiri", "/ritiri.html", "ritiri-value", "ritiri-label"],
        ["riepilogo-banco", "/banco.html", "banco-value", "banco-label"],
        ["riepilogo-incasso", "/gestionale.html", "incasso-value", "incasso-label"]
    ]) {
        assert.match(page, new RegExp(`<a class="serata-tile" id="${tile}" href="${href}">`));
        assert.match(page, new RegExp(`class="serata-value" id="${value}"`));
        assert.match(page, new RegExp(`class="serata-label" id="${label}"`));
    }
    assert.match(styles, /\.serata-value\s*\{[^}]*font-size:\s*2rem;[^}]*font-weight:\s*700;/);
    assert.match(styles, /#riepilogo-incasso\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
    assert.match(styles, /@media \(min-width: 768px\)\s*\{\s*\.serata-grid\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
    assert.match(styles, /\.serata-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(page, /<h2 id="printer-title">Stampa<\/h2>/);
    assert.match(page, /id="printer-status"/);
    assert.match(page, /src="\/printer-status\.js"/);
    assert.doesNotMatch(page, /controllo ordini ogni 10 secondi|installa-stampa-automatica\.bat/i);
});
