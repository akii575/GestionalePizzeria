const test = require("node:test");
const assert = require("node:assert/strict");
const paymentUI = require("../src/main/resources/static/pagamento-ui");

test("payment badges use one toggle control and POS is never clickable", () => {
    const unpaid = paymentUI.badgeMarkup({
        numero: 10,
        tipo: "ritiro",
        statoPagamento: "non_pagato"
    });
    const paid = paymentUI.badgeMarkup({
        numero: 11,
        tipo: "consegna",
        statoPagamento: "pagato"
    });
    const pos = paymentUI.badgeMarkup({
        numero: 12,
        tipo: "consegna",
        statoPagamento: "pos"
    });

    assert.match(unpaid, /stato-pagamento--non-pagato/);
    assert.match(unpaid, /data-stato-pagamento="pagato"/);
    assert.match(paid, /stato-pagamento--pagato/);
    assert.match(paid, /data-stato-pagamento="non_pagato"/);
    assert.match(pos, /stato-pagamento--pos/);
    assert.equal((unpaid.match(/<button/g) || []).length, 1);
    assert.equal((paid.match(/<button/g) || []).length, 1);
    assert.doesNotMatch(pos, /<button|data-stato-pagamento/);
});

test("unregistered legacy payment states require an explicit choice", () => {
    const badge = paymentUI.badgeMarkup({
        numero: 13,
        tipo: "ritiro",
        statoPagamento: null
    });

    assert.match(badge, /Da verificare/);
    assert.match(badge, /data-stato-pagamento="non_pagato"/);
    assert.equal((badge.match(/<button/g) || []).length, 1);
    assert.match(paymentUI.badgeMarkup({
        numero: 13,
        tipo: "ritiro",
        statoPagamento: null
    }, false), /Da verificare/);
    assert.doesNotMatch(paymentUI.badgeMarkup({
        numero: 13,
        tipo: "ritiro",
        statoPagamento: null
    }, false), /<button/);
});

test("status changes require confirmation in both directions", async () => {
    const fetchOriginale = global.fetch;
    const richieste = [];
    const messaggi = [];
    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        richieste.push({ url, body });
        return {
            ok: true,
            json: async () => ({ numero: 20, statoPagamento: body.statoPagamento })
        };
    };

    try {
        const nonPagato = await paymentUI.confermaAggiornamento(
            20,
            "non_pagato",
            messaggio => {
                messaggi.push(messaggio);
                return true;
            }
        );
        assert.equal(nonPagato.statoPagamento, "non_pagato");
        assert.match(messaggi[0], /non pagato/);

        const pagato = await paymentUI.confermaAggiornamento(
            20,
            "pagato",
            messaggio => {
                messaggi.push(messaggio);
                return true;
            }
        );
        assert.equal(pagato.statoPagamento, "pagato");
        assert.match(messaggi[1], /pagato/);

        const annullato = await paymentUI.confermaAggiornamento(20, "non_pagato", () => false);
        assert.equal(annullato, null);
        assert.equal(richieste.length, 2);
    } finally {
        global.fetch = fetchOriginale;
    }
});

test("payment binding uses an in-page confirmation and updates after acceptance", async () => {
    const previousDocument = global.document;
    const previousWindow = global.window;
    const previousFetch = global.fetch;
    const message = { textContent: "" };
    let closeHandler;
    let clickHandler;
    const dialog = {
        open: false,
        returnValue: "",
        querySelector() {
            return message;
        },
        addEventListener(type, handler) {
            if (type === "close") closeHandler = handler;
        },
        showModal() {
            this.open = true;
            queueMicrotask(() => {
                this.returnValue = "confirm";
                this.open = false;
                closeHandler();
            });
        }
    };
    const button = {
        dataset: { numero: "21", statoPagamento: "pagato" },
        disabled: false,
        closest(selector) {
            return selector === "[data-stato-pagamento]" ? this : null;
        }
    };
    const ordineAggiornato = { numero: 21, statoPagamento: "pagato" };
    let ordineRicevuto;

    global.document = {
        getElementById() {
            return dialog;
        }
    };
    global.window = {
        confirm() {
            assert.fail("The native browser confirmation must not be used.");
        }
    };
    global.fetch = async (url, options) => ({
        ok: true,
        json: async () => {
            assert.equal(url, "/api/ordini/21");
            assert.equal(options.method, "PATCH");
            assert.deepEqual(JSON.parse(options.body), { statoPagamento: "pagato" });
            return ordineAggiornato;
        }
    });

    try {
        paymentUI.bind({
            addEventListener(type, handler) {
                if (type === "click") clickHandler = handler;
            }
        }, {
            canEdit: () => true,
            onUpdated: ordine => { ordineRicevuto = ordine; },
            onError: error => { throw error; }
        });

        await clickHandler({ target: button });

        assert.equal(message.textContent, "Confermi di voler segnare l'ordine come pagato?");
        assert.equal(button.disabled, true);
        assert.equal(ordineRicevuto, ordineAggiornato);
    } finally {
        if (previousDocument === undefined) delete global.document;
        else global.document = previousDocument;
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
        global.fetch = previousFetch;
    }
});
