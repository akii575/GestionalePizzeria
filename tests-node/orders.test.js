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
    assert.equal(order.tipo, "sala");
    assert.equal(order.note, "Senza cipolla");
    assert.equal(order.righe[0].totale, 6);
    assert.equal(order.totale, 6);
    assert.deepEqual(publicOrder({ ...order, numero: 1, dataOra: "2026-10-12T12:00:00.000Z" }).righe[0].extra[0], {
        id: "fior-di-latte",
        nome: "Fior di latte",
        prezzo: 1
    });
});

test("requires delivery contact details and includes them in public order data", () => {
    const order = prepareOrder({
        tipo: "consegna",
        tavoloOCliente: "Anna Rossi",
        indirizzoConsegna: "Via Roma 12, Napoli",
        telefonoConsegna: "+39 333 1234567",
        righe: [{ prodotto: "Margherita" }]
    });
    const publicData = publicOrder({ ...order, numero: 8, dataOra: "2026-10-12T12:00:00.000Z" });

    assert.equal(publicData.tipo, "consegna");
    assert.equal(publicData.tavoloOCliente, "Anna Rossi");
    assert.equal(publicData.indirizzoConsegna, "Via Roma 12, Napoli");
    assert.equal(publicData.telefonoConsegna, "+39 333 1234567");
});

test("rejects missing order details and products outside the menu", () => {
    assert.throws(() => prepareOrder({ tavoloOCliente: "", righe: [{ prodotto: "Margherita" }] }), /obbligatorio/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Pizza inesistente" }] }), /menu/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Acqua 0,5L", extra: ["fior-di-latte"] }] }), /non consente/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Margherita", extra: ["extra-inventato"] }] }), /Extra non ammesso/);
    assert.throws(() => prepareOrder({ tipo: "consegna", tavoloOCliente: "Anna", telefonoConsegna: "3331234567", righe: [{ prodotto: "Margherita" }] }), /indirizzo/);
    assert.throws(() => prepareOrder({ tipo: "consegna", tavoloOCliente: "Anna", indirizzoConsegna: "Via Roma 12", telefonoConsegna: "telefono", righe: [{ prodotto: "Margherita" }] }), /telefono/);
    assert.throws(() => prepareOrder({ tipo: "asporto", tavoloOCliente: "Anna", righe: [{ prodotto: "Margherita" }] }), /Tipo ordine/);
});
