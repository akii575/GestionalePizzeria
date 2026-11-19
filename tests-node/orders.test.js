const test = require("node:test");
const assert = require("node:assert/strict");
const { filterOrdersByType, prepareOrder: validateOrder, publicOrder } = require("../lib/orders");
const menu = require("../lib/menu.json");
const extras = require("../lib/extras.json");
const extraCategories = new Set(["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"]);
const testCatalog = {
    menu: menu.filter(product => product.nome.trim().toLocaleLowerCase("it-IT") !== "coperto").map(product => ({
        ...product,
        categoriaId: product.categoria,
        ammetteExtra: extraCategories.has(product.categoria),
        disponibile: true
    })),
    extras: extras.map(extra => ({ ...extra, disponibile: true }))
};
function prepareOrder(input, catalog = testCatalog, options) {
    return validateOrder(input, catalog, options);
}

function catalogWithCoperto(coperto) {
    return {
        ...testCatalog,
        allProducts: [...testCatalog.menu, ...(coperto ? [coperto] : [])]
    };
}

test("table orders add the available catalog cover charge and ignore client prices", () => {
    const order = prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 4",
        numeroPersone: 4,
        coperto: { persone: 99, prezzoUnitario: 0.01, totale: 0.99 },
        righe: [{ prodotto: "Margherita" }]
    }, catalogWithCoperto({ nome: " cOpErTo ", prezzo: 2, disponibile: true }));

    assert.deepEqual(order.coperto, { persone: 4, prezzoUnitario: 2, totale: 8 });
    assert.equal(order.totale, 13);
    assert.deepEqual(publicOrder(order).coperto, order.coperto);
});

test("only table orders include a cover charge", () => {
    const catalog = catalogWithCoperto({ nome: "Coperto", prezzo: 2, disponibile: true });
    const common = { righe: [{ prodotto: "Margherita" }] };
    const orders = [
        prepareOrder({ ...common, tipo: "banco", cognomeBanco: "Rossi" }, catalog),
        prepareOrder({ ...common, tipo: "ritiro", tavoloOCliente: "Anna", telefonoRitiro: "3331234567" }, catalog),
        prepareOrder({
            ...common,
            tipo: "consegna",
            indirizzoConsegna: "Via Roma 12",
            telefonoConsegna: "3331234567"
        }, catalog)
    ];

    assert.ok(orders.every(order => order.coperto === null));
    assert.ok(orders.every(order => order.totale === 5));
});

test("missing, archived or unavailable cover products add no charge", () => {
    const orderInput = {
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 4,
        righe: [{ prodotto: "Margherita" }]
    };
    const catalogs = [
        testCatalog,
        catalogWithCoperto({ nome: "Coperto", prezzo: 2, disponibile: true, archiviato: true }),
        catalogWithCoperto({ nome: "Coperto", prezzo: 2, disponibile: false })
    ];

    for (const catalog of catalogs) {
        const order = prepareOrder(orderInput, catalog);
        assert.equal(order.coperto, null);
        assert.equal(order.totale, 5);
    }
});

test("editing recalculates covers for changed guests and preserves unchanged historical prices", () => {
    const oldOrder = {
        tipo: "tavolo",
        numeroPersone: 4,
        coperto: { persone: 4, prezzoUnitario: 2, totale: 8 }
    };
    const catalog = catalogWithCoperto({ nome: "Coperto", prezzo: 3, disponibile: true });
    const input = {
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 6,
        righe: [{ prodotto: "Margherita" }]
    };

    const changed = prepareOrder(input, catalog, { existingRows: [], existingOrder: oldOrder });
    const unchanged = prepareOrder({
        ...input,
        numeroPersone: 4
    }, catalog, { existingRows: [], existingOrder: oldOrder });
    assert.deepEqual(changed.coperto, { persone: 6, prezzoUnitario: 3, totale: 18 });
    assert.equal(changed.totale, 23);
    assert.deepEqual(unchanged.coperto, { persone: 4, prezzoUnitario: 2, totale: 8 });
});

test("editing unchanged table orders preserves covers when the menu entry is unavailable", () => {
    const previous = {
        tipo: "tavolo",
        numeroPersone: 4,
        coperto: { persone: 4, prezzoUnitario: 2, totale: 8 }
    };
    const order = prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 4,
        righe: [{ prodotto: "Margherita" }]
    }, catalogWithCoperto({ nome: "Coperto", prezzo: 3, disponibile: false }), {
        existingOrder: previous
    });

    assert.deepEqual(order.coperto, previous.coperto);
    assert.equal(order.totale, 13);
});

test("editing a legacy table order migrates its Coperto rows into the automatic cover", () => {
    const previous = {
        tipo: "tavolo",
        numeroPersone: 4,
        righe: [
            { prodotto: "Coperto", prezzoBase: 2, totale: 2 },
            { prodotto: "Coperto", prezzoBase: 2, totale: 2 },
            { prodotto: "Coperto", prezzoBase: 2, totale: 2 },
            { prodotto: "Coperto", prezzoBase: 2, totale: 2 }
        ]
    };
    const order = prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 4,
        righe: [{ prodotto: "Margherita" }]
    }, testCatalog, { existingOrder: previous });

    assert.deepEqual(order.coperto, { persone: 4, prezzoUnitario: 2, totale: 8 });
    assert.equal(order.totale, 13);
});

test("a cover product cannot be submitted as an order row", () => {
    assert.throws(() => prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: " cOPERTO " }]
    }), error => error.statusCode === 400 && error.message === "Il coperto viene aggiunto automaticamente.");
});

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
        righe: [{ prodotto: "Coca Cola 33cl" }]
    });

    assert.equal(water.totale, 1);
    assert.equal(cola.totale, 2.5);
});

test("order prices and categories come from Firestore menu data, not client fields", () => {
    const order = prepareOrder({
        tavoloOCliente: "Tavolo 1",
        righe: [{
            prodotto: "Margherita",
            prezzo: 0.01,
            prezzoBase: 0.01,
            categoria: "bibite",
            ingredienti: ["Contenuto inviato dal client"],
            extra: [{ id: "bocconcino", prezzo: 0.01, nome: "Bocconcino" }]
        }]
    });

    assert.equal(order.righe[0].prezzoBase, 5);
    assert.equal(order.righe[0].categoria, "pizze");
    assert.deepEqual(order.righe[0].ingredienti, menu[0].ingredienti);
    assert.deepEqual(order.righe[0].extra, [{ id: "bocconcino", nome: "Bocconcino", prezzo: 2 }]);
    assert.equal(order.totale, 7);
});

test("order validation rejects archived and unavailable products", () => {
    const product = testCatalog.menu.find(item => item.nome === "Margherita");
    const customCatalog = {
        ...testCatalog,
        allProducts: [
            { ...product, disponibile: false },
            { ...testCatalog.menu.find(item => item.nome === "Acqua 0,5L"), archiviato: true }
        ]
    };

    assert.throws(() => prepareOrder({
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: "Margherita" }]
    }, customCatalog), /e' esaurito/);
    assert.throws(() => prepareOrder({
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: "Acqua 0,5L" }]
    }, customCatalog), /e' archiviato/);
});

test("order edits can keep existing unavailable products but cannot add more", () => {
    const product = testCatalog.menu.find(item => item.nome === "Margherita");
    const customCatalog = {
        ...testCatalog,
        allProducts: [{ ...product, disponibile: false }]
    };
    const input = {
        tavoloOCliente: "Tavolo 1",
        note: "Aggiornato",
        righe: [{ prodotto: "Margherita" }]
    };

    assert.equal(
        prepareOrder(input, customCatalog, { existingRows: [{ prodotto: "Margherita" }] }).righe.length,
        1
    );
    assert.throws(() => prepareOrder({
        ...input,
        righe: [...input.righe, { prodotto: "Margherita" }]
    }, customCatalog, { existingRows: [{ prodotto: "Margherita" }] }), /e' esaurito/);
});

test("order edits keep existing archived products but reject new archived rows", () => {
    const product = testCatalog.menu.find(item => item.nome === "Margherita");
    const customCatalog = {
        ...testCatalog,
        allProducts: [{ ...product, archiviato: true }]
    };
    const existingRows = [{ prodotto: "Margherita" }];

    assert.equal(
        prepareOrder({
            tavoloOCliente: "Tavolo 1",
            righe: [{ prodotto: "Margherita" }]
        }, customCatalog, { existingRows }).righe.length,
        1
    );
    assert.throws(() => prepareOrder({
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: "Margherita" }]
    }, customCatalog), /e' archiviato/);
    assert.throws(() => prepareOrder({
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: "Margherita" }, { prodotto: "Margherita" }]
    }, customCatalog, { existingRows }), /e' archiviato/);
});

test("order validation rejects unavailable extras", () => {
    const customCatalog = {
        ...testCatalog,
        allExtras: [
            ...testCatalog.extras,
            { id: "extra-esaurito", nome: "Extra esaurito", prezzo: 1, disponibile: false }
        ]
    };

    assert.throws(() => prepareOrder({
        tavoloOCliente: "Tavolo 1",
        righe: [{ prodotto: "Margherita", extra: ["extra-esaurito"] }]
    }, customCatalog), /non e' disponibile/);
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
    const deliveryWithPayment = statoPagamento => prepareOrder({
        tipo: "consegna",
        orario: "19:45",
        statoPagamento,
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        righe: [{ prodotto: "Margherita" }]
    });
    const delivery = deliveryWithPayment("pos");
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
    assert.equal(deliveryWithPayment("pagato").statoPagamento, "pagato");
    assert.equal(deliveryWithPayment("non_pagato").statoPagamento, "non_pagato");
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
