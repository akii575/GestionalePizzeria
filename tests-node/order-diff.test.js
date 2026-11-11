const test = require("node:test");
const assert = require("node:assert/strict");
const { diffRighe } = require("../lib/order-diff");

const margherita = {
    prodotto: "Margherita",
    prezzoBase: 5,
    extra: [],
    totale: 5
};

test("detects newly added products", () => {
    const result = diffRighe([margherita], [margherita, { prodotto: "Patatine", totale: 3 }]);

    assert.deepEqual(result.aggiunte, [{ prodotto: "Patatine", totale: 3 }]);
    assert.deepEqual(result.rimosse, []);
});

test("detects quantity increases as added rows", () => {
    const result = diffRighe([margherita], [margherita, margherita, margherita]);

    assert.deepEqual(result.aggiunte, [margherita, margherita]);
    assert.deepEqual(result.rimosse, []);
});

test("detects removed rows", () => {
    const result = diffRighe([margherita, { prodotto: "Patatine", totale: 3 }], [margherita]);

    assert.deepEqual(result.aggiunte, []);
    assert.deepEqual(result.rimosse, [{ prodotto: "Patatine", totale: 3 }]);
});

test("compares extras and their names when matching products", () => {
    const withBocconcino = {
        prodotto: "Margherita",
        prezzoBase: 5,
        extra: [{ nome: "Bocconcino" }],
        totale: 7
    };
    const withBufala = {
        prodotto: "Margherita",
        prezzoBase: 5,
        extra: [{ nome: "Bufala" }],
        totale: 7
    };
    const result = diffRighe([withBocconcino], [withBufala]);

    assert.deepEqual(result.aggiunte, [withBufala]);
    assert.deepEqual(result.rimosse, [withBocconcino]);
});

test("returns no changes for identical rows", () => {
    assert.deepEqual(diffRighe([margherita], [margherita]), { aggiunte: [], rimosse: [] });
});

test("ignores row ordering when comparing multisets", () => {
    const patatine = { prodotto: "Patatine", totale: 3 };

    assert.deepEqual(diffRighe([margherita, patatine], [patatine, margherita]), {
        aggiunte: [],
        rimosse: []
    });
});

test("matches the same extras regardless of their ordering", () => {
    const oldRow = {
        prodotto: "Margherita",
        extra: [{ nome: "Bocconcino" }, { nome: "Bufala" }],
        totale: 9
    };
    const newRow = {
        prodotto: "Margherita",
        extra: [{ nome: "Bufala" }, { nome: "Bocconcino" }],
        totale: 9
    };

    assert.deepEqual(diffRighe([oldRow], [newRow]), { aggiunte: [], rimosse: [] });
});
