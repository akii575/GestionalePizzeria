const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const menu = require("../lib/menu.json");
const {
    normalizza,
    filtraProdotti,
    creaPagineProdotti,
    filtraExtra,
    trovaComponibileSenzaIngredienti,
    NOTE_RIGA,
    applicaClienteIndirizzo,
    isCoperto,
    calcolaCoperto,
    creaRiga,
    preparaRigheModifica,
    creaPayloadComanda,
    puoSalvareModifica,
    aggiungiProdotti,
    quantitaProdotto,
    preparaRipetizione,
    impostaRigaAttiva,
    raggruppaRigheConferma,
    rimuoviProdotto,
    toggleExtra,
    toggleSenza,
    toggleNotaRiga,
    intestazioneExtra,
    LIMITE_RIGHE_ORDINE,
    creaStatoMoltiplicatore,
    premiTastoMoltiplicatore,
    quantitaDaApplicare,
    testoMoltiplicatore,
    aggiornaConteggioProdotti,
    controllaLimiteRighe,
    impostaValoreControllo,
    normalizzaNumeroTavolo,
    nomeTavoloDaNumero,
    numeroTavoloDaNome,
    calcolaTavoliOccupati,
    calcolaCaricoForno,
    creaGestoreTavoli,
    datiObbligatoriMancanti,
    datiOrdineCompleti,
    deveChiudereIntestazione,
    riepilogoIntestazione,
    anteprimaNota,
    aggiungiNotaRapida,
    togliNotaRapida,
    notaContiene
} = require("../src/main/resources/static/prodotti-ui");
const { NOTE_RIGA: NOTE_RIGA_SERVER } = require("../lib/note-riga");

test("client pizza-note choices match the server list", () => {
    assert.deepEqual(NOTE_RIGA, NOTE_RIGA_SERVER);
});

test("product pages keep row-major order and contain at most nine products", () => {
    const fourProducts = creaPagineProdotti(["1", "2", "3", "4"]);
    assert.equal(fourProducts.length, 1);
    assert.deepEqual(
        fourProducts[0].slice(0, 4).map((_, index) => [Math.floor(index / 3) + 1, index % 3 + 1]),
        [[1, 1], [1, 2], [1, 3], [2, 1]]
    );

    const tenProducts = creaPagineProdotti(Array.from({ length: 10 }, (_, index) => String(index + 1)));
    assert.equal(tenProducts.length, 2);
    assert.deepEqual(tenProducts[1], ["10"]);
});

test("edit save is blocked until the original order has loaded", () => {
    const script = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.js"),
        "utf8"
    );
    const guard = script.indexOf("if (numeroModifica && !puoSalvareModifica(payloadOriginaleModifica)) return;");
    const put = script.indexOf("fetch(`/api/ordini/${numeroModifica}`, {");

    assert.equal(puoSalvareModifica(null), false);
    assert.equal(puoSalvareModifica("{}"), true);
    assert.ok(guard >= 0 && put > guard, "the null-payload guard must run before the edit PUT");
});

test("editing an order preserves its rows, extras, exclusions, and one-row-per-product payload", () => {
    const menu = [{
        nome: "Margherita",
        categoria: "pizze",
        prezzo: 6.5,
        ingredienti: ["Pomodoro", "Mozzarella", "Basilico"],
        ammetteExtra: true
    }];
    const extraMenu = [{ id: "mozzarella", nome: "Mozzarella", prezzo: 1.5 }];
    const order = {
        tipo: "tavolo",
        orario: "",
        statoPagamento: null,
        cognomeBanco: "",
        tavoloOCliente: "Tavolo 4",
        numeroPersone: 2,
        indirizzoConsegna: "",
        telefonoConsegna: "",
        costoConsegna: 0,
        telefonoRitiro: "",
        note: "Ben cotta",
        righe: [
            {
                prodotto: "Coperto",
                prezzoBase: 2,
                extra: [],
                senza: []
            },
            {
                prodotto: "Margherita",
                prezzoBase: 6.5,
                ingredienti: menu[0].ingredienti,
                extra: [{ id: "mozzarella", nome: "Mozzarella", prezzo: 1.5 }],
                senza: ["Basilico"],
                note: ["ben cotta"]
            },
            {
                prodotto: "Margherita",
                prezzoBase: 6.5,
                ingredienti: menu[0].ingredienti,
                extra: [],
                senza: []
            }
        ]
    };
    const rows = preparaRigheModifica(order.righe, menu, extraMenu);
    const payload = creaPayloadComanda({
        ...order,
        tavoloOCliente: nomeTavoloDaNumero(numeroTavoloDaNome(order.tavoloOCliente))
    }, rows);

    assert.deepEqual(payload, {
        tipo: "tavolo",
        orario: "",
        statoPagamento: null,
        cognomeBanco: "",
        tavoloOCliente: "Tavolo 4",
        numeroPersone: 2,
        indirizzoConsegna: "",
        telefonoConsegna: "",
        costoConsegna: 0,
        telefonoRitiro: "",
        note: "Ben cotta",
        righe: [
            { prodotto: "Margherita", extra: extraMenu, senza: ["Basilico"], note: ["Ben cotta"] },
            { prodotto: "Margherita", extra: [], senza: [], note: [] }
        ]
    });
});

test("editing removes legacy row and order discounts but preserves convention", () => {
    const rows = preparaRigheModifica([{
        prodotto: "Margherita",
        prezzoBase: 5,
        totaleLordo: 5,
        totale: 4,
        sconto: {
            tipo: "importo",
            valore: 1,
            motivo: "Promozione",
            importo: 1
        },
        extra: [],
        senza: [],
        note: []
    }], [{
        nome: "Margherita",
        categoria: "pizze",
        prezzo: 5,
        ingredienti: [],
        ammetteExtra: true
    }], []);
    const payload = creaPayloadComanda({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 1,
        note: "",
        sconto: { tipo: "percentuale", valore: 10, motivo: "Cliente abituale", importo: 0.4 },
        convenzione: { tipo: "menu" }
    }, rows);

    assert.equal(rows[0].sconto, undefined);
    assert.equal(Object.hasOwn(payload.righe[0], "sconto"), false);
    assert.equal(Object.hasOwn(payload, "sconto"), false);
    assert.deepEqual(payload.convenzione, { tipo: "menu" });
});

test("editing preserves an unavailable product so the waiter can remove it", () => {
    const rows = preparaRigheModifica([
        {
            prodotto: "Pizza fuori menu",
            prezzoBase: 8,
            ingredienti: ["Pomodoro"],
            extra: [],
            senza: ["Pomodoro"]
        }
    ], [], []);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].nonDisponibile, true);
    assert.deepEqual(rows[0].senza, ["Pomodoro"]);
    assert.deepEqual(creaPayloadComanda({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 4",
        numeroPersone: 1,
        note: ""
    }, rows).righe, [{
        prodotto: "Pizza fuori menu",
        extra: [],
        senza: ["Pomodoro"],
        note: []
    }]);
});

const nomi = prodotti => prodotti.map(prodotto => prodotto.nome);

test("normalizes text ignoring case, accents and extra spaces", () => {
    assert.equal(normalizza("  Caffè  "), "caffe");
    assert.equal(normalizza("CROCCHÉ di   Patate"), "crocche di patate");
    assert.equal(normalizza(null), "");
});

test("extra search ignores accents and case", () => {
    const extras = [
        { nome: "Mozzarella di bufala" },
        { nome: "Salsiccia" },
        { nome: "Friarielli" }
    ];

    assert.deepEqual(filtraExtra(extras, "MOZZ"), [extras[0]]);
    assert.deepEqual(filtraExtra(extras, "FRIARIELLI"), [extras[2]]);
    assert.deepEqual(filtraExtra(extras, "salsìccia"), [extras[1]]);
    assert.deepEqual(
        filtraExtra([{ nome: "capperi" }, { nome: "Bocconcino" }, { nome: "alici" }], "")
            .map(extra => extra.nome),
        ["alici", "Bocconcino", "capperi"]
    );
});

test("composable rows require at least one selected ingredient", () => {
    const { righe } = aggiungiProdotti([], null, {
        nome: "Panuozzo da comporre",
        prezzo: 5,
        ammetteExtra: true,
        componibile: true
    });

    assert.equal(righe[0].componibile, true);
    assert.equal(trovaComponibileSenzaIngredienti(righe), 0);
    const complete = toggleExtra(righe, 0, { id: "salsiccia", nome: "Salsiccia", prezzo: 1 });
    assert.equal(trovaComponibileSenzaIngredienti(complete.righe), -1);
    assert.equal(trovaComponibileSenzaIngredienti([
        { componibile: false, extra: [] },
        { componibile: true, extra: [{ nome: "Friarielli" }] }
    ]), -1);
});

test("summary rows use the same fixed grid and touch-sized remove button", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const styles = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/ordini.css"),
        "utf8"
    );
    const ordersPage = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/ordini.js"),
        "utf8"
    );
    const summaryGrid = /\.riepilogo-item\s*\{[^}]*grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto 36px;[^}]*align-items:\s*baseline;[^}]*column-gap:\s*8px;/s;
    const removeButton = /\.riepilogo-item \.rimuovi\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s;

    assert.match(styles, summaryGrid);
    assert.match(styles, removeButton);
    assert.match(styles, /\.riepilogo-prezzo\s*\{[^}]*font-variant-numeric:\s*tabular-nums;[^}]*text-align:\s*right;/s);
    assert.match(ordersPage, /voce\.className = "riepilogo-item"/);
    assert.match(ordersPage, /riepilogo-item__descrizione/);
});

test("order variations and selected chips are bold while extras stay normal", () => {
    const directory = path.join(__dirname, "../src/main/resources/static");
    const styles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const ordersPage = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");

    assert.match(styles, /\.senza-chip\.selezionato\s*\{[^}]*font-weight:\s*700;/);
    assert.match(styles, /\.note-chip\.selezionato\s*\{[^}]*font-weight:\s*700;/);
    assert.match(styles, /\.riepilogo-senza,\s*\.conferma-riga \.conferma-senza\s*\{[^}]*font-weight:\s*700;/);
    assert.match(styles, /\.riepilogo-note-riga,\s*\.conferma-riga \.conferma-nota-riga\s*\{[^}]*font-weight:\s*700;/);
    assert.match(styles, /\.riepilogo-item__descrizione \.riepilogo-extra\s*\{[^}]*font-weight:\s*400;/);
    assert.match(styles, /\.conferma-riga \.conferma-extra\s*\{[^}]*font-weight:\s*400;/);
    assert.match(ordersPage, /class="riepilogo-senza"/);
    assert.match(ordersPage, /class="riepilogo-note-riga"/);
    assert.match(ordersPage, /class="conferma-senza"/);
    assert.match(ordersPage, /class="conferma-nota-riga"/);
});

test("selecting a delivery address fills customer fields and displays its profile", () => {
    const cliente = {
        telefono: "3331234567",
        indirizzo: "Via De Sanctis 7/F",
        ordiniTotali: 3
    };
    const campi = { telefono: { value: "" }, indirizzo: { value: "" } };
    let profiloMostrato = null;

    applicaClienteIndirizzo(cliente, campi, valore => { profiloMostrato = valore; });

    assert.equal(campi.telefono.value, cliente.telefono);
    assert.equal(campi.indirizzo.value, cliente.indirizzo);
    assert.equal(profiloMostrato, cliente);
});

test("custom order selectors update the native controls and dispatch bubbling events", () => {
    class ControlloFinto extends EventTarget {
        value = "";
    }

    const tipo = new ControlloFinto();
    const tavolo = new ControlloFinto();
    const persone = new ControlloFinto();
    const eventi = [];
    for (const [nome, controllo] of [["tipo", tipo], ["tavolo", tavolo], ["persone", persone]]) {
        controllo.addEventListener(nome === "persone" ? "input" : "change", evento => {
            eventi.push([nome, controllo.value, evento.bubbles]);
        });
    }

    impostaValoreControllo(tipo, "consegna", "change");
    impostaValoreControllo(tavolo, "Tavolo 3", "change");
    impostaValoreControllo(persone, "4", "input");

    assert.deepEqual(eventi, [
        ["tipo", "consegna", true],
        ["tavolo", "Tavolo 3", true],
        ["persone", "4", true]
    ]);
});

test("table orders require both an explicit table and a valid people count", () => {
    assert.equal(datiObbligatoriMancanti("tavolo", { tavolo: "", numeroPersone: "" }), "tavolo");
    assert.equal(datiObbligatoriMancanti("tavolo", { tavolo: "Tavolo 2", numeroPersone: "" }), "persone");
    assert.equal(datiObbligatoriMancanti("tavolo", { tavolo: "Tavolo 2", numeroPersone: "31" }), "persone");
    assert.equal(datiObbligatoriMancanti("tavolo", { tavolo: "Tavolo 2", numeroPersone: "4" }), null);
    assert.equal(datiOrdineCompleti("tavolo", { tavolo: "Tavolo 2", numeroPersone: "4" }), true);
    assert.equal(
        datiObbligatoriMancanti("ritiro", { nome: "Rossi", telefono: "123", telefonoValido: false }),
        "telefono"
    );
});

test("the order header stays open while a text input has focus", () => {
    assert.equal(
        deveChiudereIntestazione("banco", { cognome: "Rossi" }, {
            inputAttivo: true,
            motivo: "sfocatura"
        }),
        false
    );
    assert.equal(
        deveChiudereIntestazione("consegna", {
            indirizzo: "Via Roma 12",
            telefono: "3331234567",
            telefonoValido: true
        }, { inputAttivo: true, motivo: "prodotto" }),
        false
    );
});

test("product taps close incomplete desktop headers and summarize missing fields", () => {
    assert.equal(
        deveChiudereIntestazione("tavolo", {}, { motivo: "prodotto", chiudiSuProdotto: true }),
        true
    );
    assert.equal(
        deveChiudereIntestazione("banco", {}, { motivo: "prodotto", chiudiSuProdotto: true }),
        true
    );
    assert.equal(
        deveChiudereIntestazione("banco", {}, { motivo: "prodotto" }),
        false
    );
    assert.equal(
        deveChiudereIntestazione("tavolo", {}, {
            motivo: "prodotto",
            inputAttivo: true,
            chiudiSuProdotto: true
        }),
        false
    );
    assert.equal(
        riepilogoIntestazione("tavolo", { tavolo: "", numeroPersone: "" }, { mostraCampiMancanti: true }),
        "Tavolo ? · scegli tavolo e persone"
    );
    assert.equal(
        riepilogoIntestazione("banco", {}, { mostraCampiMancanti: true }),
        "Banco · manca il cognome"
    );
    assert.equal(
        riepilogoIntestazione("consegna", {}, { mostraCampiMancanti: true }),
        "Consegna · mancano indirizzo/telefono"
    );
});

test("pickup and delivery headers close on blur only after required fields are complete", () => {
    const ritiro = { nome: "Rossi", telefono: "3331234567", telefonoValido: true };
    const consegna = {
        indirizzo: "Via Roma 12",
        telefono: "3331234567",
        telefonoValido: true
    };

    assert.equal(deveChiudereIntestazione("ritiro", ritiro, { motivo: "cambio" }), false);
    assert.equal(deveChiudereIntestazione("ritiro", ritiro, { motivo: "sfocatura" }), true);
    assert.equal(deveChiudereIntestazione("consegna", consegna, { motivo: "sfocatura" }), true);
    assert.equal(deveChiudereIntestazione("consegna", {}, { motivo: "prodotto" }), true);
});

test("order header summaries and note previews use the compact UI labels", () => {
    assert.equal(riepilogoIntestazione("tavolo", { tavolo: "Tavolo 2", numeroPersone: 1 }), "Tavolo 2 · 1 persona");
    assert.equal(riepilogoIntestazione("tavolo", { tavolo: "Tavolo 3", numeroPersone: 4 }), "Tavolo 3 · 4 persone");
    assert.equal(riepilogoIntestazione("tavolo", { tavolo: "Tavolo 23", numeroPersone: 4 }), "Tavolo 23 · 4 persone");
    assert.equal(
        riepilogoIntestazione("consegna", { indirizzo: "Via De Sanctis 7/F", orario: "20:30" }),
        "Consegna · Via De Sanctis 7/F · 20:30"
    );
    assert.equal(anteprimaNota("  Una   nota breve  "), "Una nota breve");
    assert.equal(anteprimaNota("12345678901234567890123456789012345678901"), "1234567890123456789012345678901234567890…");
});

test("custom table selection accepts 1 through 99 and keeps its label in sync", () => {
    const gestioneTavoli = creaGestoreTavoli();

    assert.equal(gestioneTavoli.togglePersonalizzato().aperto, true);
    const selezione = gestioneTavoli.impostaNumeroPersonalizzato("23");

    assert.equal(selezione.tavolo, "Tavolo 23");
    assert.equal(selezione.numeroPersonalizzato, "23");
    assert.equal(selezione.numero, "23");
    assert.equal(selezione.errore, "");
});

test("occupied tables omit closed orders and retain the most recent open order", () => {
    const orders = [
        { numero: 4, tipo: "tavolo", tavoloOCliente: "Tavolo 3", dataOra: "2026-11-24T18:00:00.000Z" },
        { numero: 10, tipo: "sala", tavoloOCliente: "Tavolo 3", dataOra: "2026-11-24T18:30:00.000Z" },
        { numero: 11, tipo: "tavolo", tavoloOCliente: "Tavolo 3", dataOra: "2026-11-24T19:00:00.000Z", tavoloChiuso: true },
        { numero: 12, tipo: "tavolo", tavoloOCliente: "Tavolo 5", dataOra: "2026-11-24T19:30:00.000Z", tavoloChiuso: true }
    ];

    const occupied = calcolaTavoliOccupati(orders);

    assert.equal(occupied.get("3").ordine.numero, 10);
    assert.equal(occupied.get("3").numeroOrdini, 2);
    assert.equal(occupied.has("5"), false);
});

function righeForno(quantita, categoria = "pizze", prodotto = "Margherita") {
    return Array.from({ length: quantita }, () => ({ prodotto, categoria }));
}

test("oven load groups quarter-hour boundaries and rolls through the next hour and midnight", () => {
    const menu = [{ categoria: "pizze", ammetteExtra: true }];
    const orders = [
        { tipo: "ritiro", orario: "20:14", righe: righeForno(1) },
        { tipo: "banco", orario: "20:15", righe: righeForno(2) },
        { tipo: "consegna", orario: "21:00", righe: righeForno(3) },
        { tipo: "ritiro", orario: "23:59", righe: righeForno(4) },
        { tipo: "banco", orario: "00:00", righe: righeForno(5) }
    ];

    const beforeBoundary = calcolaCaricoForno({
        ordini: orders,
        menu,
        tipo: "ritiro",
        orario: "20:14",
        soglia: 12
    });
    assert.deepEqual(beforeBoundary.fasce.map(({ orario, pizze }) => [orario, pizze]), [
        ["20:00", 1], ["20:15", 2], ["20:30", 0]
    ]);

    const crossingHour = calcolaCaricoForno({
        ordini: orders,
        menu,
        tipo: "banco",
        orario: "20:45",
        soglia: 12
    });
    assert.deepEqual(crossingHour.fasce.map(({ orario, pizze }) => [orario, pizze]), [
        ["20:45", 0], ["21:00", 3], ["21:15", 0]
    ]);

    const crossingMidnight = calcolaCaricoForno({
        ordini: orders,
        menu,
        tipo: "consegna",
        orario: "23:45",
        soglia: 12
    });
    assert.deepEqual(crossingMidnight.fasce.map(({ orario, pizze }) => [orario, pizze]), [
        ["23:45", 4], ["00:00", 5], ["00:15", 0]
    ]);
});

test("oven load excludes covers and non-counting categories and defaults to ammetteExtra", () => {
    const menu = [
        { categoria: "pizze", ammetteExtra: true },
        { categoria: "bibite", ammetteExtra: false, contaForno: false },
        { categoria: "dolci", ammetteExtra: true, contaForno: false }
    ];
    const result = calcolaCaricoForno({
        ordini: [{
            tipo: "ritiro",
            orario: "19:00",
            righe: [
                ...righeForno(1),
                ...righeForno(1, "bibite", "Acqua"),
                ...righeForno(1, "dolci", "Torta"),
                ...righeForno(1, "pizze", "Coperto")
            ]
        }],
        menu,
        tipo: "ritiro",
        orario: "19:00",
        soglia: 12
    });

    assert.equal(result.fasce[0].pizze, 1);
});

test("oven load excludes the order being edited and adds current rows to its selected slot", () => {
    const menu = [{ categoria: "pizze", ammetteExtra: true }];
    const result = calcolaCaricoForno({
        ordini: [
            { numero: 10, tipo: "ritiro", orario: "20:00", righe: righeForno(8) },
            { numero: 11, tipo: "consegna", orario: "20:00", righe: righeForno(3) }
        ],
        menu,
        tipo: "banco",
        orario: "20:00",
        righeCorrenti: righeForno(1),
        numeroEscluso: 10,
        soglia: 12
    });

    assert.equal(result.fasce[0].pizzeOrdini, 3);
    assert.equal(result.fasce[0].pizzeComanda, 1);
    assert.equal(result.fasce[0].pizze, 4);
});

test("oven load uses Rome creation time for table orders and marks twelve pizzas as full", () => {
    const menu = [{ categoria: "pizze", ammetteExtra: true }];
    const tavoli = calcolaCaricoForno({
        ordini: [
            { tipo: "tavolo", dataOra: "2026-11-25T19:14:00.000Z", righe: righeForno(2) },
            { tipo: "tavolo", dataOra: "2026-11-25T19:15:00.000Z", righe: righeForno(3) }
        ],
        menu,
        tipo: "ritiro",
        orario: "20:00",
        soglia: 12
    });
    assert.deepEqual(tavoli.fasce.slice(0, 2).map(({ orario, pizze }) => [orario, pizze]), [
        ["20:00", 2], ["20:15", 3]
    ]);

    const sottoSoglia = calcolaCaricoForno({
        ordini: [{ tipo: "banco", orario: "20:30", righe: righeForno(11) }],
        menu,
        tipo: "banco",
        orario: "20:30",
        soglia: 12
    });
    const pieno = calcolaCaricoForno({
        ordini: [{ tipo: "banco", orario: "20:30", righe: righeForno(11) }],
        menu,
        tipo: "banco",
        orario: "20:30",
        righeCorrenti: righeForno(1),
        soglia: 12
    });
    assert.equal(sottoSoglia.fasce[0].pieno, false);
    assert.equal(pieno.fasce[0].pizze, 12);
    assert.equal(pieno.fasce[0].pieno, true);
});

test("invalid custom table numbers show the required validation message", () => {
    for (const valore of ["0", "100", "", "abc", "1.5"]) {
        const gestioneTavoli = creaGestoreTavoli();
        gestioneTavoli.togglePersonalizzato();
        const selezione = gestioneTavoli.impostaNumeroPersonalizzato(valore);

        assert.equal(selezione.tavolo, "");
        assert.equal(selezione.errore, "Numero tavolo da 1 a 99");
    }
    assert.equal(normalizzaNumeroTavolo("1"), "1");
    assert.equal(normalizzaNumeroTavolo("99"), "99");
    assert.equal(normalizzaNumeroTavolo("100"), "");
});

test("choosing a quick table closes and clears a previous custom selection", () => {
    const gestioneTavoli = creaGestoreTavoli();
    gestioneTavoli.togglePersonalizzato();
    gestioneTavoli.impostaNumeroPersonalizzato("23");

    const selezione = gestioneTavoli.scegli(5);

    assert.equal(selezione.tavolo, "Tavolo 5");
    assert.equal(selezione.aperto, false);
    assert.equal(selezione.numero, "");
    assert.equal(selezione.numeroPersonalizzato, "");
});

test("reset clears the selected table and closes the custom field", () => {
    const gestioneTavoli = creaGestoreTavoli();
    gestioneTavoli.togglePersonalizzato();
    gestioneTavoli.impostaNumeroPersonalizzato("23");

    const selezione = gestioneTavoli.reset();

    assert.equal(selezione.tavolo, "");
    assert.equal(selezione.numero, "");
    assert.equal(selezione.aperto, false);
});

test("order entry and edit mode use the same custom table number controls", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const html = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");

    assert.match(script, /for \(let numero = 1; numero <= 15; numero\+\+\)/);
    assert.match(script, /dataset\.tavoloPersonalizzato = ""/);
    assert.match(script, /setAttribute\("aria-label", "Altro tavolo"\)/);
    assert.match(script, /gestioneTavoli\.togglePersonalizzato\(\)/);
    assert.match(script, /gestioneTavoli\.impostaNumeroPersonalizzato\(numeroTavoloPersonalizzato\.value\)/);
    assert.match(script, /bottonePersonalizzato\.textContent = selezione\.numeroPersonalizzato \|\| "\+"/);
    assert.match(script, /gestioneTavoli\.reset\(\);\s*aggiornaSelettoreTavoli\(\)/);
    assert.match(script, /tavolo\.add\(opzione\)/);
    assert.match(html, /id="tavolo" class="visually-hidden" required>\s*<option value="" selected disabled/);
    assert.doesNotMatch(html, /<option value="Tavolo \d+">/);
    assert.match(
        html,
        /id="numero-tavolo-personalizzato"[\s\S]*type="number"[\s\S]*inputmode="numeric"[\s\S]*pattern="\[0-9\]\*"[\s\S]*min="1"[\s\S]*max="99"/
    );
    assert.equal(numeroTavoloDaNome("Tavolo 23"), "23");
    assert.equal(nomeTavoloDaNumero("23"), "Tavolo 23");
    assert.match(script, /numeroTavoloDaNome\(ordine\.tavoloOCliente\)/);
    assert.match(script, /nomeTavoloDaNumero\(numeroTavoloDaNome\(tavolo\.value\)\)/);
    assert.match(script, /gestioneTavoli\.impostaNumeroPersonalizzato\(numeroTavoloOrdine\)/);
});

test("oven preview sits under the time field and refreshes from versioned service-day orders", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const html = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const css = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const updater = script.slice(
        script.indexOf("async function aggiornaTavoliOccupati"),
        script.indexOf("function configuraAggiornamentoTavoliOccupati")
    );

    assert.match(script, /const FORNO_PIZZE_PER_QUARTO = 12/);
    assert.match(html, /id="orario" type="time"[\s\S]*?id="carico-forno"/);
    assert.match(html, /id="carico-forno" class="carico-forno"[^>]*hidden/);
    assert.match(script, /orario\.addEventListener\("input", aggiornaCaricoForno\)/);
    assert.match(script, /renderRiepilogo\(\);[\s\S]*?aggiornaCaricoForno\(\);/);
    assert.match(updater, /new URLSearchParams\(\{ data \}\)/);
    assert.match(updater, /parametri\.set\("versione"/);
    assert.match(updater, /statoTavoliOccupati\.ordiniForno = risultato\.ordini/);
    assert.match(script, /setInterval\(\(\) => void aggiornaTavoliOccupati\(\), 15000\)/);
    assert.match(css, /\.carico-forno__fascia\.is-selezionata/);
    assert.match(css, /\.carico-forno__fascia\.is-pieno/);
});

test("quick notes append with a separator and preserve manually written text", () => {
    assert.equal(aggiungiNotaRapida("", "Ben cotta"), "Ben cotta");
    assert.equal(aggiungiNotaRapida("senza cipolla", "Ben cotta"), "senza cipolla, Ben cotta");
    assert.equal(aggiungiNotaRapida("  senza cipolla  ", "Ben cotta"), "  senza cipolla, Ben cotta");
});

test("quick notes are not added twice and match regardless of case", () => {
    assert.equal(notaContiene("BEN COTTA, tagliata", "Ben cotta"), true);
    assert.equal(aggiungiNotaRapida("BEN COTTA, tagliata", "Ben cotta"), "BEN COTTA, tagliata");
    assert.equal(notaContiene("Da dividere", ""), false);
});

test("quick note toggles do not remove matching words from manual text", () => {
    const testoManuale = "Non ben cotta";
    assert.equal(notaContiene(testoManuale, "Ben cotta"), false);
    assert.equal(aggiungiNotaRapida(testoManuale, "Ben cotta"), "Non ben cotta, Ben cotta");
    assert.equal(togliNotaRapida("Non ben cotta, Ben cotta", "Ben cotta"), testoManuale);
});

test("removing a quick note cleans duplicate commas and spaces", () => {
    assert.equal(togliNotaRapida("Senza cipolla, Ben cotta, extra", "ben cotta"), "Senza cipolla, extra");
    assert.equal(togliNotaRapida("Ben cotta, Poco cotta", "Ben cotta"), "Poco cotta");
    assert.equal(togliNotaRapida("Ben cotta", "Ben cotta"), "");
});

test("order entry wires selector events, first-product collapse, reset and note toggle", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const html = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");

    assert.match(script, /impostaValoreControllo\(tipoOrdine, bottone\.dataset\.tipoOrdine, "change"\)/);
    assert.match(script, /gestioneTavoli\.scegli\(numero\);\s*aggiornaSelettoreTavoli\(\)/);
    assert.match(script, /impostaValoreControllo\(numeroPersone, String\(persone\), "input"\)/);
    assert.match(script, /intestazione\.addEventListener\("focusout",[\s\S]*?aggiornaStatoIntestazione\("sfocatura"\)/);
    assert.match(script, /deveChiudereIntestazione\(tipoOrdine\.value,\s*datiIntestazioneCorrenti\(\),\s*\{\s*inputAttivo,\s*motivo,\s*chiudiSuProdotto:\s*window\.matchMedia\("\(min-width: 800px\)"\)\.matches\s*\}\)/);
    assert.match(script, /intestazioneCompatta\.addEventListener\("click", apriIntestazione\)/);
    assert.match(script, /noteToggle\.addEventListener\("click"/);
    assert.match(script, /note\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/);
    assert.match(script, /bottone\.hidden = !consegna/);
    assert.match(html, /data-note-rapida-consegna/);
    assert.match(script, /ripristinaIntestazioneComanda\(\)/);
    assert.match(html, /id="tavolo" class="visually-hidden" required/);
    assert.match(html, /id="numero-persone" class="visually-hidden" type="number"[^>]*required/);
});

test("people selector is a five-column grid without horizontal scrolling", () => {
    const css = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.css"),
        "utf8"
    );
    const regole = [...css.matchAll(/([^{}]*\.persone-selettore[^{}]*)\{([^{}]*)\}/g)].map(regola => regola[2]);

    assert.ok(regole.length > 0);
    assert.ok(regole.some(regola => /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/.test(regola)));
    for (const regola of regole) {
        assert.doesNotMatch(regola, /overflow(-x)?\s*:|display:\s*flex|flex-wrap/);
    }
});

test("search ignores case and accents on the real menu", () => {
    assert.ok(nomi(filtraProdotti(menu, "caffe")).includes("Caffè"));
    assert.ok(nomi(filtraProdotti(menu, "CROCCHE")).includes("Crocché di Patate"));
    assert.ok(nomi(filtraProdotti(menu, "caffè")).includes("Caffè"));
});

test("search covers products of every category", () => {
    const categorie = new Set(filtraProdotti(menu, "margherita").map(prodotto => prodotto.categoria));
    assert.ok(categorie.has("pizze"));
    assert.ok(categorie.has("pizze fritte"));
    assert.ok(categorie.has("ripieni"));
    for (const categoria of new Set(menu.map(prodotto => prodotto.categoria))) {
        const prodotto = menu.find(voce => voce.categoria === categoria);
        assert.ok(
            filtraProdotti(menu, prodotto.nome).includes(prodotto),
            `${prodotto.nome} (${categoria}) non trovato`
        );
    }
});

test("empty or blank queries return no results", () => {
    assert.deepEqual(filtraProdotti(menu, ""), []);
    assert.deepEqual(filtraProdotti(menu, "   "), []);
    assert.deepEqual(filtraProdotti(menu, "zzzz-nessuno"), []);
    assert.deepEqual(filtraProdotti(undefined, "pizza"), []);
});

test("cover is matched case-insensitively and calculated only for table service", () => {
    assert.equal(isCoperto({ nome: "  cOpErTo " }), true);
    assert.equal(isCoperto({ nome: "Coperto speciale" }), false);
    assert.deepEqual(calcolaCoperto("tavolo", 4, 2), {
        persone: 4,
        prezzoUnitario: 2,
        totale: 8
    });
    assert.deepEqual(calcolaCoperto("tavolo", 3, 1.335), {
        persone: 3,
        prezzoUnitario: 1.335,
        totale: 4.01
    });
    assert.equal(calcolaCoperto("banco", 4, 2), null);
    assert.equal(calcolaCoperto("tavolo", 0, 2), null);
});

test("order entry and edit mode keep cover out of selectable product rows", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const orderScript = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");

    assert.match(orderScript, /stato\.menu\.filter\(prodotto => !isCoperto\(prodotto\)\)/);
    assert.match(orderScript, /!isCoperto\(prodotto\) && prodotto\.categoria === stato\.categoria/);
    assert.match(orderScript, /preparaRigheModifica\(ordine\.righe, stato\.menu, stato\.extra\)/);
    assert.match(orderScript, /numeroPersone\.addEventListener\("input", \(\) => \{[\s\S]*?renderRiepilogo\(\);/);
});

test("count label updates to plural after adding three products", () => {
    const conteggio = { textContent: "0 prodotti" };
    const righe = [];
    righe.push({}, {}, {});

    aggiornaConteggioProdotti(conteggio, righe.length);

    assert.equal(conteggio.textContent, "3 prodotti");
});

test("product-card quantity counts matching order rows and stays absent at zero", () => {
    const righe = [
        { prodotto: "Margherita" },
        { prodotto: "Diavola" },
        { prodotto: "Margherita" }
    ];

    assert.equal(quantitaProdotto(righe, "Margherita"), 2);
    assert.equal(quantitaProdotto(righe, "Diavola"), 1);
    assert.equal(quantitaProdotto(righe, "Capricciosa"), 0);
    assert.equal(quantitaProdotto(null, "Margherita"), 0);
});

test("names starting with the query come first, then alphabetical order", () => {
    const prodotti = [
        { nome: "Carbonpizza", categoria: "pizze", prezzo: 8 },
        { nome: "Pizza Fiocco", categoria: "pizze", prezzo: 7 },
        { nome: "Crokko Pizza", categoria: "pizze", prezzo: 9 },
        { nome: "Pizza bianca", categoria: "pizze", prezzo: 5 }
    ];
    assert.deepEqual(nomi(filtraProdotti(prodotti, "pizza")), [
        "Pizza bianca",
        "Pizza Fiocco",
        "Carbonpizza",
        "Crokko Pizza"
    ]);
});

test("every typed word must appear in the product name", () => {
    const trovati = nomi(filtraProdotti(menu, "salsiccia provola"));
    assert.ok(trovati.includes("Salsiccia, Provola e Porcini"));
    assert.ok(!trovati.includes("Salsiccia e Patatine"));
});

test("new rows always start without extras", () => {
    const pizza = {
        nome: "Margherita",
        categoria: "pizze",
        prezzo: 5,
        ingredienti: ["pomodoro"],
        ammetteExtra: true
    };
    assert.deepEqual(creaRiga(pizza), {
        prodotto: "Margherita",
        prezzo: 5,
        categoria: "pizze",
        ingredienti: ["pomodoro"],
        ammetteExtra: true,
        componibile: false,
        extra: [],
        senza: [],
        note: []
    });
});

test("removed ingredient chips toggle canonical ingredients on the active row", () => {
    const pizza = {
        nome: "Margherita",
        prezzo: 5,
        ingredienti: ["Pomodoro", "Basilico"],
        ammetteExtra: true
    };
    const righe = [creaRiga(pizza)];
    const rimossa = toggleSenza(righe, 0, "basilico");

    assert.deepEqual(rimossa[0].senza, ["Basilico"]);
    assert.deepEqual(toggleSenza(rimossa, 0, "Basilico")[0].senza, []);
    assert.equal(toggleSenza(righe, null, "Basilico"), righe);
});

test("pizza-note chips toggle canonical notes only on the active row", () => {
    const righe = [
        { prodotto: "Margherita", note: [] },
        { prodotto: "Marinara", note: [] }
    ];
    const selezionate = toggleNotaRiga(righe, 0, "bEn CoTtA");

    assert.deepEqual(selezionate[0].note, ["Ben cotta"]);
    assert.deepEqual(selezionate[1], righe[1]);
    assert.deepEqual(toggleNotaRiga(selezionate, 0, "BEN COTTA")[0].note, []);
    assert.equal(toggleNotaRiga(righe, 0, "Da dividere"), righe);
    assert.equal(toggleNotaRiga(righe, null, "Ben cotta"), righe);
});

test("repeat-last-order restores only removed ingredients still in the menu", () => {
    const product = {
        nome: "Margherita",
        prezzo: 5,
        ingredienti: ["Pomodoro", "Basilico"],
        disponibile: true,
        ammetteExtra: true
    };
    const result = preparaRipetizione({
        righe: [{ prodotto: "Margherita", quantita: 1, extra: [], senza: ["Basilico", "Cipolla"], note: ["Ben cotta"] }]
    }, [product], [], 10);

    assert.deepEqual(result.righe[0].senza, ["Basilico"]);
    assert.deepEqual(result.righe[0].note, ["Ben cotta"]);
});

test("active extra row tracks eligible products but not drinks", () => {
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ammetteExtra: true };
    const bibita = { nome: "Coca Cola", categoria: "bibite", prezzo: 2, ammetteExtra: false };
    let stato = aggiungiProdotti([], null, pizza);
    assert.equal(stato.rigaAttiva, 0);
    stato = aggiungiProdotti(stato.righe, stato.rigaAttiva, bibita);
    assert.equal(stato.rigaAttiva, 0);
});

test("extras toggle on the active row and do nothing without an active row", () => {
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ammetteExtra: true };
    const extra = { id: "bufala", nome: "Bufala", prezzo: 2 };
    const righe = [creaRiga(pizza)];
    assert.deepEqual(toggleExtra(righe, null, extra), { righe, rigaAttiva: null });
    const selezionato = toggleExtra(righe, 0, extra);
    assert.deepEqual(nomiExtra(selezionato.righe[0].extra), ["Bufala"]);
    const rimosso = toggleExtra(selezionato.righe, 0, extra);
    assert.deepEqual(rimosso.righe[0].extra, []);
});

function nomiExtra(extra) {
    return extra.map(elemento => elemento.nome);
}

test("multiplier activates the last added eligible row", () => {
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ammetteExtra: true };
    const stato = aggiungiProdotti([], null, pizza, 3);
    assert.equal(stato.righe.length, 3);
    assert.equal(stato.rigaAttiva, 2);
});

test("removing active or preceding rows keeps the active pizza correctly selected", () => {
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ammetteExtra: true };
    const bibita = { nome: "Coca Cola", categoria: "bibite", prezzo: 2, ammetteExtra: false };
    let stato = aggiungiProdotti([], null, pizza, 2);
    stato = aggiungiProdotti(stato.righe, stato.rigaAttiva, bibita);
    stato = rimuoviProdotto(stato.righe, stato.rigaAttiva, 1);
    assert.equal(stato.rigaAttiva, 0);
    stato = aggiungiProdotti(stato.righe, stato.rigaAttiva, pizza);
    stato = rimuoviProdotto(stato.righe, stato.rigaAttiva, 0);
    assert.equal(stato.rigaAttiva, 1);
    assert.equal(stato.righe[stato.rigaAttiva].prodotto, "Margherita");
});

test("removing the only extra-eligible row clears the active row", () => {
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ammetteExtra: true };
    const bibita = { nome: "Coca Cola", categoria: "bibite", prezzo: 2, ammetteExtra: false };
    let stato = aggiungiProdotti([], null, pizza);
    stato = aggiungiProdotti(stato.righe, stato.rigaAttiva, bibita);
    stato = rimuoviProdotto(stato.righe, stato.rigaAttiva, 0);

    assert.equal(stato.rigaAttiva, null);
    assert.deepEqual(stato.righe.map(riga => riga.prodotto), ["Coca Cola"]);
});

test("selecting a previous pizza and disambiguating duplicate names", () => {
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ammetteExtra: true };
    let stato = aggiungiProdotti([], null, pizza, 2);
    stato = impostaRigaAttiva(stato.righe, 0);
    assert.equal(stato.rigaAttiva, 0);
    assert.equal(intestazioneExtra(stato.righe, stato.rigaAttiva), "Extra per: Margherita (n° 1)");

    const bibita = creaRiga({ nome: "Coca Cola", categoria: "bibite", prezzo: 2 });
    assert.equal(impostaRigaAttiva([bibita], 0).rigaAttiva, 0);
});

test("confirmation groups identical rows but keeps different extras and notes separate", () => {
    const margherita = {
        prodotto: "Margherita",
        prezzo: 6.5,
        extra: [],
        senza: [],
        note: ["Ben cotta"]
    };
    const righe = raggruppaRigheConferma([margherita, { ...margherita }]);
    assert.equal(righe.length, 1);
    assert.equal(righe[0].quantita, 2);

    const conExtra = { ...margherita, extra: [{ id: "bufala", nome: "Bufala" }] };
    const differenziate = raggruppaRigheConferma([margherita, conExtra]);
    assert.equal(differenziate.length, 2);
    assert.deepEqual(differenziate.map(gruppo => gruppo.quantita), [1, 1]);

    const conNotaDiversa = { ...margherita, note: ["Poco cotta"] };
    const separate = raggruppaRigheConferma([margherita, conExtra, conNotaDiversa]);
    assert.equal(separate.length, 3);
    assert.deepEqual(separate.map(gruppo => gruppo.quantita), [1, 1, 1]);
});

test("removing one from an identical-row group removes only its last row", () => {
    const rows = [
        { prodotto: "Margherita", extra: [], senza: [], note: [] },
        { prodotto: "Margherita", extra: [], senza: [], note: [] },
        { prodotto: "Margherita", extra: [], senza: [], note: [] }
    ];
    const [group] = raggruppaRigheConferma(rows);
    const result = rimuoviProdotto(rows, null, group.indici[group.indici.length - 1]);

    assert.equal(group.quantita, 3);
    assert.equal(result.righe.length, 2);
    assert.deepEqual(result.righe, rows.slice(0, 2));
    assert.equal(result.rigaAttiva, null);
});

test("multiplier keypad composes up to two digits and ignores a leading zero", () => {
    let stato = creaStatoMoltiplicatore();
    stato = premiTastoMoltiplicatore(stato, "0");
    stato = premiTastoMoltiplicatore(stato, "1");
    stato = premiTastoMoltiplicatore(stato, "8");
    stato = premiTastoMoltiplicatore(stato, "7");

    assert.equal(stato.numero, "18");
    assert.equal(stato.armato, false);
    assert.equal(testoMoltiplicatore(stato), "18");
    assert.equal(quantitaDaApplicare(stato), 1);
});

test("multiplier keypad arms a quantity, ignores an empty confirmation and clears", () => {
    const vuoto = creaStatoMoltiplicatore();
    assert.equal(premiTastoMoltiplicatore(vuoto, "×").armato, false);
    assert.equal(quantitaDaApplicare(vuoto), 1);

    let stato = premiTastoMoltiplicatore(vuoto, "1");
    stato = premiTastoMoltiplicatore(stato, "8");
    stato = premiTastoMoltiplicatore(stato, "×");
    assert.equal(testoMoltiplicatore(stato), "18 ×");
    assert.equal(quantitaDaApplicare(stato), 18);

    stato = premiTastoMoltiplicatore(stato, "C");
    assert.deepEqual(stato, creaStatoMoltiplicatore());
    assert.equal(testoMoltiplicatore(stato), "—");
});

test("digits after arming start a fresh quantity", () => {
    let stato = creaStatoMoltiplicatore();
    for (const tasto of ["1", "8", "×", "2"]) {
        stato = premiTastoMoltiplicatore(stato, tasto);
    }

    assert.deepEqual(stato, { numero: "2", armato: false });
    assert.equal(quantitaDaApplicare(stato), 1);
});

test("multiplier quantity is checked atomically against the 100-row limit", () => {
    assert.equal(LIMITE_RIGHE_ORDINE, 100);
    assert.deepEqual(controllaLimiteRighe(98, 2), { consentito: true, disponibili: 2 });
    assert.deepEqual(controllaLimiteRighe(99, 2), { consentito: false, disponibili: 1 });
    assert.deepEqual(controllaLimiteRighe(100, 1), { consentito: false, disponibili: 0 });
    assert.deepEqual(controllaLimiteRighe(101, 1), { consentito: false, disponibili: 0 });
    assert.deepEqual(controllaLimiteRighe(-1, 1), { consentito: false, disponibili: 0 });
    assert.equal(controllaLimiteRighe(0, 0).consentito, false);
});

test("new order page has the search button before Pizze and loads the search module first", () => {
    const pagina = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.html"),
        "utf8"
    );
    const ricerca = pagina.indexOf('id="btn-ricerca"');
    const pizze = pagina.indexOf('data-tab="pizze"');
    assert.ok(ricerca > -1 && ricerca < pizze);
    assert.match(pagina, /id="ricerca-input"[\s\S]*type="search"/);
    assert.match(pagina, /id="ricerca-tasti"[\s\S]*data-moltiplicatore="×"/);
    assert.match(pagina, /id="ricerca-messaggio"[\s\S]*role="status"/);
    assert.ok(pagina.indexOf('src="/prodotti-ui.js"') < pagina.indexOf('src="/ordini.js"'));
    const stile = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.css"),
        "utf8"
    );
    assert.match(stile, /min-height:\s*56px/);
    assert.match(stile, /@media \(max-width: 700px\)[\s\S]*\.ricerca-tastierino\s*\{[\s\S]*order:\s*-1/);
});

test("product cards expose the ingredient toggle and quantity badge markup", () => {
    const pagina = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.html"),
        "utf8"
    );
    const script = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.js"),
        "utf8"
    );
    const stile = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.css"),
        "utf8"
    );
    const navigationStyle = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "nav.css"),
        "utf8"
    );

    assert.match(pagina, /id="btn-ingredienti"[\s\S]*aria-pressed="true"[\s\S]*<svg/);
    assert.match(script, /className = "prodotto-btn__meta"/);
    assert.match(script, /className = "prodotto-quantita"/);
    assert.match(script, /badge\.textContent = String\(quantita\)/);
    assert.match(script, /badge\?\.remove\(\)/);
    assert.match(stile, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(stile, /\.prodotto-quantita\s*\{[^}]*top:\s*auto;[^}]*right:\s*4px;[^}]*bottom:\s*4px;[^}]*left:\s*auto;[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*background:\s*#1a5ea9;/);
    assert.match(stile, /\.prodotto-btn strong\s*\{[^}]*max-height:\s*2\.3em;[^}]*grid-column:\s*1 \/ -1;[^}]*overflow-wrap:\s*normal;[^}]*text-overflow:\s*clip;[^}]*word-break:\s*normal;[^}]*hyphens:\s*none;/s);
    assert.match(stile, /\.prodotto-btn strong::before\s*\{[^}]*float:\s*right;[^}]*width:\s*56px;[^}]*height:\s*1\.15em;/s);
    assert.match(stile, /\.prodotto-btn \.prezzo-prodotto\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;[^}]*white-space:\s*nowrap;/s);
    assert.doesNotMatch(stile, /\.prodotto-btn\.ha-quantita \.prodotto-nome\s*\{[^}]*padding-left:\s*28px;/);
    assert.match(stile, /\.prodotto-btn\.ha-quantita \.ingredienti\s*\{[^}]*padding-right:\s*20px;/);
    assert.match(stile, /@media \(max-width: 1023px\)[\s\S]*\.prodotto-btn__meta\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*\.prodotto-btn \.prodotto-nome\s*\{[^}]*-webkit-line-clamp:\s*2;[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*normal;[^}]*hyphens:\s*none;[\s\S]*\.prodotto-btn \.prezzo-prodotto\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;[^}]*font-size:\s*15px;/);
    assert.match(stile, /\.tab-container \.tab\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
    assert.match(stile, /\.composer-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*3fr\) minmax\(0,\s*7fr\);[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) minmax\(18px,\s*auto\) 20px 36px;/s);
    assert.match(stile, /\.riepilogo-item__descrizione \.seleziona-riga\s*\{[^}]*display:\s*-webkit-box;[^}]*white-space:\s*normal;[^}]*-webkit-line-clamp:\s*2;/s);
    assert.match(stile, /\.ingredienti-nascosti \.prodotto-btn\s*\{[^}]*min-height:\s*64px;/);
    assert.match(script, /function aggiornaRighePaginaProdotti\([\s\S]*?matchMedia\("\(min-width: 600px\)"\)[\s\S]*?aggiornaRigheIngredienti\(pagina\)/);
    assert.match(script, /function renderPagineProdotti\([\s\S]*?creaPagineProdotti\(elenco\)[\s\S]*?griglia\.appendChild\(pagina\)/);
    assert.match(script, /function aggiornaRighePaginaProdotti\([\s\S]*?--prodotti-altezza-massima[\s\S]*?paginaCorrente\.clientHeight[\s\S]*?Math\.min\(\s*altezzaMassima,\s*Math\.max\(0,\s*altezzaDisponibile \/ 3\)\s*\)[\s\S]*?--prodotti-altezza-riga/);
    assert.match(script, /function aggiornaRigheIngredienti\([\s\S]*?bottone\.clientHeight[\s\S]*?stileBottone\.paddingTop[\s\S]*?stileBottone\.paddingBottom[\s\S]*?intestazione\.offsetHeight[\s\S]*?stileWrapper\.marginTop[\s\S]*?Math\.min\(5,[\s\S]*?Math\.floor\(Math\.max\(0, altezzaDisponibile\) \/ altezzaRiga\)/);
    assert.match(script, /function aggiornaIndicatoreProdotti\([\s\S]*?Math\.ceil\(griglia\.querySelectorAll\("\.prodotto-btn"\)\.length \/ 9\)/);
    assert.match(script, /chiudiSuProdotto:\s*window\.matchMedia\("\(min-width: 800px\)"\)\.matches/);
    assert.match(navigationStyle, /@media \(min-width: 800px\)[\s\S]*?body\.orders-composer-page\.app-shell\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/);
    assert.match(navigationStyle, /body\.orders-composer-page\.app-shell main\.container\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/);
    assert.match(navigationStyle, /body\.orders-composer-page\.app-shell main\.container \.composer-main:not\(\.intestazione-chiusa\)\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*45%\)\s*40px\s*minmax\(120px,\s*1fr\)\s*40px;[^}]*gap:\s*6px;[^}]*overflow:\s*hidden;/);
    assert.match(navigationStyle, /body\.orders-composer-page\.app-shell main\.container \.composer-main:not\(\.intestazione-chiusa\) > \.tavolo-input\s*\{[^}]*min-height:\s*0;[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/);
    assert.match(navigationStyle, /body\.orders-composer-page\.app-shell main\.container \.composer-main:not\(\.intestazione-chiusa\) > \.extra-section\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px;[^}]*max-height:\s*40px;/);
    assert.match(navigationStyle, /body\.orders-composer-page\.app-shell main\.container \.composer-summary > \.riepilogo-card > \.riepilogo-totale-riga\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;/);
    assert.match(script, /intestazioneCompatta\.classList\.toggle\([\s\S]*?"dati-mancanti"[\s\S]*?mostraCampiMancanti && !datiCompleti/);
    assert.match(stile, /\.intestazione-compatta\.dati-mancanti\s*\{[^}]*color:\s*#b91c1c;/);
    assert.match(navigationStyle, /@media \(min-width: 1024px\)[\s\S]*?\.prodotto-btn \.prodotto-nome\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/);
    assert.match(navigationStyle, /@media \(min-width: 600px\)[\s\S]*?\.prodotto-btn\s*\{[^}]*padding:\s*clamp\(8px,\s*4cqi,\s*16px\);[\s\S]*?\.prodotto-btn strong\s*\{[^}]*font-size:\s*clamp\(15px,\s*7cqi,\s*22px\);[\s\S]*?\.prodotto-btn \.prezzo-prodotto\s*\{[^}]*font-size:\s*clamp\(14px,\s*6cqi,\s*20px\);/);
    assert.match(navigationStyle, /@media \(min-width: 600px\)[\s\S]*?\.prodotto-btn \.ingredienti-wrapper\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin-top:\s*4px;[^}]*\}[\s\S]*?\.prodotto-btn \.ingredienti\s*\{[^}]*max-height:\s*var\(--ingredienti-altezza,\s*6\.75em\);[^}]*margin:\s*0;[^}]*font-size:\s*clamp\(12px,\s*5cqi,\s*16px\);[^}]*line-height:\s*1\.35;[^}]*-webkit-line-clamp:\s*var\(--ingredienti-righe,\s*5\);/);
    assert.match(navigationStyle, /\.prodotto-btn strong\s*\{[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*normal;[^}]*hyphens:\s*none;/);
    assert.doesNotMatch(navigationStyle, /max-height:\s*140px/);
    assert.doesNotMatch(stile, /\.prodotto-btn \.ingredienti-wrapper\s*\{[^}]*overflow:\s*hidden;/);
    assert.match(pagina, /class="extra-dettagli__toolbar"[\s\S]*id="extra-dettagli-prodotto"[\s\S]*id="extra-ricerca"[\s\S]*id="extra-fatto"[^>]*>Fatto<\/button>/);
    assert.match(script, /function aggiornaPosizionePannelloExtra\(\)[\s\S]*?mediaPannelloExtra\.matches \? composerMain : sezioneExtra/);
    assert.match(script, /const altezzaBarraExtra = sezioneExtra\.getBoundingClientRect\(\)\.height;[\s\S]*?--extra-pannello-inset-bottom/);
    assert.match(script, /extraDettagliProdotto\.textContent = extraProdotto\.textContent/);
    assert.match(script, /extraFatto\.addEventListener\("click",[\s\S]*?chiudiPannelloExtra\(\)/);
    assert.match(script, /tabsCategorie\.addEventListener\("click", evento => \{[\s\S]*?chiudiPannelloExtra\(\);/);
    assert.match(stile, /@media \(min-width: 800px\)[\s\S]*?\.composer-main > \.extra-dettagli:not\(\[hidden\]\)\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*var\(--extra-pannello-inset-bottom,[^;]*;[^}]*min-height:\s*80%;[^}]*overflow-y:\s*auto;/);
    assert.match(stile, /@media \(min-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.composer-summary\s*\{[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*padding:\s*0 8px;/);
    assert.match(stile, /@media \(min-width: 800px\) and \(max-height: 560px\)[\s\S]*?\.composer-summary \.riepilogo-totale\s*\{[^}]*font-size:\s*clamp\(11px,\s*1\.6vw,\s*14px\);[^}]*white-space:\s*nowrap;/);
    assert.match(navigationStyle, /@media \(min-width: 1440px\)[\s\S]*?composer-main\.intestazione-chiusa\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
    assert.match(navigationStyle, /@media \(min-width: 1440px\)[\s\S]*?composer-main\.intestazione-chiusa > \.intestazione-compatta\s*\{[^}]*position:\s*static;[^}]*top:\s*auto;/);
    assert.match(navigationStyle, /@media \(min-width: 800px\) and \(max-width: 1439px\) and \(orientation: landscape\) and \(max-height: 820px\)[\s\S]*?composer-main\.intestazione-chiusa\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
    assert.match(stile, /@media \(min-width: 800px\) and \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?\.intestazione-compatta\s*\{[^}]*top:\s*0;[^}]*min-height:\s*40px;[^}]*height:\s*40px;/);
    assert.match(navigationStyle, /@media \(min-width: 1440px\)[\s\S]*?composer-main\.intestazione-chiusa > \.tab-container\s*\{[^}]*position:\s*static;[^}]*top:\s*auto;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-quantita\s*\{[^}]*top:\s*auto;[^}]*right:\s*4px;[^}]*bottom:\s*4px;[^}]*left:\s*auto;[^}]*width:\s*18px;[^}]*min-width:\s*18px;[^}]*height:\s*18px;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-btn\s*\{[^}]*padding:\s*8px 6px;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-btn \.prodotto-nome\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*600;[^}]*line-height:\s*1\.2;[^}]*letter-spacing:\s*-0\.2px;[^}]*text-overflow:\s*ellipsis;[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*normal;[^}]*-webkit-line-clamp:\s*2;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-btn\.ha-quantita \.prodotto-nome\s*\{[^}]*padding-left:\s*0;[^}]*padding-right:\s*0;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-btn \.prezzo-prodotto\s*\{[^}]*font-size:\s*14px;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-btn \.ingredienti\s*\{[^}]*font-size:\s*11\.5px;[^}]*-webkit-line-clamp:\s*2;/);
    assert.match(navigationStyle, /@media \(max-width: 600px\)[\s\S]*?\.prodotto-btn\.ha-quantita \.ingredienti\s*\{[^}]*padding-right:\s*20px;/);
});

test("university menu convention is counted before it is selected", () => {
    const script = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.js"),
        "utf8"
    );
    const start = script.indexOf("function anteprimaTotaliOrdine()");
    const end = script.indexOf("\nfunction ", start + 1);
    const preview = script.slice(start, end);
    const menuCount = preview.indexOf("const menuConvenzione = orderDiscountRules.calculateMenuConvention(menuItems);");

    assert.ok(start >= 0 && menuCount > 0);
    assert.ok(menuCount < preview.indexOf("if (convenzioneOrdine?.tipo === \"percentuale\")"));
    assert.match(script, /<p class="convenzione-titolo" id="convenzione-titolo">Convenzione universitaria<\/p>/);
    const page = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.html"),
        "utf8"
    );
    assert.doesNotMatch(page, /Sconto\/omaggio|Sconto sul totale/);
    assert.doesNotMatch(script, /Sconto\/omaggio|Sconto sul totale/);
});
