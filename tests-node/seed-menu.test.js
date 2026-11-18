const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSeedData, seedMenu } = require("../scripts/seed-menu");

test("menu seed preserves current category labels and displayed ordering", () => {
    const seed = buildSeedData();
    const categories = seed.categories.map(category => category.id);

    assert.deepEqual(categories.slice(0, 6), [
        "pizze",
        "ripieni",
        "panuozzi",
        "fritti",
        "pizze fritte",
        "pollo scuppettiato"
    ]);
    assert.equal(seed.categories.find(category => category.id === "pizze").data.nome, "Pizze");
    assert.equal(seed.categories.find(category => category.id === "pizze").data.ammetteExtra, true);
    assert.equal(seed.categories.find(category => category.id === "bibite").data.ammetteExtra, false);
    assert.deepEqual(
        seed.products.filter(product => product.data.categoriaId === "pizze").slice(0, 2)
            .map(product => product.data.nome),
        ["Biancaneve", "Broccoli e Salsiccia"]
    );
    assert.deepEqual(buildSeedData(), seed);
});

test("menu seed dry run reports planned records without Firestore access", async () => {
    const messages = [];
    const result = await seedMenu({ dryRun: true, log: message => messages.push(message) });

    assert.equal(result.menuCategorie, buildSeedData().categories.length);
    assert.equal(result.menuProdotti, 107);
    assert.equal(result.menuExtra, 51);
    assert.equal(result.writes, 0);
    assert.match(messages[0], /Dry run/);
});
