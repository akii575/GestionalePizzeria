const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    fasciaConsegna,
    fasciaCorrente,
    totaliFascia,
    preparaSezioniFascia
} = require("../src/main/resources/static/consegne-ui");

const staticDirectory = path.join(__dirname, "..", "src", "main", "resources", "static");

test("delivery bands use requested time and fall back to Rome creation time across DST", () => {
    assert.equal(fasciaConsegna({ orario: "15:59" }), "mattina");
    assert.equal(fasciaConsegna({ orario: "16:00" }), "sera");
    assert.equal(fasciaConsegna({ orario: "00:30" }), "sera");
    assert.equal(fasciaConsegna({ orario: "05:00" }), "mattina");
    assert.equal(fasciaConsegna({ dataOra: "2026-07-01T14:30:00.000Z" }), "sera");
    assert.equal(fasciaConsegna({ dataOra: "2026-07-01T13:59:00.000Z" }), "mattina");
    assert.equal(fasciaConsegna({ orario: "15:59", dataOra: "2026-07-01T14:30:00.000Z" }), "mattina");
});

test("current delivery band follows Europe/Rome daylight-saving time", () => {
    assert.equal(fasciaCorrente(new Date("2026-07-01T14:30:00.000Z")), "sera");
    assert.equal(fasciaCorrente(new Date("2026-07-01T13:59:00.000Z")), "mattina");
});

test("delivery totals sum integer cents by payment state and include completed orders", () => {
    const orders = [
        { orario: "15:00", totale: 10.1, statoPagamento: "pos" },
        { orario: "15:30", totale: 0.2, statoPagamento: "pagato" },
        { orario: "15:45", totale: 0.3, statoPagamento: "non_pagato" },
        { orario: "15:50", totale: 1.005, statoConsegna: "consegnata" },
        { orario: "20:00", totale: 0.1, statoPagamento: "pos", statoConsegna: "consegnata" },
        { orario: "20:30", totale: 2, statoPagamento: "in_attesa" }
    ];

    assert.deepEqual(totaliFascia(orders), {
        mattina: {
            consegne: 4,
            totaleCentesimi: 1161,
            pos: { consegne: 1, totaleCentesimi: 1010 },
            pagato: { consegne: 1, totaleCentesimi: 20 },
            nonPagato: { consegne: 1, totaleCentesimi: 30 },
            daVerificare: { consegne: 1, totaleCentesimi: 101 }
        },
        sera: {
            consegne: 2,
            totaleCentesimi: 210,
            pos: { consegne: 1, totaleCentesimi: 10 },
            pagato: { consegne: 0, totaleCentesimi: 0 },
            nonPagato: { consegne: 0, totaleCentesimi: 0 },
            daVerificare: { consegne: 1, totaleCentesimi: 200 }
        }
    });
});

test("only nonempty delivery bands render, default open state follows the selected day and user choices persist", () => {
    const orders = [
        { numero: 1, orario: "15:59" },
        { numero: 2, orario: "16:00" }
    ];
    const currentDay = "2026-11-25";
    const options = {
        dataSelezionata: currentDay,
        dataCorrente: currentDay,
        fasciaCorrente: fasciaCorrente(new Date("2026-11-25T18:00:00.000Z"))
    };
    const firstRender = preparaSezioniFascia(orders, new Map(), options);
    assert.deepEqual(firstRender.map(({ fascia, open }) => [fascia, open]), [
        ["mattina", false],
        ["sera", true]
    ]);

    const choices = new Map([["mattina", true], ["sera", false]]);
    const nextRender = preparaSezioniFascia(orders, choices, options);
    assert.deepEqual(nextRender.map(({ fascia, open }) => [fascia, open]), [
        ["mattina", true],
        ["sera", false]
    ]);

    const pastDay = preparaSezioniFascia(orders, new Map(), {
        ...options,
        dataSelezionata: "2026-11-24"
    });
    assert.deepEqual(pastDay.map(section => section.open), [true, true]);
    assert.deepEqual(preparaSezioniFascia([], new Map(), options), []);
    assert.deepEqual(
        preparaSezioniFascia([{ orario: "20:00" }], new Map(), options).map(section => section.fascia),
        ["sera"]
    );
});

test("delivery page loads the local grouping utility and shows compact responsive totals", () => {
    const html = fs.readFileSync(path.join(staticDirectory, "consegne.html"), "utf8");
    const styles = fs.readFileSync(path.join(staticDirectory, "consegne.css"), "utf8");
    const script = fs.readFileSync(path.join(staticDirectory, "consegne.js"), "utf8");

    assert.ok(html.indexOf('<script src="/consegne-ui.js"></script>') < html.indexOf('<script src="/consegne.js"></script>'));
    assert.match(script, /^const CONSEGNE_INIZIO_SERA = "16:00";/);
    assert.match(script, /stato\.aperturaFasce\.set\(sezione\.dataset\.fascia,\s*sezione\.open\)/);
    assert.match(script, /sezione\.addEventListener\("toggle", \(\) => \{\s*stato\.aperturaFasce\.set/);
    assert.match(styles, /\.consegne-fascia__pagamenti\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.consegne-fascia__pagamenti\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(styles, /\.consegne-fascia__totale--contanti/);
});
