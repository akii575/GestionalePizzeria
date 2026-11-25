const test = require("node:test");
const assert = require("node:assert/strict");
const { caricaMenuConCache } = require("../src/main/resources/static/prodotti-ui");

function createStorage(initialValue) {
    let value = initialValue;
    return {
        getItem() {
            return value;
        },
        setItem(key, nextValue) {
            value = nextValue;
        },
        read() {
            return JSON.parse(value);
        }
    };
}

test("cached menu is drawn before the network response and replaced when its version changes", async () => {
    const cached = { versione: 1, menu: ["menu-v1"], extra: ["extra-v1"] };
    const storage = createStorage(JSON.stringify(cached));
    const rendered = [];
    let resolveMenu;
    const loading = caricaMenuConCache(
        () => new Promise(resolve => { resolveMenu = resolve; }),
        (menu, extra) => rendered.push({ menu, extra }),
        storage
    );

    assert.deepEqual(rendered, [{ menu: cached.menu, extra: cached.extra }]);
    resolveMenu({ versione: 2, menu: ["menu-v2"], extra: ["extra-v2"] });
    await loading.aggiornamento;

    assert.deepEqual(rendered, [
        { menu: cached.menu, extra: cached.extra },
        { menu: ["menu-v2"], extra: ["extra-v2"] }
    ]);
    assert.deepEqual(storage.read(), {
        versione: 2,
        menu: ["menu-v2"],
        extra: ["extra-v2"]
    });
});

test("menu cache storage errors fall back to loading and drawing from the network", async () => {
    const rendered = [];
    const storage = {
        getItem() {
            throw new Error("localStorage unavailable");
        },
        setItem() {
            throw new Error("localStorage unavailable");
        }
    };
    const loading = caricaMenuConCache(
        async () => ({ versione: 3, menu: ["menu"], extra: ["extra"] }),
        (menu, extra) => rendered.push({ menu, extra }),
        storage
    );

    assert.equal(loading.cache, null);
    await loading.aggiornamento;
    assert.deepEqual(rendered, [{ menu: ["menu"], extra: ["extra"] }]);
});

test("a matching cached version does not redraw the menu", async () => {
    const storage = createStorage(JSON.stringify({
        versione: 5,
        menu: ["cached-menu"],
        extra: ["cached-extra"]
    }));
    const rendered = [];
    const loading = caricaMenuConCache(
        async () => ({ versione: 5, menu: ["network-menu"], extra: ["network-extra"] }),
        (menu, extra) => rendered.push({ menu, extra }),
        storage
    );

    await loading.aggiornamento;

    assert.deepEqual(rendered, [{ menu: ["cached-menu"], extra: ["cached-extra"] }]);
});

test("a matching-version cache without oven flags is refreshed from the menu response", async () => {
    const cachedProduct = { id: "pizza", nome: "Pizza", ammetteExtra: true };
    const networkProduct = { ...cachedProduct, contaForno: false };
    const storage = createStorage(JSON.stringify({
        versione: 5,
        menu: [cachedProduct],
        extra: []
    }));
    const rendered = [];
    const loading = caricaMenuConCache(
        async () => ({ versione: 5, menu: [networkProduct], extra: [] }),
        (menu, extra) => rendered.push({ menu, extra }),
        storage
    );

    await loading.aggiornamento;

    assert.deepEqual(rendered, [
        { menu: [cachedProduct], extra: [] },
        { menu: [networkProduct], extra: [] }
    ]);
    assert.deepEqual(storage.read().menu, [networkProduct]);
});
