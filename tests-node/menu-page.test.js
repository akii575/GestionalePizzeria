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
    assert.match(navigation, /if \(account\.admin === true\) \{\s*links\.push\(\{ label: "Storico", href: "\/storico\.html"[\s\S]*?links\.push\(\{ label: "Menu", href: "\/menu\.html"/);
    assert.match(editor, /escapeHtml\(/);
    assert.match(editor, /data-action="restore"/);
    assert.match(editor, /permanent \? "delete-permanently"/);
    assert.match(editor, /Eliminare '\$\{item\.nome\}' dal menu\?/);
    assert.match(editor, /setTimeout\(hideUndoToast, 6000\)/);
    assert.match(page, /aria-label="Nuovo"/);
    assert.match(page, /id="menu-undo-toast"/);
    assert.match(page, /id="menu-variation-print" name="stampaVariazioni" type="checkbox"/);
    assert.match(page, /id="menu-oven-count" name="contaForno" type="checkbox"/);
    assert.match(page, /Conta nel forno/);
    assert.match(page, /Stampa nelle variazioni \(modifiche ordine\)/);
    assert.match(editor, /menu-variation-print/);
    assert.match(editor, /menu-oven-count-field/);
    assert.match(editor, /payload\.contaForno = document\.getElementById\("menu-oven-count"\)\.checked/);
    assert.match(styles, /\.menu-delete-button \{(?=[^}]*color: #A32D2D)(?=[^}]*background: #FCEBEB)(?=[^}]*border-color: #F7C1C1)[^}]*\}/);
    assert.match(styles, /@media \(max-width: 359px\)[\s\S]*\.menu-new-label/);
    assert.match(styles, /\.menu-tabs\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*gap:\s*0;/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.menu-tabs\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*display:\s*grid;/);
    assert.match(styles, /@media \(min-width: 700px\)[\s\S]*?\.menu-controls\s*\{[^}]*grid-template-columns:\s*auto minmax\(220px,\s*1fr\) auto;[\s\S]*?\.menu-tabs\s*\{[^}]*grid-column:\s*auto;[^}]*flex-wrap:\s*nowrap;/);
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

test("menu editor sorts products and extras by name and only renders manual ordering for categories", () => {
    const editor = readStatic("menu-editor.js");
    const orderPage = readStatic("ordini.html");
    const orderScript = readStatic("ordini.js");
    const productUi = readStatic("prodotti-ui.js");
    const productRow = editor.slice(
        editor.indexOf("function renderProductRow"),
        editor.indexOf("function renderProducts")
    );
    const categoryRenderer = editor.slice(
        editor.indexOf("function renderCategories"),
        editor.indexOf("function renderExtras")
    );
    const extrasRenderer = editor.slice(
        editor.indexOf("function renderExtras"),
        editor.indexOf("function renderArchivedRow")
    );

    assert.match(editor, /sortByName\(state\.menu\.prodotti\.filter/);
    assert.match(editor, /sortByName\(state\.menu\.extra\.filter/);
    assert.doesNotMatch(productRow, /orderButtons|data-action="up"|data-action="down"/);
    assert.doesNotMatch(extrasRenderer, /orderButtons|data-action="up"|data-action="down"/);
    assert.match(categoryRenderer, /orderButtons\(category\.id/);
    assert.match(orderPage, /src="\/html-utils\.js"[\s\S]*?src="\/ordini\.js"/);
    assert.match(orderScript, /\.sort\(window\.htmlUtils\.compareMenuItemsByName\)/);
    assert.match(productUi, /compareMenuItemsByName\(a\.prodotto, b\.prodotto\)/);
    assert.match(productUi, /\.sort\(compareMenuItemsByName\)/);
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
