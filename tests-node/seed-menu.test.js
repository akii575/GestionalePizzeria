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
    assert.equal(seed.categories.find(category => category.id === "pizze").data.stampaCucina, true);
    assert.equal(seed.categories.find(category => category.id === "bibite").data.stampaCucina, false);
    assert.equal(seed.categories.find(category => category.id === "vini").data.stampaCucina, false);
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

test("menu seed keeps an existing kitchen-printing category setting", async () => {
    const collections = new Map([
        ["menuCategorie", new Map([
            ["bibite", { nome: "Bibite", ordine: 0, ammetteExtra: false, stampaCucina: true }]
        ])],
        ["menuProdotti", new Map()],
        ["menuExtra", new Map()],
        ["metadata", new Map([["menuVersion", { versione: 1 }]])]
    ]);
    const getDocuments = name => {
        if (!collections.has(name)) collections.set(name, new Map());
        return collections.get(name);
    };
    const db = {
        collection(name) {
            return {
                doc(id) {
                    return {
                        collection: name,
                        id,
                        async get() {
                            const value = getDocuments(name).get(id);
                            return { exists: value !== undefined, data: () => value };
                        }
                    };
                },
                async get() {
                    return {
                        docs: [...getDocuments(name)].map(([id, value]) => ({
                            id,
                            ref: { collection: name, id },
                            data: () => value
                        }))
                    };
                }
            };
        },
        batch() {
            const operations = [];
            return {
                set(reference, value) {
                    operations.push(() => getDocuments(reference.collection).set(reference.id, value));
                },
                update(reference, value) {
                    operations.push(() => getDocuments(reference.collection).set(reference.id, {
                        ...getDocuments(reference.collection).get(reference.id),
                        ...value
                    }));
                },
                async commit() {
                    for (const apply of operations) apply();
                }
            };
        }
    };

    await seedMenu({ db, log: () => {} });

    assert.equal(getDocuments("menuCategorie").get("bibite").stampaCucina, true);
});
