const test = require("node:test");
const assert = require("node:assert/strict");
const { preparaRipetizione } = require("../src/main/resources/static/prodotti-ui");

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
