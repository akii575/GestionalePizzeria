const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const htmlUtils = require("../src/main/resources/static/html-utils");

const staticDirectory = path.join(__dirname, "..", "src", "main", "resources", "static");

test("HTML escaping protects text and quoted attributes", () => {
    assert.equal(
        htmlUtils.escapeHtml(`<script title="x">'&</script>`),
        "&lt;script title=&quot;x&quot;&gt;&#39;&amp;&lt;/script&gt;"
    );
});

test("WhatsApp numbers normalize Italian mobiles, landlines, and international prefixes", () => {
    assert.equal(htmlUtils.numeroWhatsApp("3331234567"), "393331234567");
    assert.equal(htmlUtils.numeroWhatsApp("+39 333 123 4567"), "393331234567");
    assert.equal(htmlUtils.numeroWhatsApp("0039 333 123 4567"), "393331234567");
    assert.equal(htmlUtils.numeroWhatsApp("06 12345678"), "390612345678");
    assert.equal(htmlUtils.numeroWhatsApp("393331234567"), "393331234567");
    assert.equal(htmlUtils.numeroWhatsApp("1234567"), null);
    assert.equal(htmlUtils.numeroWhatsApp(""), null);
});

test("order templates escape names and the legacy edit page only redirects", () => {
    const orderScript = fs.readFileSync(path.join(staticDirectory, "ordini.js"), "utf8");
    const orderPage = fs.readFileSync(path.join(staticDirectory, "ordini.html"), "utf8");
    const legacyPage = fs.readFileSync(path.join(staticDirectory, "modifica.html"), "utf8");
    const redirectScript = fs.readFileSync(path.join(staticDirectory, "modifica-redirect.js"), "utf8");

    assert.match(orderScript, /<strong>\$\{escapeHtml\(extra\.nome\)\}<\/strong><span>\$\{escapeHtml\(euro\.format\(Number\(extra\.prezzo\)\)\)\}/);
    assert.match(orderScript, /nome\.textContent = prodotto\.nome/);
    assert.match(orderScript, /prezzo\.textContent = euro\.format\(Number\(prodotto\.prezzo\)\)/);
    assert.match(orderScript, /bottone\.disabled = prodotto\.disponibile === false/);
    assert.match(orderScript, /esaurito\.className = "prodotto-esaurito"/);
    assert.match(orderScript, /esaurito\.textContent = "Esaurito"/);
    assert.match(orderScript, /tab\.textContent = categoria\.nome \|\| labels\.get\(categoria\.id\) \|\| categoria\.id/);
    assert.match(orderPage, /src="\/html-utils\.js"[\s\S]*?src="\/ordini\.js"/);
    assert.match(legacyPage, /src="\/modifica-redirect\.js"/);
    assert.match(redirectScript, /location\.replace\("\/ordini\.html\?modifica=" \+ encodeURIComponent\(numero\)\)/);
    assert.doesNotMatch(legacyPage, /modifica\.(?:js|css)/);
});
