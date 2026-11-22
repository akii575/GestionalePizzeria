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

    assert.match(ordersPage, /setAttribute\("aria-label", "Chiudi suggerimento cliente"\)/);
    assert.match(ordersPage, /addEventListener\("click", \(\) => clientiAbituali\.chiudi\(container, numero\)\)/);
    assert.match(ordersPage, /if \(!clientiAbituali\.visibile\(numero, true\)\) return;/);
    assert.ok((ordersPage.match(/clientiAbituali\.reset\(\)/g) || []).length >= 2);
    assert.match(ordersStyles, /\.cliente-abituale-chiudi\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;[\s\S]*?border:\s*0;[\s\S]*?color:\s*#6B5A2A;/);
    assert.match(ordersStyles, /\.cliente-abituale-chiudi:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;/);
});
