const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { extractExtras, extractProducts } = require("../scripts/export-menu");

const services = path.join(__dirname, "..", "src", "main", "java", "it", "pizzeria", "gestionale", "service");

test("exports all products and ingredients from the existing Java menu", () => {
    const source = fs.readFileSync(path.join(services, "MenuService.java"), "utf8");
    const products = extractProducts(source);
    assert.equal(products.length, 93);
    assert.deepEqual(products[0], {
        nome: "Margherita",
        categoria: "pizze",
        prezzo: 5,
        ingredienti: ["Pomodoro San Marzano", "fior di latte", "olio evo", "basilico"]
    });
    const pizzas = products.filter(product => product.categoria === "pizze");
    const pizzaNames = pizzas.map(product => product.nome.toLocaleLowerCase("it-IT"));
    assert.equal(pizzas.length, 46);
    assert.equal(new Set(pizzaNames).size, pizzas.length);
    assert.ok(pizzas.some(product => product.nome === "L'Allardata"));
    assert.equal(pizzas.some(product => product.nome === "Callardata"), false);
    assert.ok(pizzas.some(product => product.nome === "Focaccia pom. cotto e lardo"));
    assert.ok(pizzas.find(product => product.nome === "Nocina").ingredienti.includes("gherigli di noci"));
    assert.equal(products.find(product => product.nome === "Acqua 0,5L").prezzo, 1);
    assert.equal(products.find(product => product.nome === "Coca Cola / Zero 33cl").prezzo, 2);
});

test("exports exactly the extras and prices from the pizzeria CSV", () => {
    const source = fs.readFileSync(path.join(services, "ExtraMenu.java"), "utf8");
    const extras = extractExtras(source);
    const exportedExtras = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lib", "extras.json"), "utf8"));
    const csvPath = path.join(__dirname, "..", "aggiunte_ingredienti.csv");
    const csvLines = fs.readFileSync(csvPath, "utf8")
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .slice(1);
    const csvExtras = csvLines.map(line => {
        const match = /^([^,]+),"€ (\d+),(\d{2})"$/.exec(line);
        assert.ok(match, `Invalid extra row: ${line}`);
        return { nome: match[1], prezzo: Number(`${match[2]}.${match[3]}`) };
    });

    assert.equal(csvExtras.length, 51);
    assert.equal(extras.length, csvExtras.length);
    assert.deepEqual(exportedExtras, extras);

    const extrasByName = new Map(extras.map(extra => [extra.nome, extra.prezzo]));
    assert.equal(extrasByName.size, extras.length, "Extra names must be unique");
    for (const { nome, prezzo } of csvExtras) {
        assert.equal(extrasByName.get(nome), prezzo, `Unexpected price for ${nome}`);
    }
});
