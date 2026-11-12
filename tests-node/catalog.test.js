const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { extractExtras, extractProducts } = require("../scripts/export-menu");

const services = path.join(__dirname, "..", "src", "main", "java", "it", "pizzeria", "gestionale", "service");

test("exports all products and ingredients from the existing Java menu", () => {
    const source = fs.readFileSync(path.join(services, "MenuService.java"), "utf8");
    const products = extractProducts(source);
    assert.equal(products.length, 107);
    assert.deepEqual(products[0], {
        nome: "Margherita",
        categoria: "pizze",
        prezzo: 5,
        ingredienti: ["Pomodoro San Marzano", "fior di latte", "olio evo", "basilico"]
    });
    const pizzas = products.filter(product => product.categoria === "pizze");
    const pizzaNames = pizzas.map(product => product.nome.toLocaleLowerCase("it-IT"));
    assert.equal(pizzas.length, 47);
    assert.equal(new Set(pizzaNames).size, pizzas.length);
    assert.ok(pizzas.some(product => product.nome === "L'Allardata"));
    assert.equal(pizzas.some(product => product.nome === "Callardata"), false);
    assert.ok(pizzas.some(product => product.nome === "Focaccia pom. cotto e lardo"));
    assert.ok(pizzas.find(product => product.nome === "Nocina").ingredienti.includes("gherigli di noci"));
    assert.deepEqual(
        pizzas.find(product => product.nome === "The Pumpkin 2.0").ingredienti,
        ["Vellutata di zucca", "mozzarella", "salsiccia", "noci; all'uscita gorgonzola"]
    );
    const requestedProducts = new Map([
        ["The Pumpkin 2.0", ["pizze", 9]],
        ["Acqua 1L", ["bibite", 2.5]],
        ["Birra alla spina 0,20L", ["bibite", 2.5]],
        ["Birra alla spina 0,40L", ["bibite", 5]],
        ["Caffè", ["bibite", 1]],
        ["Ceres", ["bibite", 4]],
        ["Coca Cola 1L (plastica)", ["bibite", 3]],
        ["Coca Cola 1L (vetro)", ["bibite", 4.5]],
        ["Coca Cola 33cl", ["bibite", 2.5]],
        ["Fanta 33cl", ["bibite", 2.5]],
        ["Heineken 66cl", ["bibite", 3.5]],
        ["Ceres Lager", ["bibite", 4]],
        ["Peroni 33cl", ["bibite", 2.5]],
        ["Estrella (senza glutine)", ["bibite", 3]],
        ["Spumante Borgofulvia", ["vini", 11]],
        ["Vino in bottiglia Aglianico IGP", ["vini", 20]],
        ["Vino della Casa Aglianico", ["vini", 8]],
        ["Vino della Casa sfuso 0,5L", ["vini", 5]],
        ["Vino della Casa sfuso 1L", ["vini", 10]]
    ]);
    for (const [name, [category, price]] of requestedProducts) {
        const product = products.find(item => item.nome === name);
        assert.ok(product, `Missing menu product: ${name}`);
        assert.equal(product.categoria, category, `Unexpected category for ${name}`);
        assert.equal(product.prezzo, price, `Unexpected price for ${name}`);
    }
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
