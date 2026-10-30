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
});

test("exports all existing extras in Italian alphabetical order", () => {
    const source = fs.readFileSync(path.join(services, "ExtraMenu.java"), "utf8");
    const extras = extractExtras(source);
    assert.equal(extras.length, 55);
    assert.equal(extras[0].nome, "Alici di Cetara");
    assert.equal(extras[0].prezzo, 2);
});
