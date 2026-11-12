const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const menu = require("../lib/menu.json");
const {
    normalizza,
    filtraProdotti,
    creaRiga,
    CATEGORIE_CON_EXTRA,
    LIMITE_RIGHE_ORDINE,
    creaStatoMoltiplicatore,
    premiTastoMoltiplicatore,
    quantitaDaApplicare,
    testoMoltiplicatore,
    aggiornaConteggioProdotti,
    controllaLimiteRighe
} = require("../src/main/resources/static/prodotti-ui");

const nomi = prodotti => prodotti.map(prodotto => prodotto.nome);

test("normalizes text ignoring case, accents and extra spaces", () => {
    assert.equal(normalizza("  Caffè  "), "caffe");
    assert.equal(normalizza("CROCCHÉ di   Patate"), "crocche di patate");
    assert.equal(normalizza(null), "");
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

test("count label updates to plural after adding three products", () => {
    const conteggio = { textContent: "0 prodotti" };
    const righe = [];
    righe.push({}, {}, {});

    aggiornaConteggioProdotti(conteggio, righe.length);

    assert.equal(conteggio.textContent, "3 prodotti");
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

test("pending extras are applied to products whose category allows them", () => {
    const extra = [{ id: "bocconcino", nome: "Bocconcino", prezzo: 2 }];
    const pizza = { nome: "Margherita", categoria: "pizze", prezzo: 5, ingredienti: ["pomodoro"] };
    const { riga, extraRimanenti } = creaRiga(pizza, extra);

    assert.deepEqual(riga, {
        prodotto: "Margherita",
        prezzo: 5,
        categoria: "pizze",
        ingredienti: ["pomodoro"],
        extra
    });
    assert.deepEqual(extraRimanenti, []);
});

test("pending extras are kept for the next dish when the product does not allow extras", () => {
    const extra = [{ id: "bocconcino", nome: "Bocconcino", prezzo: 2 }];
    const bibita = { nome: "Coca Cola 33cl", categoria: "bibite", prezzo: 2.5 };
    const { riga, extraRimanenti } = creaRiga(bibita, extra);

    assert.deepEqual(riga.extra, []);
    assert.deepEqual(riga.ingredienti, []);
    assert.deepEqual(extraRimanenti, extra);
});

test("missing pending extras and ingredients are treated as empty lists", () => {
    const { riga, extraRimanenti } = creaRiga({ nome: "Calzone", categoria: "ripieni", prezzo: 7 }, undefined);
    assert.deepEqual(riga.extra, []);
    assert.deepEqual(riga.ingredienti, []);
    assert.deepEqual(extraRimanenti, []);
    assert.deepEqual(creaRiga({ nome: "Acqua", categoria: "bibite", prezzo: 1 }, null).extraRimanenti, []);
});

test("client extra categories match the server validation", () => {
    const sorgenteServer = fs.readFileSync(path.join(__dirname, "..", "lib", "orders.js"), "utf8");
    const elenco = sorgenteServer.match(/categoriesWithExtras = new Set\(\[([^\]]+)\]\)/)[1];
    const categorieServer = elenco.match(/"([^"]+)"/g).map(voce => voce.slice(1, -1));
    assert.deepEqual([...CATEGORIE_CON_EXTRA].sort(), categorieServer.sort());
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
