const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const menu = require("../lib/menu.json");
const {
    normalizza,
    filtraProdotti,
    applicaClienteIndirizzo,
    isCoperto,
    calcolaCoperto,
    creaRiga,
    aggiungiProdotti,
    impostaRigaAttiva,
    rimuoviProdotto,
    toggleExtra,
    intestazioneExtra,
    LIMITE_RIGHE_ORDINE,
    creaStatoMoltiplicatore,
    premiTastoMoltiplicatore,
    quantitaDaApplicare,
    testoMoltiplicatore,
    aggiornaConteggioProdotti,
    controllaLimiteRighe,
    impostaValoreControllo,
    datiObbligatoriMancanti,
    datiOrdineCompleti,
    riepilogoIntestazione,
    anteprimaNota,
    aggiungiNotaRapida,
    togliNotaRapida,
    notaContiene
} = require("../src/main/resources/static/prodotti-ui");

const nomi = prodotti => prodotti.map(prodotto => prodotto.nome);

test("normalizes text ignoring case, accents and extra spaces", () => {
    assert.equal(normalizza("  Caffè  "), "caffe");
    assert.equal(normalizza("CROCCHÉ di   Patate"), "crocche di patate");
    assert.equal(normalizza(null), "");
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

test("order header summaries and note previews use the compact UI labels", () => {
    assert.equal(riepilogoIntestazione("tavolo", { tavolo: "Tavolo 3", numeroPersone: 4 }), "Tavolo 3 · 4 persone");
    assert.equal(
        riepilogoIntestazione("consegna", { indirizzo: "Via De Sanctis 7/F", orario: "20:30" }),
        "Consegna · Via De Sanctis 7/F · 20:30"
    );
    assert.equal(anteprimaNota("  Una   nota breve  "), "Una nota breve");
    assert.equal(anteprimaNota("12345678901234567890123456789012345678901"), "1234567890123456789012345678901234567890…");
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
    assert.match(script, /impostaValoreControllo\(tavolo, opzione\.value, "change"\)/);
    assert.match(script, /impostaValoreControllo\(numeroPersone, String\(persone\), "input"\)/);
    assert.match(script, /primoProdotto && datiOrdineCompleti\(tipoOrdine\.value, datiIntestazioneCorrenti\(\)\)/);
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

test("order entry and editing keep cover out of selectable product rows", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const orderScript = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const editScript = fs.readFileSync(path.join(directory, "modifica.js"), "utf8");

    assert.match(orderScript, /stato\.menu\.filter\(prodotto => !isCoperto\(prodotto\)\)/);
    assert.match(orderScript, /!isCoperto\(prodotto\) && prodotto\.categoria === stato\.categoria/);
    assert.match(editScript, /menu = menu\.filter\(prodotto => !isCoperto\(prodotto\)\)/);
    assert.match(orderScript, /numeroPersone\.addEventListener\("input", \(\) => \{[\s\S]*?renderRiepilogo\(\);/);
    assert.match(editScript, /document\.getElementById\("numero-persone"\)\.addEventListener\("input", aggiornaTotale\)/);
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
        extra: []
    });
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
