const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const staticDirectory = path.join(__dirname, "../src/main/resources/static");
const readStatic = name => fs.readFileSync(path.join(staticDirectory, name), "utf8");

test("menu editor page loads protected navigation, accessible editor and shared escaping", () => {
    const page = readStatic("menu.html");
    const navigation = readStatic("nav.js");
    const editor = readStatic("menu-editor.js");
    const styles = readStatic("menu.css");

    assert.match(page, /src="\/auth-guard\.js"/);
    assert.match(page, /role="tablist"/);
    assert.match(page, /role="dialog" aria-modal="true"/);
    assert.match(page, /src="\/html-utils\.js"[\s\S]*?src="\/menu-editor\.js"/);
    assert.match(navigation, /if \(account\.admin === true\) links\.push\(\{ label: "Menu", href: "\/menu\.html"/);
    assert.match(editor, /escapeHtml\(/);
    assert.match(editor, /data-action="restore"/);
    assert.match(editor, /permanent \? "delete-permanently"/);
    assert.match(editor, /Eliminare '\$\{item\.nome\}' dal menu\?/);
    assert.match(editor, /setTimeout\(hideUndoToast, 6000\)/);
    assert.match(page, /aria-label="Nuovo"/);
    assert.match(page, /id="menu-undo-toast"/);
    assert.match(page, /id="menu-variation-print" name="stampaVariazioni" type="checkbox"/);
    assert.match(page, /Stampa nelle variazioni \(modifiche ordine\)/);
    assert.match(editor, /menu-variation-print/);
    assert.match(styles, /\.menu-delete-button \{(?=[^}]*color: #A32D2D)(?=[^}]*background: #FCEBEB)(?=[^}]*border-color: #F7C1C1)[^}]*\}/);
    assert.match(styles, /@media \(max-width: 359px\)[\s\S]*\.menu-new-label/);
});

test("product row metadata omits the repeated category name", () => {
    const editor = readStatic("menu-editor.js");
    const productRow = editor.slice(
        editor.indexOf("function renderProductRow"),
        editor.indexOf("function renderProducts")
    );
    assert.match(productRow, /euro\.format\(Number\(product\.prezzo\)\)/);
    assert.match(productRow, /ingredientText/);
    assert.doesNotMatch(productRow, /category\?\.nome/);
});

test("menu page is protected by the server rewrite and included in protected-page generation", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));
    const copyScript = fs.readFileSync(path.join(__dirname, "../scripts/copy-static.js"), "utf8");
    const pageRoute = fs.readFileSync(path.join(__dirname, "../lib/handlers/pages/[page].js"), "utf8");

    assert.ok(vercel.rewrites.some(rule => (
        rule.source === "/menu.html" && rule.destination === "/api/router?percorso=pages/menu.html"
    )));
    assert.match(copyScript, /"menu\.html"/);
    assert.match(pageRoute, /pageName === "menu\.html"[\s\S]*?requireAdmin\(req\)/);
});
