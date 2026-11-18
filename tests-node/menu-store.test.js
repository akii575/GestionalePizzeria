const test = require("node:test");
const assert = require("node:assert/strict");
const { createMenuStore } = require("../lib/menu-store");

function createDatabase(seed) {
    const collections = new Map(
        Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))])
    );
    const listeners = new Map();
    const readCounts = new Map();
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
            hidden: { nome: "Archivio", ordine: 3, ammetteExtra: false, archiviata: true }
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

test("menu store orders active categories and products and keeps unavailable entries", async () => {
    const db = createDatabase(seed());
    const store = createMenuStore(db);

    const menu = await store.getMenuData();

    assert.deepEqual(menu.categories.map(category => category.id), ["pizze", "dolci"]);
    assert.deepEqual(menu.menu.map(product => product.nome), ["Margherita", "Esaurita", "Dolce"]);
    assert.equal(menu.menu[0].ammetteExtra, true);
    assert.equal(menu.menu[1].disponibile, false);
    assert.equal(menu.categories[0].stampaCucina, true);
    assert.equal(menu.categories[1].stampaCucina, false);
    assert.equal(menu.extras.length, 2);
    assert.equal(menu.extras[1].disponibile, false);
    assert.equal(menu.menu.some(product => product.nome === "Archiviata"), false);
    assert.equal(menu.extras.some(extra => extra.nome === "Extra archiviato"), false);
});

test("menu store caches for 60 seconds and invalidates on menu version changes", async () => {
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

    db.update("metadata", "menuVersion", { versione: 2 });
    await store.getMenuData();
    assert.equal(db.reads("menuProdotti"), 2);

    now += 60_001;
    await store.getMenuData();
    assert.equal(db.reads("menuProdotti"), 3);
    store.stop();
});

test("menu version listener is disabled by default for serverless stores", async () => {
    const db = createDatabase(seed());
    const store = createMenuStore(db);

    await store.getMenuData();

    assert.equal(db.subscriptions("metadata"), 0);
    store.stop();
});
