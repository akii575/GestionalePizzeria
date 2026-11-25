const test = require("node:test");
const assert = require("node:assert/strict");
const { createMenuStore } = require("../lib/menu-store");

function createDatabase(seed) {
    const collections = new Map(
        Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))])
    );
    const listeners = new Map();
    const readCounts = new Map();
    const documentReads = new Map();
    const getDocuments = name => collections.get(name) || new Map();
    const snapshot = (name, id, value) => ({
        id,
        exists: value !== undefined,
        data: () => value
    });
    const db = {
        collection(name) {
            return {
                doc(id) {
                    return {
                        async get() {
                            documentReads.set(name, (documentReads.get(name) || 0) + 1);
                            return snapshot(name, id, getDocuments(name).get(id));
                        },
                        onSnapshot(next) {
                            if (!listeners.has(name)) listeners.set(name, new Map());
                            listeners.get(name).set(id, next);
                            next(snapshot(name, id, getDocuments(name).get(id)));
                            return () => listeners.get(name)?.delete(id);
                        }
                    };
                },
                async get() {
                    readCounts.set(name, (readCounts.get(name) || 0) + 1);
                    return {
                        docs: [...getDocuments(name)].map(([id, value]) => ({
                            id,
                            data: () => value
                        }))
                    };
                }
            };
        },
        update(name, id, value) {
            if (!collections.has(name)) collections.set(name, new Map());
            collections.get(name).set(id, value);
            listeners.get(name)?.get(id)?.(snapshot(name, id, value));
        },
        reads(name) {
            return readCounts.get(name) || 0;
        },
        documentReads(name) {
            return documentReads.get(name) || 0;
        },
        subscriptions(name) {
            return listeners.get(name)?.size || 0;
        }
    };
    return db;
}

function seed() {
    return {
        metadata: { menuVersion: { versione: 1 } },
        menuCategorie: {
            pizze: { nome: "Pizze", ordine: 1, ammetteExtra: true, archiviata: false },
            dolci: { nome: "Dolci", ordine: 2, ammetteExtra: false, archiviata: false, stampaCucina: false },
            primi: {
                nome: "Primi",
                ordine: 3,
                ammetteExtra: false,
                archiviata: false,
                stampaCucina: false,
                stampaVariazioni: true
            },
            hidden: { nome: "Archivio", ordine: 4, ammetteExtra: false, archiviata: true }
        },
        menuProdotti: {
            dolce: {
                nome: "Dolce",
                categoriaId: "dolci",
                prezzo: 4.5,
                ingredienti: [],
                ordine: 0,
                disponibile: true,
                archiviato: false
            },
            margherita: {
                nome: "Margherita",
                categoriaId: "pizze",
                prezzo: 5,
                ingredienti: ["Pomodoro"],
                componibile: true,
                ordine: 0,
                disponibile: true,
                archiviato: false
            },
            soldout: {
                nome: "Esaurita",
                categoriaId: "pizze",
                prezzo: 6,
                ingredienti: [],
                ordine: 1,
                disponibile: false,
                archiviato: false
            },
            archived: {
                nome: "Archiviata",
                categoriaId: "pizze",
                prezzo: 7,
                ingredienti: [],
                ordine: 2,
                disponibile: true,
                archiviato: true
            },
            hiddenProduct: {
                nome: "Categoria archiviata",
                categoriaId: "hidden",
                prezzo: 8,
                ingredienti: [],
                ordine: 0,
                disponibile: true,
                archiviato: false
            }
        },
        menuExtra: {
            bocconcino: { nome: "Bocconcino", prezzo: 2, ordine: 0, disponibile: true, archiviato: false },
            soldout: { nome: "Extra esaurito", prezzo: 1.5, ordine: 1, disponibile: false, archiviato: false },
            archived: { nome: "Extra archiviato", prezzo: 1, ordine: 2, disponibile: true, archiviato: true }
        }
    };
}

test("menu store orders active categories and products alphabetically and keeps unavailable entries", async () => {
    const db = createDatabase(seed());
    const store = createMenuStore(db);

    const menu = await store.getMenuData();

    assert.deepEqual(menu.categories.map(category => category.id), ["pizze", "dolci", "primi"]);
    assert.deepEqual(menu.menu.map(product => product.nome), ["Esaurita", "Margherita", "Dolce"]);
    assert.equal(menu.menu[1].ammetteExtra, true);
    assert.equal(menu.menu[1].componibile, true);
    assert.equal(menu.menu[1].contaForno, true);
    assert.equal(menu.menu[0].disponibile, false);
    assert.equal(menu.menu[2].contaForno, false);
    assert.equal(menu.menu[2].componibile, false);
    assert.equal(menu.categories[0].stampaCucina, true);
    assert.equal(menu.categories[0].stampaVariazioni, true);
    assert.equal(menu.categories[0].contaForno, true);
    assert.equal(menu.categories[1].stampaCucina, false);
    assert.equal(menu.categories[1].stampaVariazioni, false);
    assert.equal(menu.categories[1].contaForno, false);
    assert.equal(menu.categories[2].stampaCucina, false);
    assert.equal(menu.categories[2].stampaVariazioni, true);
    assert.equal(menu.extras.length, 2);
    assert.equal(menu.extras[1].disponibile, false);
    assert.equal(menu.menu.some(product => product.nome === "Archiviata"), false);
    assert.equal(menu.allProducts.find(product => product.id === "archived").contaForno, true);
    assert.equal(menu.extras.some(extra => extra.nome === "Extra archiviato"), false);
});

test("menu store sorts names naturally in Italian, breaks equivalent-name ties by id and keeps category order", async () => {
    const data = seed();
    data.menuCategorie = {
        primaria: { nome: "Primaria", ordine: 0, ammetteExtra: true, contaForno: false },
        secondaria: { nome: "Secondaria", ordine: 1, ammetteExtra: false }
    };
    const product = (nome, categoriaId, ordine) => ({
        nome,
        categoriaId,
        prezzo: 1,
        ingredienti: [],
        ordine,
        disponibile: true
    });
    data.menuProdotti = {
        "acqua-1": product("Acqua 1L", "primaria", 0),
        "acqua-05": product("Acqua 0,5", "primaria", 9),
        "accent-z": product("Éclair", "primaria", 1),
        "accent-a": product("ECLAIR", "primaria", 2),
        zucchero: product("Zucchero", "primaria", 0),
        aardvark: product("Aardvark", "secondaria", 0)
    };
    data.menuExtra = {
        "extra-1": { nome: "Acqua 1L", prezzo: 1, ordine: 0 },
        "extra-05": { nome: "Acqua 0,5", prezzo: 1, ordine: 9 },
        "extra-accent-z": { nome: "Éclair", prezzo: 1, ordine: 1 },
        "extra-accent-a": { nome: "ECLAIR", prezzo: 1, ordine: 2 },
        "extra-archived": { nome: "Zenzero", prezzo: 1, ordine: 0, archiviato: true }
    };

    const menu = await createMenuStore(createDatabase(data)).getMenuData();

    assert.deepEqual(menu.menu.map(item => item.id), [
        "acqua-05", "acqua-1", "accent-a", "accent-z", "zucchero", "aardvark"
    ]);
    assert.equal(menu.categories[0].contaForno, false);
    assert.equal(menu.menu[0].contaForno, false);
    assert.equal(menu.menu[5].contaForno, false);
    assert.deepEqual(menu.allExtras.map(item => item.id), [
        "extra-05", "extra-1", "extra-accent-a", "extra-accent-z", "extra-archived"
    ]);
    assert.deepEqual(menu.extras.map(item => item.id), [
        "extra-05", "extra-1", "extra-accent-a", "extra-accent-z"
    ]);
});

test("menu store defaults convention eligibility by exact case-insensitive product name", async () => {
    const data = seed();
    data.menuCategorie = {
        food: { nome: "Menu", ordine: 0, ammetteExtra: true }
    };
    const names = [
        "Margherita",
        "Napoletana",
        "Margherita Provola e Pepe",
        "Coca Cola 33cl",
        "Fanta 33cl",
        "Acqua 0,5L",
        "Margherita fritta",
        "Birra",
        "Altro senza eleggibilita'"
    ];
    data.menuProdotti = Object.fromEntries(names.map((nome, index) => [
        `product-${index}`,
        {
            nome: index === 0 ? nome.toLocaleUpperCase("it-IT") : nome,
            categoriaId: "food",
            prezzo: 1,
            ingredienti: [],
            disponibile: true
        }
    ]));
    data.menuProdotti["product-8"].convenzione = "pizza";
    data.menuProdotti["product-7"].convenzione = "";

    const menu = await createMenuStore(createDatabase(data)).getMenuData();
    const values = Object.fromEntries(menu.allProducts.map(product => [product.id, product.convenzione]));

    assert.deepEqual(values, {
        "product-0": "pizza",
        "product-1": "pizza",
        "product-2": "pizza",
        "product-3": "bibita",
        "product-4": "bibita",
        "product-5": "bibita",
        "product-6": "",
        "product-7": "",
        "product-8": "pizza"
    });
});

test("menu store checks versions at most every 30 seconds and reloads collections only on change", async () => {
    const db = createDatabase(seed());
    let now = 100;
    const store = createMenuStore(db, {
        now: () => now,
        onError: () => {},
        listenForVersionChanges: true
    });

    await store.getMenuData();
    await store.getMenuData();
    assert.equal(db.reads("menuProdotti"), 1);
    assert.equal(db.documentReads("metadata"), 1);

    now += 20_000;
    await store.getMenuData();
    assert.equal(db.documentReads("metadata"), 1);
    assert.equal(db.reads("menuProdotti"), 1);

    now += 10_000;
    db.update("metadata", "menuVersion", { versione: 2 });
    await store.getMenuData();
    assert.equal(db.documentReads("metadata"), 2);
    assert.equal(db.reads("menuProdotti"), 2);

    now += 30_001;
    await store.getMenuData();
    assert.equal(db.documentReads("metadata"), 3);
    assert.equal(db.reads("menuProdotti"), 2);
    store.stop();
});

test("menu store does not reread collections after cache expiry when version is unchanged", async () => {
    const db = createDatabase(seed());
    let now = 100;
    const store = createMenuStore(db, {
        now: () => now,
        onError: () => {}
    });

    const initial = await store.getMenuData();
    now += 60_001;
    const cached = await store.getMenuData();

    assert.equal(cached, initial);
    assert.equal(db.documentReads("metadata"), 2);
    assert.equal(db.reads("menuCategorie"), 1);
    assert.equal(db.reads("menuProdotti"), 1);
    assert.equal(db.reads("menuExtra"), 1);
});

test("menu store reloads collection data after a changed version check", async () => {
    const db = createDatabase(seed());
    let now = 100;
    const store = createMenuStore(db, { now: () => now, onError: () => {} });

    await store.getMenuData();
    db.update("menuProdotti", "margherita", {
        ...seed().menuProdotti.margherita,
        nome: "Margherita nuova"
    });
    db.update("metadata", "menuVersion", { versione: 2 });
    now += 30_001;

    const menu = await store.getMenuData();

    assert.ok(menu.menu.some(product => product.nome === "Margherita nuova"));
    assert.equal(menu.menu.some(product => product.nome === "Margherita"), false);
    assert.equal(db.reads("menuCategorie"), 2);
    assert.equal(db.reads("menuProdotti"), 2);
    assert.equal(db.reads("menuExtra"), 2);
});

test("menu store invalidation forces a version check", async () => {
    const db = createDatabase(seed());
    let now = 100;
    const store = createMenuStore(db, { now: () => now, onError: () => {} });

    await store.getMenuData();
    store.invalidate();
    await store.getMenuData();

    assert.equal(db.documentReads("metadata"), 2);
    assert.equal(db.reads("menuProdotti"), 2);
});

test("menu version listener is disabled by default for serverless stores", async () => {
    const db = createDatabase(seed());
    const store = createMenuStore(db);

    await store.getMenuData();

    assert.equal(db.subscriptions("metadata"), 0);
    store.stop();
});
