const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareOrder, publicOrder } = require("../lib/orders");

test("validates an order and calculates product and extra totals", () => {
    const order = prepareOrder({
        tavoloOCliente: " Tavolo 1 ",
        note: "  Senza cipolla  ",
        righe: [{ prodotto: "Margherita", extra: ["fior-di-latte"] }]
    });

    assert.equal(order.tavoloOCliente, "Tavolo 1");
    assert.equal(order.note, "Senza cipolla");
    assert.equal(order.righe[0].totale, 6);
    assert.equal(order.totale, 6);
    assert.deepEqual(publicOrder({ ...order, numero: 1, dataOra: "2026-10-12T12:00:00.000Z" }).righe[0].extra[0], {
        id: "fior-di-latte",
        nome: "Fior di latte",
        prezzo: 1
    });
});

test("rejects missing order details and products outside the menu", () => {
    assert.throws(() => prepareOrder({ tavoloOCliente: "", righe: [{ prodotto: "Margherita" }] }), /obbligatorio/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Pizza inesistente" }] }), /menu/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Acqua 0,5L", extra: ["fior-di-latte"] }] }), /non consente/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Margherita", extra: ["extra-inventato"] }] }), /Extra non ammesso/);
});
