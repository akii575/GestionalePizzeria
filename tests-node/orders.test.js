const test = require("node:test");
const assert = require("node:assert/strict");
const { filterOrdersByType, prepareOrder: validateOrder, publicOrder } = require("../lib/orders");
const { productConvention } = require("../lib/menu-store");
const menu = require("../lib/menu.json");
const extras = require("../lib/extras.json");
const extraCategories = new Set(["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"]);
const testCatalog = {
    menu: menu.filter(product => product.nome.trim().toLocaleLowerCase("it-IT") !== "coperto").map(product => ({
        ...product,
        categoriaId: product.categoria,
        convenzione: productConvention(product),
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

test("validates and canonicalizes removed ingredients without changing the price", () => {
    const product = {
        ...testCatalog.menu.find(item => item.nome === "Margherita"),
        ingredienti: ["Pomodoro", "Basilico"]
    };
    const catalog = { ...testCatalog, allProducts: [product] };
    const order = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", senza: ["bAsIlIcO"] }]
    }, catalog);

    assert.deepEqual(order.righe[0].senza, ["Basilico"]);
    assert.equal(order.righe[0].totale, product.prezzo);
    for (const senza of [["Origano"], ["Basilico", "basilico"], Array(11).fill("Basilico"), "Basilico"]) {
        assert.throws(() => prepareOrder({
            tipo: "banco",
            cognomeBanco: "Rossi",
            righe: [{ prodotto: "Margherita", senza }]
        }, catalog), /Ingrediente non valido/);
    }
});

test("validates pizza notes against the fixed list and saves canonical values", () => {
    const order = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", note: ["bEn CoTtA", "SENZA GLUTINE"] }]
    });

    assert.deepEqual(order.righe[0].note, ["Ben cotta", "Senza glutine"]);
    assert.deepEqual(prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita" }]
    }).righe[0].note, []);
    assert.deepEqual(publicOrder({
        ...order,
        righe: [{ ...order.righe[0], note: undefined }]
    }).righe[0].note, []);

    for (const note of [
        "Ben cotta",
        null,
        ["Origano"],
        ["Ben cotta", "ben cotta"],
        ["Ben cotta", "Poco cotta", "Tagliata", "Senza glutine", "Senza lattosio", "Ben cotta"]
    ]) {
        assert.throws(() => prepareOrder({
            tipo: "banco",
            cognomeBanco: "Rossi",
            righe: [{ prodotto: "Margherita", note }]
        }), /Nota pizza non valida/);
    }
});

test("new rows without menu ingredients ignore removed ingredients", () => {
    const product = {
        ...testCatalog.menu.find(item => item.nome === "Margherita"),
        ingredienti: []
    };
    const order = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", senza: [] }]
    }, { ...testCatalog, allProducts: [product] });

    assert.deepEqual(order.righe[0].senza, []);
});

test("editing preserves removed ingredients that are no longer in the menu", () => {
    const product = {
        ...testCatalog.menu.find(item => item.nome === "Margherita"),
        ingredienti: ["Pomodoro"]
    };
    const order = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", senza: ["Basilico"] }]
    }, { ...testCatalog, allProducts: [product] }, {
        existingRows: [{ prodotto: "Margherita", senza: ["Basilico"] }]
    });

    assert.deepEqual(order.righe[0].senza, ["Basilico"]);
    assert.throws(() => prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", senza: ["Origano"] }]
    }, { ...testCatalog, allProducts: [product] }, {
        existingRows: [{ prodotto: "Margherita", senza: ["Basilico"] }]
    }), /Ingrediente non valido/);
});

test("editing duplicate products uses each row's client-supplied removed ingredients", () => {
    const product = {
        ...testCatalog.menu.find(item => item.nome === "Margherita"),
        ingredienti: ["Pomodoro", "Basilico"]
    };
    const order = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", senza: [] }]
    }, { ...testCatalog, allProducts: [product] }, {
        existingRows: [
            { prodotto: "Margherita", senza: ["Basilico"] },
            { prodotto: "Margherita", senza: [] }
        ]
    });

    assert.deepEqual(order.righe.map(row => row.senza), [[]]);
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
    assert.equal(publicOrder({ numero: 5, tipo: "tavolo" }).tavoloChiuso, false);
    assert.equal(publicOrder({ numero: 5, tipo: "tavolo" }).chiusoAlle, null);
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

test("server rejects row and total discounts but still exposes legacy discount fields", () => {
    const errorMessage = "Sono disponibili solo le convenzioni universitarie.";
    assert.throws(() => prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", sconto: { tipo: "omaggio", motivo: "Omaggio" } }]
    }), error => error.statusCode === 400 && error.message === errorMessage);
    assert.throws(() => prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita" }],
        sconto: { tipo: "percentuale", valore: 10, motivo: "Promozione" }
    }), error => error.statusCode === 400 && error.message === errorMessage);

    // Le pagine aperte prima dell'aggiornamento inviano campi sconto vuoti.
    const fromOldPage = prepareOrder({
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe: [{ prodotto: "Margherita", sconto: null }],
        sconto: null,
        convenzione: null
    }, { menu: [{ nome: "Margherita", prezzo: 5, disponibile: true }], extras: [] });
    assert.equal(fromOldPage.totale, 5);
    assert.equal("sconto" in fromOldPage, false);

    const legacy = publicOrder({
        numero: 5,
        tipo: "banco",
        dataOra: "2026-03-10T12:00:00.000Z",
        righe: [{
            prodotto: "Margherita",
            totaleLordo: 5,
            totale: 4,
            sconto: { tipo: "importo", valore: 1, motivo: "Promozione", importo: 1 }
        }],
        sconto: { tipo: "percentuale", valore: 10, motivo: "Cliente abituale", importo: 0.4 },
        totaleLordo: 5,
        totale: 3.6
    });
    assert.equal(legacy.righe[0].sconto.motivo, "Promozione");
    assert.equal(legacy.sconto.motivo, "Cliente abituale");
    assert.equal(legacy.totaleLordo, 5);
    assert.equal(legacy.totale, 3.6);
});

test("ten-percent university convention discounts rows and cover without discounting delivery", () => {
    const table = prepareOrder({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 1,
        convenzione: { tipo: "percentuale" },
        righe: [{ prodotto: "Margherita" }]
    }, catalogWithCoperto({ nome: "Coperto", prezzo: 2, disponibile: true }));
    assert.deepEqual(table.convenzione, { tipo: "percentuale", importo: 0.7 });
    assert.equal(table.totaleLordo, 7);
    assert.equal(table.totale, 6.3);

    const delivery = prepareOrder({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        costoConsegna: 2,
        convenzione: { tipo: "percentuale" },
        righe: [{ prodotto: "Margherita" }]
    });
    assert.equal(delivery.convenzione.importo, 0.5);
    assert.equal(delivery.totale, 6.5);
});

function conventionCatalog(products) {
    return {
        menu: products.map(product => ({
            categoriaId: "test",
            categoria: "test",
            ingredienti: [],
            disponibile: true,
            ...product
        })),
        extras: []
    };
}

function bancoInput(righe, extra = {}) {
    return {
        tipo: "banco",
        cognomeBanco: "Rossi",
        righe,
        ...extra
    };
}

test("menu convention pairs the most expensive eligible pizza and drink, with extras at full price", () => {
    const catalog = conventionCatalog([
        { nome: "Pizza 10", prezzo: 10, convenzione: "pizza" },
        { nome: "Pizza 7", prezzo: 7, convenzione: "pizza" },
        { nome: "Pizza 4", prezzo: 4, convenzione: "pizza" },
        { nome: "Pizza 1", prezzo: 1, convenzione: "pizza" },
        { nome: "Bibita 10", prezzo: 10, convenzione: "bibita" },
        { nome: "Bibita 2", prezzo: 2, convenzione: "bibita" },
        { nome: "Bibita 1", prezzo: 1, convenzione: "bibita" }
    ]);
    const order = prepareOrder(bancoInput([
        { prodotto: "Pizza 1" },
        { prodotto: "Pizza 4" },
        { prodotto: "Pizza 7" },
        { prodotto: "Pizza 10" },
        { prodotto: "Bibita 1" },
        { prodotto: "Bibita 2" },
        { prodotto: "Bibita 10" }
    ], { convenzione: { tipo: "menu" } }), catalog);

    assert.deepEqual(order.convenzione, { tipo: "menu", importo: 17, menu: 3 });
    assert.equal(order.totaleLordo, 35);
    assert.equal(order.totale, 18);
});

test("menu convention does not increase low-priced pairs", () => {
    const lowPriceCatalog = conventionCatalog([
        { nome: "Napoletana", prezzo: 4, disponibile: true },
        { nome: "Acqua 0,5L", prezzo: 1, disponibile: true }
    ]);
    const lowPrice = prepareOrder(bancoInput([
        { prodotto: "Napoletana" },
        { prodotto: "Acqua 0,5L" }
    ], { convenzione: { tipo: "menu" } }), lowPriceCatalog);
    assert.deepEqual(lowPrice.convenzione, { tipo: "menu", importo: 0, menu: 1 });
    assert.equal(lowPrice.totale, 5);
});

test("menu convention rejects ineligible fried products and drinks", () => {
    const catalog = conventionCatalog([
        { nome: "Margherita fritta", prezzo: 8 },
        { nome: "Birra", prezzo: 4 }
    ]);
    assert.throws(() => prepareOrder(bancoInput([
        { prodotto: "Margherita fritta" },
        { prodotto: "Birra" }
    ], { convenzione: { tipo: "menu" } }), catalog), error => (
        error.statusCode === 400
        && error.message === "Per il menu convenzione servono una pizza e una bibita idonee."
    ));
});

test("university convention is exclusive and recalculates on edits", () => {
    for (const payload of [
        { sconto: { tipo: "percentuale", valore: 10, motivo: "Promozione" } },
        { righe: [{ prodotto: "Margherita", sconto: { tipo: "omaggio", motivo: "Promo" } }] }
    ]) {
        assert.throws(() => prepareOrder(bancoInput(
            payload.righe || [{ prodotto: "Margherita" }],
            { ...payload, convenzione: { tipo: "percentuale" } }
        )), error => (
            error.statusCode === 400
            && error.message === "Sono disponibili solo le convenzioni universitarie."
        ));
    }
    const catalog = conventionCatalog([
        { nome: "Margherita", prezzo: 8, convenzione: "pizza" },
        { nome: "Coca Cola 33cl", prezzo: 2, convenzione: "bibita" }
    ]);
    const edited = prepareOrder(bancoInput([
        { prodotto: "Margherita" },
        { prodotto: "Coca Cola 33cl" }
    ], { convenzione: { tipo: "menu" } }), catalog, {
        existingRows: [{ prodotto: "Margherita" }],
        existingOrder: { tipo: "banco" }
    });
    assert.deepEqual(edited.convenzione, { tipo: "menu", importo: 4, menu: 1 });
    assert.equal(edited.totale, 6);
});
