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

test("order and edit menu templates escape names, extras, and formatted prices", () => {
    const orderScript = fs.readFileSync(path.join(staticDirectory, "ordini.js"), "utf8");
    const editScript = fs.readFileSync(path.join(staticDirectory, "modifica.js"), "utf8");
    const orderPage = fs.readFileSync(path.join(staticDirectory, "ordini.html"), "utf8");
    const editPage = fs.readFileSync(path.join(staticDirectory, "modifica.html"), "utf8");

    assert.match(orderScript, /<strong>\$\{escapeHtml\(extra\.nome\)\}<\/strong><span>\$\{escapeHtml\(euro\.format\(Number\(extra\.prezzo\)\)\)\}/);
    assert.match(orderScript, /<strong>\$\{escapeHtml\(prodotto\.nome\)\}<\/strong><span class="prezzo-prodotto">\$\{escapeHtml\(euro\.format\(Number\(prodotto\.prezzo\)\)\)\}/);
    assert.match(editScript, /<strong>\$\{escapeHtml\(item\.nome\)\}<\/strong><span>\$\{escapeHtml\(euro\.format\(Number\(item\.prezzo\)\)\)\}/);
    assert.match(editScript, /value="\$\{escapeHtml\(p\.nome\)\}"[^>]*>\$\{escapeHtml\(p\.nome\)\}<\/option>/);
    assert.match(orderPage, /src="\/html-utils\.js"[\s\S]*?src="\/ordini\.js"/);
    assert.match(editPage, /src="\/html-utils\.js"[\s\S]*?src="\/modifica\.js"/);
});
