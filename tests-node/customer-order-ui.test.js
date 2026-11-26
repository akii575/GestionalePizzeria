const test = require("node:test");
const assert = require("node:assert/strict");
const {
    creaGestoreSuggerimentiClienti,
    etichettaOrdiniCliente,
    preparaRipetizione
} = require("../src/main/resources/static/prodotti-ui");

test("repeating a customer order resolves current products and extras and respects the product limit", () => {
    const margherita = { nome: "Margherita", prezzo: 6, ammetteExtra: true, disponibile: true };
    const pizzaArchiviata = { nome: "Diavola", prezzo: 7, ammetteExtra: true, archiviato: true };
    const risultato = preparaRipetizione({
        righe: [
            { prodotto: "Margherita", quantita: 2, extra: ["Bufala"] },
            { prodotto: "Diavola", quantita: 1, extra: [] }
        ]
    }, [margherita, pizzaArchiviata], [{ nome: "Bufala", prezzo: 2, disponibile: true }], 1);

    assert.equal(risultato.righe.length, 1);
    assert.equal(risultato.righe[0].prodotto.prezzo, 6);
    assert.deepEqual(risultato.righe[0].extra.map(extra => extra.nome), ["Bufala"]);
    assert.deepEqual(risultato.nonDisponibili, ["Diavola"]);
    assert.equal(risultato.limiteRaggiunto, true);
});

test("repeating skips products and extras that are no longer available", () => {
    const risultato = preparaRipetizione({
        righe: [
            { prodotto: "Pizza esaurita", quantita: 1, extra: [] },
            { prodotto: "Margherita", quantita: 1, extra: ["Extra non disponibile"] }
        ]
    }, [
        { nome: "Pizza esaurita", disponibile: false },
        { nome: "Margherita", ammetteExtra: true, disponibile: true }
    ], [], 100);

    assert.deepEqual(risultato.righe, []);
    assert.deepEqual(risultato.nonDisponibili, ["Pizza esaurita", "Margherita"]);
    assert.equal(risultato.limiteRaggiunto, false);
});

test("closing a customer suggestion hides only its phone and preserves order fields", () => {
    const suggerimenti = creaGestoreSuggerimentiClienti();
    const riquadro = {
        hidden: false,
        svuotato: false,
        replaceChildren() {
            this.svuotato = true;
        }
    };
    const campiOrdine = { indirizzo: "Via Roma 1", nome: "Anna Rossi" };

    suggerimenti.chiudi(riquadro, "3331234567");

    assert.equal(riquadro.hidden, true);
    assert.equal(riquadro.svuotato, true);
    assert.deepEqual(campiOrdine, { indirizzo: "Via Roma 1", nome: "Anna Rossi" });
    assert.equal(suggerimenti.visibile("3331234567", true), false);
    assert.equal(suggerimenti.visibile("3337654321", true), true);

    suggerimenti.reset();

    assert.equal(suggerimenti.visibile("3331234567", true), true);
});

test("customer order count uses singular and plural labels", () => {
    assert.equal(etichettaOrdiniCliente(1), "1 ordine");
    assert.equal(etichettaOrdiniCliente(2), "2 ordini");
});

test("the customer suggestion close button is accessible and delegates dismissal", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const ordersPage = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/ordini.js"),
        "utf8"
    );
    const ordersStyles = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/ordini.css"),
        "utf8"
    );
    const ordersHtml = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/ordini.html"),
        "utf8"
    );

    assert.match(ordersPage, /setAttribute\("aria-label", "Chiudi suggerimento cliente"\)/);
    assert.match(ordersPage, /setAttribute\("aria-hidden", "true"\)/);
    assert.match(ordersPage, /addEventListener\("click", \(\) => clientiAbituali\.chiudi\(container, numero\)\)/);
    assert.match(ordersPage, /if \(!clientiAbituali\.visibile\(numero, true\)\) return;/);
    assert.ok((ordersPage.match(/clientiAbituali\.reset\(\)/g) || []).length >= 2);
    assert.match(ordersStyles, /\.cliente-abituale-chiudi\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;[\s\S]*?border:\s*0;[\s\S]*?color:\s*#6B7280;/);
    assert.match(ordersStyles, /\.cliente-abituale-chiudi:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;/);
    assert.match(ordersStyles, /\.cliente-abituale\s*\{[\s\S]*?border-left:\s*4px solid #E4B034;[\s\S]*?background:\s*#fff;/);
    assert.match(ordersStyles, /\.cliente-abituale-ripeti\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?background:\s*#1A5EA9;/);
    assert.match(ordersHtml, /class="clienti-indirizzo-intestazione">Clienti salvati<\/div>/);
    assert.match(ordersHtml, /id="clienti-indirizzo-lista"[\s\S]*?role="listbox"/);
});

test("address results use the selected customer without a phone lookup", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const ordersPage = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/ordini.js"),
        "utf8"
    );

    assert.match(ordersPage, /fetch\(`\/api\/clienti\?indirizzo=/);
    assert.match(ordersPage, /cacheClienti\.set\(telefono, Promise\.resolve\(clienteTrovato\)\)/);
    assert.match(ordersPage, /applicaClienteIndirizzo\([\s\S]*?mostraClienteAbituale\([\s\S]*?telefono,\s*true/);
    assert.match(ordersPage, /timerRicercaClientiIndirizzo = window\.setTimeout\([\s\S]*?300/);
});

test("guided university menu dialog offers pizza, drink, review, and cancellation steps", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const directory = path.join(__dirname, "../src/main/resources/static");
    const ordersPage = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const ordersHtml = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");

    assert.match(ordersHtml, /id="menu-convenzione-modale"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(ordersHtml, /id="menu-convenzione-pizza-step"[\s\S]*?Scegli la pizza/);
    assert.match(ordersHtml, /id="menu-convenzione-bibita-step"[\s\S]*?Scegli la bibita/);
    assert.match(ordersHtml, /id="menu-convenzione-indietro"[^>]*>Indietro/);
    assert.match(ordersHtml, /id="menu-convenzione-aggiungi"[^>]*>Aggiungi menu/);
    assert.match(ordersHtml, /id="menu-convenzione-annulla"[^>]*>Annulla/);
    assert.match(ordersPage, /calcolaMenuConvenzione|calculateExplicitMenuConvention/);
    assert.match(ordersPage, /Togli il 10% per usare i menu/);
    assert.match(ordersPage, /Togli i menu per usare il 10%/);
    assert.match(ordersPage, /data-convenzione="menu"[^`]*aria-haspopup="dialog"/);
    assert.match(ordersHtml, /id="menu-convenzione-riepilogo-testo"/);
    assert.match(ordersHtml, /id="menu-convenzione-riepilogo-prezzo-pieno"/);
    assert.match(ordersPage, /euro\.format\(orderDiscountRules\.CONVENZIONE_PREZZO_MENU\)/);
    assert.match(ordersPage, /prezzo pieno /);
    assert.match(ordersPage, /fullPriceCents > orderDiscountRules\.CONVENZIONE_PREZZO_MENU_CENTESIMI \? "del" : "span"/);
    assert.match(ordersPage, /menuPriceCents = orderDiscountRules\.CONVENZIONE_PREZZO_MENU_CENTESIMI/);
    assert.match(ordersPage, /availableMenus} menu · \$\{euro\.format\(orderDiscountRules\.CONVENZIONE_PREZZO_MENU \* availableMenus\)/);
    assert.match(ordersPage, /Menu convenzione \$\{preview\.menuConvenzione\.menu\} x/);
});
