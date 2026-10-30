const test = require("node:test");
const assert = require("node:assert/strict");
const { filterOrdersByType, prepareOrder, publicOrder } = require("../lib/orders");

test("validates an order and calculates product and extra totals", () => {
    const order = prepareOrder({
        tavoloOCliente: " Tavolo 1 ",
        note: "  Senza cipolla  ",
        righe: [{ prodotto: "Margherita", extra: ["bocconcino"] }]
    });

    assert.equal(order.tavoloOCliente, "Tavolo 1");
    assert.equal(order.tipo, "tavolo");
    assert.equal(order.orario, "");
    assert.equal(order.statoPagamento, null);
    assert.equal(order.numeroPersone, 1);
    assert.equal(order.note, "Senza cipolla");
    assert.equal(order.righe[0].totale, 7);
    assert.equal(order.totale, 7);
    assert.deepEqual(publicOrder({ ...order, numero: 1, dataOra: "2026-10-12T12:00:00.000Z" }).righe[0].extra[0], {
        id: "bocconcino",
        nome: "Bocconcino",
        prezzo: 2
    });
});

test("uses the current beverage prices when calculating order totals", () => {
    const water = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Acqua 0,5L" }]
    });
    const cola = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Coca Cola / Zero 33cl" }]
    });

    assert.equal(water.totale, 1);
    assert.equal(cola.totale, 2);
});

test("requires delivery contact details and includes them in public order data", () => {
    const order = prepareOrder({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma 12, Napoli",
        telefonoConsegna: "+39 333 1234567",
        righe: [{ prodotto: "Margherita" }]
    });
    const publicData = publicOrder({ ...order, numero: 8, dataOra: "2026-10-12T12:00:00.000Z" });

    assert.equal(publicData.tipo, "consegna");
    assert.equal(publicData.tavoloOCliente, "");
    assert.equal(publicData.indirizzoConsegna, "Via Roma 12, Napoli");
    assert.equal(publicData.telefonoConsegna, "+39 333 1234567");
    assert.equal(publicData.statoPagamento, "non_pagato");
    assert.equal(publicData.costoConsegna, 0);
    assert.equal(publicOrder({
        ...order,
        tavoloOCliente: "Nome storico da non esporre"
    }).tavoloOCliente, "");
});

test("adds the fixed delivery surcharge only when requested", () => {
    const order = prepareOrder({
        tipo: "consegna",
        orario: "19:45",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        costoConsegna: 2,
        righe: [{ prodotto: "Margherita" }]
    });

    assert.equal(order.costoConsegna, 2);
    assert.equal(order.totale, 7);
    assert.equal(publicOrder({ ...order, numero: 1 }).costoConsegna, 2);
    assert.throws(() => prepareOrder({
        tipo: "consegna",
        orario: "19:45",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        costoConsegna: 1,
        righe: [{ prodotto: "Margherita" }]
    }), /0 o 2 euro/);
    assert.throws(() => prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        costoConsegna: 2,
        righe: [{ prodotto: "Margherita" }]
    }), /solo per gli ordini di consegna/);
});

test("supports table, counter, pickup and legacy dining-room orders", () => {
    const table = prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 3",
        numeroPersone: 3,
        righe: [{ prodotto: "Margherita" }]
    });
    const counter = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita" }]
    });
    const pickup = prepareOrder({
        tipo: "ritiro",
        tavoloOCliente: "Anna Rossi",
        telefonoRitiro: "+39 333 1234567",
        righe: [{ prodotto: "Margherita" }]
    });
    const legacy = prepareOrder({
        tipo: "sala",
        tavoloOCliente: "Tavolo 2",
        righe: [{ prodotto: "Margherita" }]
    });

    assert.equal(publicOrder({ ...table, numero: 1 }).numeroPersone, 3);
    assert.equal(counter.tipo, "banco");
    assert.match(counter.orario, /^\d{2}:\d{2}$/);
    assert.equal(counter.statoPagamento, null);
    assert.equal(counter.tavoloOCliente, "");
    assert.equal(counter.cognomeBanco, "Rossi");
    assert.equal(publicOrder({ ...counter, numero: 4 }).cognomeBanco, "Rossi");
    assert.equal(pickup.tipo, "ritiro");
    assert.match(pickup.orario, /^\d{2}:\d{2}$/);
    assert.equal(pickup.statoPagamento, "non_pagato");
    assert.equal(pickup.telefonoRitiro, "+39 333 1234567");
    assert.equal(publicOrder({ ...pickup, numero: 3 }).telefonoRitiro, "+39 333 1234567");
    assert.equal(publicOrder({ ...legacy, numero: 2 }).tipo, "tavolo");
    assert.deepEqual(filterOrdersByType([
        { tipo: "sala" },
        { tipo: "banco" },
        { tipo: "ritiro" },
        { tipo: "consegna" }
    ], "tavolo"), [{ tipo: "sala" }]);
    assert.deepEqual(filterOrdersByType([
        { tipo: "sala" },
        { tipo: "banco" },
        { tipo: "ritiro" },
        { tipo: "consegna" }
    ], "banco"), [{ tipo: "banco" }]);
    assert.deepEqual(filterOrdersByType([
        { tipo: "sala" },
        { tipo: "ritiro" },
        { tipo: "consegna" }
    ], "ritiro"), [{ tipo: "ritiro" }]);
    assert.throws(() => filterOrdersByType([], "asporto"), /Tipo servizio/);
});

test("stores service time and validates service-specific payment choices", () => {
    const delivery = prepareOrder({
        tipo: "consegna",
        orario: "19:45",
        statoPagamento: "pos",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        righe: [{ prodotto: "Margherita" }]
    });
    const paidPickup = prepareOrder({
        tipo: "ritiro",
        orario: "20:10",
        statoPagamento: "pagato",
        tavoloOCliente: "Anna",
        telefonoRitiro: "3331234567",
        righe: [{ prodotto: "Margherita" }]
    });

    assert.equal(delivery.orario, "19:45");
    assert.equal(publicOrder({ ...delivery, numero: 9 }).statoPagamento, "pos");
    assert.equal(paidPickup.orario, "20:10");
    assert.equal(paidPickup.statoPagamento, "pagato");
    assert.equal(prepareOrder({
        tipo: "tavolo",
        orario: "20:10",
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: "Margherita" }]
    }).orario, "");
    assert.throws(() => prepareOrder({
        tipo: "consegna",
        orario: "24:00",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        righe: [{ prodotto: "Margherita" }]
    }), /orario valido/);
    assert.throws(() => prepareOrder({
        tipo: "ritiro",
        orario: "18:30",
        statoPagamento: "pos",
        tavoloOCliente: "Anna",
        telefonoRitiro: "3331234567",
        righe: [{ prodotto: "Margherita" }]
    }), /Stato di pagamento/);
});

test("payment summary allows both paid and unpaid transitions but keeps POS fixed", () => {
    const { preparePaymentUpdate } = require("../lib/orders");

    assert.deepEqual(preparePaymentUpdate({ tipo: "ritiro", statoPagamento: null }, {
        statoPagamento: "non_pagato"
    }), { statoPagamento: "non_pagato" });
    assert.deepEqual(preparePaymentUpdate({ tipo: "consegna", statoPagamento: "non_pagato" }, {
        statoPagamento: "pagato"
    }), { statoPagamento: "pagato" });
    assert.deepEqual(preparePaymentUpdate({ tipo: "consegna", statoPagamento: "pagato" }, {
        statoPagamento: "non_pagato"
    }), { statoPagamento: "non_pagato" });
    assert.throws(() => preparePaymentUpdate({ tipo: "consegna", statoPagamento: "pos" }, {
        statoPagamento: "pagato"
    }), /POS e' fisso/);
    assert.throws(() => preparePaymentUpdate({ tipo: "banco" }, {
        statoPagamento: "pagato"
    }), /solo per ritiri e consegne/);
});

test("rejects missing order details and products outside the menu", () => {
    assert.throws(() => prepareOrder({ tavoloOCliente: "", righe: [{ prodotto: "Margherita" }] }), /obbligatorio/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Pizza inesistente" }] }), /menu/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Acqua 0,5L", extra: ["bocconcino"] }] }), /non consente/);
    assert.throws(() => prepareOrder({ tavoloOCliente: "Tavolo 1", righe: [{ prodotto: "Margherita", extra: ["extra-inventato"] }] }), /Extra non ammesso/);
    assert.throws(() => prepareOrder({ tipo: "consegna", tavoloOCliente: "Anna", telefonoConsegna: "3331234567", righe: [{ prodotto: "Margherita" }] }), /indirizzo/);
    assert.throws(() => prepareOrder({ tipo: "consegna", tavoloOCliente: "Anna", indirizzoConsegna: "Via Roma 12", telefonoConsegna: "telefono", righe: [{ prodotto: "Margherita" }] }), /telefono/);
    assert.throws(() => prepareOrder({ tipo: "ritiro", tavoloOCliente: "Anna", righe: [{ prodotto: "Margherita" }] }), /telefono/);
    assert.throws(() => prepareOrder({ tipo: "ritiro", tavoloOCliente: "Anna", telefonoRitiro: "non valido", righe: [{ prodotto: "Margherita" }] }), /telefono/);
    assert.throws(() => prepareOrder({ tipo: "banco", righe: [{ prodotto: "Margherita" }] }), /cognome/);
    assert.throws(() => prepareOrder({ tipo: "tavolo", tavoloOCliente: "Tavolo 1", numeroPersone: 0, righe: [{ prodotto: "Margherita" }] }), /numero di persone/);
    assert.throws(() => prepareOrder({ tipo: "asporto", tavoloOCliente: "Anna", righe: [{ prodotto: "Margherita" }] }), /Tipo ordine/);
});
