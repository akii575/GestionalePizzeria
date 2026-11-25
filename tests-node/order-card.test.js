const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const orderCard = require("../src/main/resources/static/order-card");
const paymentUI = require("../src/main/resources/static/pagamento-ui");

function render(order, options = {}) {
    const previousWindow = global.window;
    global.window = { paymentUI };
    try {
        return orderCard.render({
            numero: 8,
            dataOra: "2026-10-27T18:30:00.000Z",
            totale: 31,
            righe: [{ prodotto: "Margherita", totale: 6 }],
            ...order
        }, { canEdit: true, ...options });
    } finally {
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
    }
}

function relativeLuminance(hex) {
    const channels = hex.match(/[0-9a-f]{2}/gi).map(channel => parseInt(channel, 16) / 255);
    const linear = channels.map(channel => channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

test("all order services use the same compact and expanded card structure", () => {
    const orders = [
        { tipo: "consegna", telefonoConsegna: "3331234567", indirizzoConsegna: "Via Roma 12" },
        { tipo: "ritiro", tavoloOCliente: "Anna Rossi", telefonoRitiro: "3331234567" },
        { tipo: "banco", cognomeBanco: "Rossi" },
        { tipo: "tavolo", tavoloOCliente: "Tavolo 4", numeroPersone: 3 }
    ];

    for (const order of orders) {
        const html = render(order);
        assert.match(html, /class="order-card"/);
        assert.match(html, /class="order-card__compact-row"/);
        assert.match(html, /class="order-card__details"/);
        assert.match(html, /class="order-card__actions(?: order-card__actions--table)?"/);
        const contactCount = order.tipo === "consegna" ? 2 : 0;
        assert.equal((html.match(/class="order-card__delivery-contact"/g) || []).length, contactCount);
        assert.doesNotMatch(html, /class="order-card__header"|class="order-card__number"|class="order-card__total"/);
        assert.doesNotMatch(html, /consegna--tutti-ordini|consegna-recapiti/);
        assert.equal((html.match(/data-modifica=/g) || []).length, 1);
        assert.equal((html.match(/data-ristampa=/g) || []).length, 1);
        assert.equal((html.match(/data-elimina=/g) || []).length, 1);
        assert.equal((html.match(/data-tavolo-chiuso=/g) || []).length, order.tipo === "tavolo" ? 1 : 0);
    }
});

test("closed table cards show their paid time, subdued total and reopen action", () => {
    const html = render({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 3",
        tavoloChiuso: true,
        chiusoAlle: "2026-10-27T18:41:00.000Z",
        totale: 31
    });

    assert.match(html, /order-card--closed/);
    assert.match(html, /order-card__compact-state--paid-table">pagato · 19:41/);
    assert.match(html, /order-card__compact-total--closed">31,00\s*€/);
    assert.match(html, /data-tavolo-chiuso="false"[^>]*>Riapri tavolo/);
});

test("table payment actions are not rendered without edit access", () => {
    const html = render({ tipo: "tavolo" }, { canEdit: false });
    assert.doesNotMatch(html, /data-tavolo-chiuso=/);
});

test("edit links keep their origin and open the shared order composer", () => {
    const previousWindow = global.window;
    try {
        for (const origin of ["gestionale", "consegne", "tavoli", "ritiri", "banco"]) {
            global.window = { paymentUI, location: { pathname: `/${origin}.html` } };
            const html = orderCard.render({
                numero: 12,
                righe: [{ prodotto: "Margherita", totale: 6 }]
            }, { canEdit: true });
            assert.match(html, new RegExp(`href="/ordini\\.html\\?modifica=12&amp;da=${origin}"`));
        }
    } finally {
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
    }
});

test("legacy edit path is referenced only by its redirect page", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    for (const file of fs.readdirSync(directory)) {
        if (file === "modifica.html" || !/\.(?:js|html|css)$/.test(file)) continue;
        assert.doesNotMatch(fs.readFileSync(path.join(directory, file), "utf8"), /\/modifica\.html/);
    }
    assert.match(fs.readFileSync(path.join(directory, "modifica.html"), "utf8"), /modifica-redirect\.js/);
});

test("expanded order details do not duplicate the compact name, number, or total", () => {
    const orders = [
        { tipo: "consegna", indirizzoConsegna: "Via Roma 12" },
        { tipo: "ritiro", tavoloOCliente: "Rossi" },
        { tipo: "banco", cognomeBanco: "Bianchi" },
        { tipo: "tavolo", tavoloOCliente: "Tavolo 1", numeroPersone: 1 }
    ];

    for (const order of orders) {
        const html = render(order);
        assert.match(html, /class="order-card__reference"/);
        assert.doesNotMatch(html, /class="order-card__header"|class="order-card__number"|class="order-card__total"|order-card__expanded-meta/);
    }
});

test("compact rows show the reference, order number, total, and print state", () => {
    const html = render({
        tipo: "tavolo",
        tavoloOCliente: "Tavolo 1",
        numeroPersone: 4,
        stampaCompletata: true
    });

    assert.match(html, /class="order-card__reference">Tavolo 1 · 4 persone<\/span>/);
    assert.match(html, /class="order-card__meta">#8 · 19:30 · Margherita<\/span>/);
    assert.match(html, /class="order-card__compact-total">31,00\s*€/);
    assert.match(html, /class="order-card__compact-state order-card__compact-state--printed">stampata<\/span>/);
    assert.match(html, /aria-expanded="false"/);
});

test("compact statuses use words and prioritize pending delivery printing", () => {
    const renderStatus = order => render({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma",
        ...order
    });
    assert.match(renderStatus({ statoPagamento: "non_pagato" }), /order-card__compact-state--not-printed">non stampata/);
    assert.match(renderStatus({ statoPagamento: "non_pagato", stampaCompletata: true }), /order-card__compact-state--unpaid">non pagato/);
    assert.match(renderStatus({ statoPagamento: "pagato" }), /order-card__compact-state--paid">pagato/);
    assert.match(renderStatus({ statoPagamento: "pos" }), /order-card__compact-state--pos">POS/);
    assert.match(render({ tipo: "tavolo", stampaInCoda: true }), /order-card__compact-state--queued">in coda/);
    assert.match(render({ tipo: "banco", stampaCompletata: true }), /order-card__compact-state--printed">stampata/);
});

test("table cards use singular and plural people labels", () => {
    assert.match(render({ tipo: "tavolo", tavoloOCliente: "Tavolo 2", numeroPersone: 1 }), /Tavolo 2 · 1 persona/);
    assert.match(render({ tipo: "tavolo", tavoloOCliente: "Tavolo 2", numeroPersone: 2 }), /Tavolo 2 · 2 persone/);
});

test("delivery status controls are separate, role-safe, and match the delivery state", () => {
    const pending = render({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        statoConsegna: "da_consegnare"
    }, { deliveryMode: true, isRider: true, canEdit: false });
    const inTransit = render({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        statoConsegna: "in_consegna"
    }, { deliveryMode: true, isRider: true, canEdit: false });
    const completed = render({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma 12",
        telefonoConsegna: "3331234567",
        statoConsegna: "consegnata",
        consegnataAlle: "2026-10-27T20:41:00.000Z"
    }, { deliveryMode: true, isRider: true, canEdit: false });

    assert.match(pending, /<span class="order-card__compact-status">[\s\S]*?<button[^>]*data-stato-consegna="in_consegna"[^>]*>Parti<\/button>/);
    assert.match(inTransit, /data-stato-consegna="consegnata"[^>]*>Consegnata<\/button>/);
    assert.match(completed, /order-card__delivery-status--consegnata[^>]*aria-label="Consegnata/);
    assert.match(completed, /<small>consegnata [^<]+<\/small>/);
    for (const html of [pending, inTransit, completed]) {
        assert.match(html, /order-card__delivery-action--call[^>]*>Chiama/);
        assert.match(html, /order-card__delivery-action--map[^>]*>Mappa/);
        assert.doesNotMatch(html, /data-modifica=|data-ristampa=|data-elimina=/);
    }
});

test("compact service tiles identify each order type", () => {
    for (const [type, reference] of [
        ["tavolo", "Tavolo 1"],
        ["banco", "Bianchi"],
        ["ritiro", "Rossi"],
        ["consegna", "Via Roma 12"]
    ]) {
        const html = render({
            tipo: type,
            tavoloOCliente: ["tavolo", "ritiro"].includes(type) ? reference : undefined,
            cognomeBanco: type === "banco" ? reference : undefined,
            indirizzoConsegna: type === "consegna" ? reference : undefined
        });

        assert.match(html, new RegExp(`class="order-card__service-tile order-card__service-tile--${type}"`));
        assert.match(html, new RegExp(`class="order-card__reference">[^<]*${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }

    assert.match(render({ tipo: "tavolo", tavoloOCliente: "Tavolo 2" }), /<strong>T2<\/strong><small>tavolo<\/small>/);
});

test("delivery and pickup compact metadata show requested time only in their tile", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );
    const delivery = render({
        tipo: "consegna",
        orario: "20:15",
        dataOra: "2026-10-27T18:30:00.000Z",
        indirizzoConsegna: "Via Roma"
    });
    const pickup = render({
        tipo: "ritiro",
        orario: "19:45",
        dataOra: "2026-10-27T18:30:00.000Z",
        tavoloOCliente: "Rossi"
    });
    const counter = render({
        tipo: "banco",
        dataOra: "2026-10-27T18:30:00.000Z",
        cognomeBanco: "Bianchi"
    });

    assert.match(delivery, /<small>20:15<\/small>[\s\S]*?class="order-card__meta">#8 · Margherita<\/span>/);
    assert.match(pickup, /<small>19:45<\/small>[\s\S]*?class="order-card__meta">#8 · Margherita<\/span>/);
    assert.match(counter, /class="order-card__service-tile order-card__service-tile--banco">[\s\S]*?<small>19:30<\/small>/);
    assert.match(counter, /class="order-card__meta">#8 · 19:30 · Margherita<\/span>/);
    assert.doesNotMatch(delivery, /class="order-card__service-tile[^"]*">[^<]*(?:consegna|ritiro|banco)</);
    assert.doesNotMatch(delivery, /visually-hidden">(?:consegna|ritiro|banco)/);
    assert.match(styles, /\.order-card__service-tile\s*\{[^}]*overflow:\s*hidden;[^}]*text-align:\s*center;/);
    assert.match(styles, /\.order-card__service-tile small\s*\{\s*font-size:\s*11px;/);
});

test("identical product rows group by product, extras, exclusions and notes", () => {
    const rows = [
        ...Array.from({ length: 4 }, () => ({ prodotto: "Margherita", totale: 5 })),
        { prodotto: "Margherita", totale: 5, extra: ["Olive"] },
        { prodotto: "Margherita", totale: 5, senza: ["Basilico"] },
        { prodotto: "Margherita", totale: 6 }
    ];
    const html = render({ righe: rows });
    const productRows = html.match(/<li>/g) || [];

    assert.equal(productRows.length, 3);
    assert.match(html, /<span class="order-card__product-quantity">5×<\/span>[\s\S]*?<strong>Margherita<\/strong>[\s\S]*?<span class="order-card__product-price">26,00\s*€/);
    assert.match(html, /\+ Olive/);
    assert.match(html, /senza Basilico/);
    assert.match(html, /<span class="order-card__product-price">5,00\s*€/);
    assert.doesNotMatch(html, /ingredienti/i);
});

test("compact rows open details as dialogs instead of expanding in the list", () => {
    const expansionState = orderCard.createExpansionState();
    const first = { tipo: "tavolo", tavoloOCliente: "Tavolo 1" };
    const second = { tipo: "tavolo", tavoloOCliente: "Tavolo 2", numero: 9 };

    expansionState.toggle(8);
    const firstMarkup = render(first, { expansionState });
    expansionState.toggle(9);
    const secondMarkup = render(second, { expansionState });

    for (const html of [firstMarkup, secondMarkup]) {
        assert.match(html, /class="order-card__toggle"[^>]*aria-expanded="false" aria-haspopup="dialog"/);
        assert.match(html, /class="order-card__expanded"[^>]* hidden>/);
        assert.doesNotMatch(html, /order-card--expanded/);
    }
});

test("closing and reopening an order keeps the card detail intact and complete", () => {
    class FakeElement {
        constructor() {
            this.listeners = new Map();
            this.attributes = new Map();
            this.children = [];
            this.parentNode = null;
            this.classList = {
                add() {},
                remove() {}
            };
        }

        addEventListener(type, listener) {
            this.listeners.set(type, listener);
        }

        dispatch(type, event = {}) {
            this.listeners.get(type)?.({ target: this, ...event });
        }

        append(element) {
            element.parentNode?.removeChild?.(element);
            element.parentNode = this;
            this.children.push(element);
        }

        replaceChildren(...elements) {
            for (const child of this.children) child.parentNode = null;
            this.children = [];
            elements.forEach(element => this.append(element));
        }

        removeChild(element) {
            this.children = this.children.filter(child => child !== element);
            element.parentNode = null;
        }

        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        }

        getAttribute(name) {
            return this.attributes.get(name) ?? null;
        }

        removeAttribute(name) {
            this.attributes.delete(name);
        }
    }

    class FakeExpanded extends FakeElement {
        constructor(markup) {
            super();
            this.innerHTML = markup;
            this.id = "order-detail-8";
            this.actionButtons = new FakeElement();
        }

        cloneNode() {
            const clone = new FakeExpanded(this.innerHTML);
            clone.id = this.id;
            return clone;
        }

        removeAttribute(name) {
            super.removeAttribute(name);
            if (name === "id") this.id = "";
        }

        querySelector(selector) {
            if (selector === ".order-card__actions") return this.actionButtons;
            return null;
        }
    }

    class FakeDialog extends FakeElement {
        set innerHTML(markup) {
            this.markup = markup;
            if (markup.includes("order-detail-dialog__content")) {
                this.selectors = new Map([
                    ["#order-detail-dialog-title", new FakeElement()],
                    [".order-detail-dialog__content", new FakeElement()],
                    [".order-detail-dialog__footer", new FakeElement()],
                    [".order-detail-dialog__close", new FakeElement()]
                ]);
            } else {
                this.selectors = new Map([[".app-ristampa-stato", new FakeElement()]]);
            }
        }

        querySelector(selector) {
            return this.selectors.get(selector) || null;
        }

        querySelectorAll() {
            return [];
        }

        showModal() {
            this.open = true;
        }

        close() {
            this.open = false;
            this.dispatch("close");
        }
    }

    const sourceMarkup = render({
        numero: 8,
        righe: [{ prodotto: "Capricciosa", totale: 12 }]
    });
    const expanded = new FakeExpanded(sourceMarkup);
    const article = new FakeElement();
    article.dataset = { orderNumber: "8" };
    const toggle = new FakeElement();
    toggle.dataset = { orderNumber: "8" };
    toggle.setAttribute("aria-expanded", "false");
    toggle.closest = selector => selector === ".order-card__toggle" ? toggle : selector === ".order-card" ? article : null;
    toggle.focus = () => {};
    toggle.isConnected = true;
    article.querySelector = selector => {
        if (selector === ".order-card__expanded") return expanded.parentNode === article ? expanded : null;
        if (selector === ".order-card__toggle") return toggle;
        if (selector === ".order-card__reference") return { textContent: "Tavolo 1" };
        return null;
    };
    expanded.parentNode = article;

    const container = new FakeElement();
    container.querySelectorAll = () => [article];
    container.contains = element => element === toggle;
    const body = new FakeElement();
    body.append = () => {};
    const previousDocument = global.document;
    const previousWindow = global.window;
    global.document = {
        body,
        activeElement: null,
        createElement: () => new FakeDialog()
    };
    global.window = {};

    try {
        const controller = orderCard.bindReprints(container);
        const clickToggle = () => container.dispatch("click", {
            target: { closest: selector => selector === ".order-card__toggle" ? toggle : null }
        });
        const detailDialog = controller.dialog;
        const detailContent = detailDialog.querySelector(".order-detail-dialog__content");

        clickToggle();
        assert.equal(detailDialog.open, true);
        assert.equal(article.querySelector(".order-card__expanded"), expanded);
        assert.match(detailContent.children[0].innerHTML, /Capricciosa/);
        assert.match(detailContent.children[0].innerHTML, /data-elimina="8"/);
        assert.equal(detailContent.children[0].id, "");
        detailDialog.querySelector(".order-detail-dialog__close").dispatch("click");

        clickToggle();
        assert.equal(detailDialog.open, true);
        assert.equal(article.querySelector(".order-card__expanded"), expanded);
        assert.match(detailContent.children[0].innerHTML, /Capricciosa/);
        assert.match(detailContent.children[0].innerHTML, /data-elimina="8"/);
    } finally {
        if (previousDocument === undefined) delete global.document;
        else global.document = previousDocument;
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
    }
});

test("the order detail dialog is modal, dismissible, responsive, and freezes page scrolling", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );
    const source = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "order-card.js"),
        "utf8"
    );

    assert.match(source, /order-detail-dialog__close" type="button" aria-label="Chiudi/);
    assert.match(source, /orderDialog\.showModal\(\)/);
    assert.match(source, /event\.target === orderDialog\) orderDialog\.close\(\)/);
    assert.match(source, /aria-haspopup="dialog"/);
    assert.match(source, /orderDialog\.addEventListener\("close"/);
    assert.match(styles, /\.order-detail-open\s*\{\s*overflow:\s*hidden;/);
    assert.match(styles, /\.order-detail-dialog\s*\{[^}]*width:\s*min\(560px/);
    assert.match(styles, /@media \(max-width: 680px\)[\s\S]*?\.order-detail-dialog\s*\{[^}]*inset:\s*auto 0 0;[^}]*width:\s*100%;[^}]*max-height:\s*90vh;[^}]*max-height:\s*90dvh;[^}]*border-radius:\s*22px 22px 0 0;/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.order-detail-dialog\[open\]\s*\{\s*animation:\s*none;/);
});

test("staff compact totals stay hidden only on pages that hide the daily total", () => {
    const previousWindow = global.window;
    global.window = { currentAccount: { staff: true }, paymentUI };
    try {
        const hidden = orderCard.render({
            numero: 8,
            tipo: "tavolo",
            tavoloOCliente: "Tavolo 1",
            totale: 31
        }, { hideTotalForStaff: true });
        const visible = orderCard.render({
            numero: 8,
            tipo: "consegna",
            indirizzoConsegna: "Via Roma 12",
            totale: 31
        }, { hideTotalForStaff: false });

        assert.match(hidden, /order-card__compact-total" data-hide-for-staff hidden>/);
        assert.match(visible, /order-card__compact-total">31,00\s*€/);
    } finally {
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
    }
});

test("date filter defaults to today and opens a selectable date", () => {
    const defaultInput = {
        value: "",
        addEventListener() {},
        setAttribute() {}
    };
    const defaultLabel = { textContent: "" };
    orderCard.bindDateFilter(defaultInput, {
        classList: { toggle() {} },
        querySelector() { return defaultLabel; },
        title: ""
    });
    const today = orderCard.currentServiceDate();
    assert.equal(defaultInput.value, today);
    assert.equal(defaultLabel.textContent, "Oggi");

    const listeners = new Map();
    const buttonAttributes = new Map();
    const input = {
        value: "2026-11-18",
        addEventListener(name, callback) { listeners.set(name, callback); },
        setAttribute(name, value) { buttonAttributes.set(name, value); }
    };
    const label = { textContent: "" };
    const button = {
        classList: { toggle(name, enabled) { this[name] = enabled; } },
        querySelector() { return label; },
        title: ""
    };

    orderCard.bindDateFilter(input, button);
    assert.equal(label.textContent, "18/11");
    assert.equal(button.classList.selezionata, true);
    assert.equal(buttonAttributes.get("aria-label"), "Data ordini, 18/11");

    input.value = "2026-11-19";
    listeners.get("change")();
    assert.equal(label.textContent, "19/11");
    assert.doesNotMatch(fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "order-card.js"),
        "utf8"
    ), /\.showPicker\(|input\.click\(/);
});

test("reprint controls are available only on editable order cards", () => {
    assert.match(render({ tipo: "tavolo" }), /data-ristampa="8"[^>]*>Ristampa/);
    assert.doesNotMatch(render({ tipo: "tavolo" }, { canEdit: false }), /data-ristampa=/);
});

test("order detail shows the automatic cover charge for table service", () => {
    const table = render({
        tipo: "tavolo",
        coperto: { persone: 4, prezzoUnitario: 2, totale: 8 },
        totale: 13
    });
    const counter = render({
        tipo: "banco",
        coperto: { persone: 4, prezzoUnitario: 2, totale: 8 }
    });

    assert.match(table, /class="order-card__cover-charge"><span>Coperto 4 × 2,00\s*€<\/span><strong>8,00\s*€<\/strong><\/p>/);
    assert.doesNotMatch(table, /class="order-card__total">13,00/);
    assert.doesNotMatch(counter, /order-card__cover-charge/);
});

test("product details show removals, extras and notes without ingredients", () => {
    const html = render({
        righe: [{
            prodotto: "Margherita",
            totale: 5,
            senza: ["Basilico"],
            extra: [{ nome: "Olive" }],
            note: ["Ben cotta"]
        }]
    });
    const styles = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/theme.css"),
        "utf8"
    );

    assert.match(html, /class="order-card__without-ingredients">senza Basilico<\/small>/);
    assert.match(html, /class="order-card__extra">\+ Olive<\/small>/);
    assert.match(html, /class="order-card__product-note">Ben cotta<\/small>/);
    assert.match(styles, /\.order-card__without-ingredients\s*\{[^}]*font-weight:\s*700;/);
    assert.match(styles, /\.order-card__product-note\s*\{[^}]*font-weight:\s*700;/);
    assert.match(styles, /\.order-card__extra\s*\{[^}]*font-weight:\s*400;/);
    assert.doesNotMatch(html, /Pomodoro|Basilico<\/small>[\s\S]*ingredienti/i);
});

test("only deliveries render the two icon-led contact rows", () => {
    const delivery = render({
        tipo: "consegna",
        telefonoConsegna: "3331234567",
        indirizzoConsegna: "Via Roma 12"
    });
    const pickup = render({
        tipo: "ritiro",
        tavoloOCliente: "Anna Rossi",
        telefonoRitiro: "3331234567"
    });
    const counter = render({ tipo: "banco", cognomeBanco: "Rossi" });
    const table = render({ tipo: "tavolo", tavoloOCliente: "Tavolo 4", numeroPersone: 3 });

    assert.match(delivery, /class="order-card__contacts"/);
    assert.equal((delivery.match(/class="order-card__delivery-contact"/g) || []).length, 2);
    assert.match(delivery, /order-card__delivery-action--call[^>]*>Chiama/);
    assert.match(delivery, /order-card__delivery-action--map[^>]*>Mappa/);
    assert.doesNotMatch(pickup, /order-card__contacts|order-card__delivery-contact/);
    assert.doesNotMatch(counter, /order-card__contacts|stato-pagamento/);
    assert.doesNotMatch(table, /order-card__contacts|stato-pagamento/);
});

test("expanded status shows only a pending print status and requested time", () => {
    const messages = [
        "Stampata",
        "Comanda aggiornata; la copia gia' stampata non e' stata ristampata."
    ];

    for (const message of messages) {
        const html = render({ tipo: "tavolo", messaggioStampa: message, stampaCompletata: true });
        assert.doesNotMatch(html, /order-card__print-status/);
    }
    const pending = render({ tipo: "tavolo", stampaInCoda: true });
    assert.match(pending, /class="order-card__detail-status"><span class="order-card__print-status order-card__print-status--queued">in coda<\/span><\/div>/);

    const delivery = render({
        tipo: "consegna",
        orario: "20:15",
        indirizzoConsegna: "Via Roma",
        stampaCompletata: false
    });
    assert.match(delivery, /Orario richiesto 20:15/);
    assert.match(delivery, /class="order-card__detail-status">[\s\S]*?stato-pagamento[\s\S]*?Orario richiesto 20:15[\s\S]*?non stampata/);
    assert.match(delivery, /order-card__compact-state--not-printed">non stampata/);
});

test("orders without print data show the text status in the compact row", () => {
    const html = render({ tipo: "tavolo", tavoloOCliente: "Tavolo 4", numeroPersone: 3 });
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );

    assert.match(html, /order-card__compact-state--not-printed">non stampata/);
    assert.match(html, /class="order-card__print-status order-card__print-status--not-printed">non stampata<\/span>/);
    assert.match(styles, /\.order-card__compact-state--not-printed,\s*\.order-card__compact-state--unpaid\s*\{[^}]*color:\s*#b91c1c;/);
});

test("delivery contact rows place icons and values before their secondary actions", () => {
    const html = render({
        tipo: "consegna",
        telefonoConsegna: "3331234567",
        indirizzoConsegna: "Via Roma 12, Napoli"
    });
    const theme = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );
    const deliveryStyles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "consegne.css"),
        "utf8"
    );

    assert.match(html, /order-card__delivery-icon[\s\S]*?order-card__delivery-value">3331234567<\/span><a class="order-card__delivery-action order-card__delivery-action--call" href="tel:3331234567">Chiama<\/a>/);
    assert.match(html, /order-card__delivery-icon[\s\S]*?order-card__delivery-value">Via Roma 12, Napoli<\/span><button class="order-card__delivery-action order-card__delivery-action--map"[^>]*data-indirizzo="Via Roma 12, Napoli"[^>]*>Mappa<\/button>/);
    assert.match(theme, /\.order-card__delivery-contact\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*20px minmax\(0,\s*1fr\) auto;/);
    assert.match(theme, /\.order-card__delivery-action\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px;[^}]*border:\s*1px solid #1a5ea9;[^}]*border-radius:\s*10px;[^}]*background:\s*#fff;[^}]*text-decoration:\s*none;/);
    assert.doesNotMatch(deliveryStyles, /\.order-card__delivery-action\s*\{/);
});

test("expanded product rows have a single top separator and align quantity beside the name", () => {
    const theme = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );
    const detailsStyles = theme.match(/html body\.app-shell main\.dashboard \.order-card__details\s*\{[^}]*\}/);
    const productRowStyles = theme.match(/\.order-card__product-row\s*\{[^}]*\}/);
    const quantityStyles = theme.match(/\.order-card__product-quantity\s*\{[^}]*\}/);

    assert.ok(detailsStyles);
    assert.doesNotMatch(detailsStyles[0], /dashed/);
    assert.match(theme, /\.order-card__products li:first-child\s*\{\s*border-top:\s*1px solid #eef0f2;/);
    assert.match(productRowStyles[0], /grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto;/);
    assert.match(productRowStyles[0], /gap:\s*8px;/);
    assert.match(quantityStyles[0], /justify-self:\s*end;/);
});

test("paid table action uses a high-contrast dark green while reopening stays secondary", () => {
    const theme = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );
    const paidRule = theme.match(/order-card__actions button\[data-tavolo-chiuso="true"\]\s*\{([^}]+)\}/);
    const reopenRule = theme.match(/order-card__actions button\[data-tavolo-chiuso="false"\]\s*\{([^}]+)\}/);

    assert.ok(paidRule);
    assert.match(paidRule[1], /background:\s*#1e7a4c;/);
    assert.match(paidRule[1], /color:\s*#fff;/);
    const contrast = 1.05 / (relativeLuminance("#1e7a4c") + 0.05);
    assert.ok(contrast >= 4.5, `white on #1e7a4c has contrast ${contrast.toFixed(2)}:1`);
    assert.ok(reopenRule);
    assert.match(reopenRule[1], /background:\s*#fff;/);
});

test("delivery surcharge is included in order details only when present", () => {
    const deliveryWithFee = render({
        tipo: "consegna",
        costoConsegna: 2,
        indirizzoConsegna: "Via Roma 12"
    });
    const deliveryWithoutFee = render({
        tipo: "consegna",
        costoConsegna: 0,
        indirizzoConsegna: "Via Roma 12"
    });

    assert.match(deliveryWithFee, /class="order-card__delivery-fee"><span>Costo consegna 2,00\s*€<\/span><strong>2,00\s*€<\/strong><\/p>/);
    assert.doesNotMatch(deliveryWithoutFee, /order-card__delivery-fee/);
});

test("delivery surcharge toggle is shared by new and edited orders", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const newOrderPage = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const theme = fs.readFileSync(path.join(directory, "theme.css"), "utf8");

    assert.match(newOrderPage, /<div id="campo-pagamento-consegna" class="riga-pagamento-consegna" hidden>[\s\S]*?id="pagamento-consegna"[\s\S]*?id="btn-costo-consegna"/);
    assert.match(newOrderPage, /id="pagamento-ritiro"/);
    assert.match(theme, /\.riga-pagamento-consegna\s*\{\s*display:\s*flex;[^}]*align-items:\s*flex-end;[^}]*justify-content:\s*space-between;[^}]*gap:\s*12px;/);
    assert.match(theme, /@media \(max-width: 720px\)[\s\S]*?\.riga-pagamento-consegna > \.btn-costo-consegna\s*\{[^}]*min-height:\s*44px;/);
    assert.match(theme, /@media \(max-width: 350px\)[\s\S]*?\.riga-pagamento-consegna \{ flex-wrap: wrap; \}/);
});

test("edit mode loads, updates, and cancels through the shared order composer", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const page = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");

    assert.match(script, /fetch\(`\/api\/ordini\/\$\{numeroModifica\}`\)/);
    assert.match(script, /method: "PUT"/);
    assert.match(script, /invia\.textContent = stato\.righe\.length\s*\? numeroModifica \? "Rivedi e salva"/);
    assert.match(script, /tipoOrdine\.value !== "consegna" && nuovoPagamento === "pos"/);
    assert.match(script, /annulla-modifica-continua/);
    assert.match(script, /window\.location\.replace\(paginaRitornoModifica\)/);
    assert.doesNotMatch(script, /window\.confirm/);
    assert.match(page, /id="annulla-modifica-modale"/);
});

test("every order-list page loads the shared card renderer before its page script", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    for (const [page, renderer] of [
        ["consegne.html", "consegne.js"],
        ["gestionale.html", "gestionale.js"],
        ["banco.html", "gestionale.js"],
        ["ritiri.html", "gestionale.js"],
        ["tavoli.html", "gestionale.js"]
    ]) {
        const html = fs.readFileSync(path.join(directory, page), "utf8");
        assert.ok(html.indexOf("/order-card.js") < html.indexOf(`/${renderer}`), `${page} must load the shared renderer first`);
    }
});

test("order-list pages use the calendar filter and have no auto-refresh checkbox", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    for (const pageName of ["tavoli.html", "ritiri.html", "banco.html", "gestionale.html", "consegne.html"]) {
        const page = fs.readFileSync(path.join(directory, pageName), "utf8");
        assert.match(page, /<input id="data" class="filtro-data__input" type="date"/, pageName);
        assert.match(page, /<span id="apri-data" class="filtro-data__button" aria-hidden="true">/, pageName);
        assert.doesNotMatch(page, /autoAggiorna|Aggiorna ogni 15 secondi/, pageName);
    }
    const styles = fs.readFileSync(path.join(directory, "gestionale.css"), "utf8");
    assert.match(styles, /\.filtro-data__input\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*opacity:\s*0;[^}]*font-size:\s*16px;/);
});

test("payment status is shown only for delivery and pickup orders", () => {
    const unpaid = render({
        tipo: "ritiro",
        statoPagamento: "non_pagato",
        tavoloOCliente: "Anna"
    });
    const pos = render({
        tipo: "consegna",
        statoPagamento: "pos",
        indirizzoConsegna: "Via Roma"
    });
    const counter = render({ tipo: "banco", cognomeBanco: "Rossi" });

    assert.match(unpaid, /class="stato-pagamento stato-pagamento--non-pagato"/);
    assert.match(pos, /class="stato-pagamento stato-pagamento--pos"/);
    assert.doesNotMatch(counter, /stato-pagamento/);
    assert.doesNotMatch(render({ tipo: "tavolo", tavoloOCliente: "Tavolo 2" }), /stato-pagamento/);
    assert.doesNotMatch(pos, /data-stato-pagamento/);
});

test("expanded order controls use a compact status row and three action columns", () => {
    const theme = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );

    assert.match(theme, /\.metriche\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(theme, /\.metriche div\s*\{[^}]*padding:\s*8px;[^}]*text-align:\s*center;/);
    assert.match(theme, /html body\.app-shell main\.dashboard \.order-card__actions\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+56px;/);
    assert.match(theme, /html body\.app-shell main\.dashboard \.order-card__actions button\[data-elimina\]\s*\{[^}]*width:\s*56px;[^}]*border-color:\s*var\(--theme-red\);[^}]*background:\s*#fff;/);
    assert.match(theme, /html body\.app-shell main\.dashboard \.order-card__actions a\[data-modifica\],[\s\S]*?background:\s*var\(--theme-green\);[^}]*color:\s*#fff;/);
    assert.match(theme, /button\.pericolo:not\(\.app-reset\):not\(\[data-elimina\]\)\s*\{/);
    assert.match(theme, /\.order-card__detail-status\s*\{\s*display:\s*flex;/);
    assert.match(theme, /\.order-card__product-row\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto;/);
    assert.match(theme, /\.dashboard > #stato\s*\{\s*min-height:\s*0;\s*margin:\s*0 0 6px;/);
});

test("requested service time appears beside payment without duplicate order metadata", () => {
    const html = render({
        tipo: "consegna",
        dataOra: "2026-10-26T11:54:10.000Z",
        orario: "22:47",
        indirizzoConsegna: "Via Roma",
        statoPagamento: "pos"
    });
    const status = html.match(/<div class="order-card__detail-status">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(status);
    assert.match(status, /stato-pagamento[\s\S]*?Orario richiesto 22:47/);
    assert.doesNotMatch(html, /order-card__expanded-meta|class="order-card__number"|class="order-card__total"/);
});

test("all order-list pages use the same source header and navigation shell", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const pages = ["tavoli.html", "ritiri.html", "banco.html", "consegne.html", "gestionale.html"];
    const navigation = fs.readFileSync(path.join(directory, "nav.js"), "utf8");

    for (const pageName of pages) {
        const page = fs.readFileSync(path.join(directory, pageName), "utf8");
        assert.match(page, /<header class="dashboard-header">\s*<div><h1>[^<]+<\/h1><\/div>\s*<nav[\s\S]*?id="aggiorna"/);
        assert.doesNotMatch(page, /dashboard-header--orders/);
    }
    assert.match(navigation, /header\.classList\.add\("app-page-header"\)/);
    assert.match(navigation, /actions\.append\(refreshButton\)/);
    assert.match(navigation, /header\.append\(actions\)/);
    assert.doesNotMatch(navigation, /sidebarActions\.append\(resetButton\)/);
    assert.match(navigation, /sheetLinks\.append\(resetCopy\)/);
});

test("wide desktop layouts use the space beside the sidebar", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");
    const listStyles = fs.readFileSync(path.join(directory, "gestionale.css"), "utf8");
    const homeStyles = fs.readFileSync(path.join(directory, "home.css"), "utf8");
    const orderStyles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");

    assert.match(navigation, /@media \(min-width: 1025px\)[\s\S]*?body\.app-shell main\.dashboard,\s*body\.app-shell main\.container,\s*body\.app-shell main\.home\s*\{[^}]*width: min\(1800px, calc\(100% - 260px\)\);[^}]*padding: 24px;/);
    assert.match(navigation, /@media \(min-width: 768px\) and \(max-width: 1024px\)[\s\S]*?body\.app-shell main\.dashboard,\s*body\.app-shell main\.container,\s*body\.app-shell main\.home\s*\{[^}]*width: calc\(100% - 112px\);[^}]*margin-left: 96px;[^}]*padding: 16px;/);
    assert.match(navigation, /@media \(min-width: 768px\) and \(max-width: 1024px\)[\s\S]*?main\.dashboard \.lista-ordini,\s*html body\.app-shell main\.dashboard \.lista-consegne\s*\{[^}]*minmax\(300px, 1fr\)/);
    assert.match(homeStyles, /width: min\(1800px, 100%\)/);
    assert.match(listStyles, /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 360px\), 1fr\)\);[^}]*align-items: stretch;[^}]*gap: 10px;/);
    assert.match(listStyles, /order-card--expanded\s*\{\s*grid-column: 1 \/ -1;/);
    assert.match(listStyles, /grid-template-columns: minmax\(0, 720px\) auto/);
    assert.match(listStyles, /main\.dashboard > #stato\s*\{\s*min-height: 0;\s*margin: 0;/);
    assert.match(navigation, /@media \(min-width: 1200px\)[\s\S]*?lista-ordini,\s*html body\.app-shell main\.dashboard \.lista-consegne\s*\{[^}]*grid-auto-flow:\s*dense;/);
    assert.match(navigation, /@media \(min-width: 1200px\)[\s\S]*?order-card--expanded\s*\{\s*grid-column:\s*span 2;/);
    assert.match(navigation, /body\.app-shell main\.dashboard \.metriche\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    assert.match(navigation, /body\.app-shell main\.dashboard \.metriche > div:last-child\s*\{[^}]*grid-column: auto;/);
    assert.match(navigation, /body\.app-shell main\.container \.composer-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 380px;/);
    assert.match(navigation, /@media \(min-width: 1180px\) and \(max-width: 1279px\)[\s\S]*?body\.app-shell main\.container \.composer-layout\s*\{[^}]*gap:\s*20px;/);
    assert.match(navigation, /@media \(min-width: 900px\)[\s\S]*?body\.app-shell main\.container \.composer-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 320px;/);
    assert.match(navigation, /body\.app-shell main\.container \.composer-summary\s*\{[^}]*position:\s*sticky;[^}]*height:\s*calc\(100% - 12px\);[^}]*max-height:\s*calc\(100% - 12px\);/);
    assert.match(navigation, /body\.app-shell main\.container \.composer-summary > \.riepilogo-card > \.riepilogo #riepilogo-items\s*\{[^}]*overflow-y:\s*auto;/);
    assert.match(navigation, /@media \(orientation: landscape\) and \(max-height: 820px\)[\s\S]*?body\.app-shell main\.container > \.app-page-header h1\s*\{[^}]*font-size:\s*20px;/);
    assert.match(navigation, /@media \(min-width: 900px\) and \(orientation: landscape\) and \(max-height: 820px\)[\s\S]*?height:\s*calc\(100dvh - 84px\);/);
    assert.match(navigation, /\.composer-main\s*\{[^}]*grid-template-rows:\s*max-content max-content minmax\(0, 1fr\) max-content;/);
    assert.match(navigation, /\.composer-main > \.intestazione-compatta\s*\{[^}]*flex-shrink:\s*0;[^}]*min-height:\s*48px;/);
    assert.match(navigation, /\.composer-main > \.tab-container\s*\{[^}]*flex-shrink:\s*0;[^}]*min-height:\s*max-content;/);
    assert.match(navigation, /\.composer-main > \.extra-section > \.extra-intestazione\s*\{[^}]*flex-shrink:\s*0;[^}]*min-height:\s*40px;/);
    assert.match(navigation, /main\.container \.composer-main > \.prodotti-wrapper > #prodotti\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;[^}]*scroll-snap-type:\s*x mandatory;/);
    assert.match(navigation, /\.composer-main\.intestazione-chiusa > \.prodotti-wrapper > #prodotti\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;[^}]*scroll-snap-type:\s*x mandatory;/);
    assert.match(navigation, /\.composer-main:not\(\.intestazione-chiusa\)\s*\{[^}]*overflow-y:\s*auto;[^}]*grid-template-rows:\s*max-content max-content minmax\(268px, 1fr\) max-content;/);
    assert.doesNotMatch(navigation, /grid-auto-columns:\s*calc\(\(100% - (?:24|32)px\) \/ [45]/);
    assert.doesNotMatch(navigation, /--prodotti-righe:\s*[45]/);
    assert.match(navigation, /\.pagina-prodotti,\s*\.ricerca-risultati \.pagina-prodotti\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*grid-template-rows:\s*repeat\(3,\s*minmax\(0,\s*var\(--prodotti-altezza-riga,\s*132px\)\)\);[^}]*grid-auto-flow:\s*row;[^}]*align-content:\s*start;/);
    assert.match(navigation, /:root\s*\{\s*--prodotti-altezza-massima:\s*132px;/);
    assert.match(navigation, /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{\s*:root\s*\{\s*--prodotti-altezza-massima:\s*150px;/);
    assert.match(navigation, /@media \(min-width: 1024px\)\s*\{\s*:root\s*\{\s*--prodotti-altezza-massima:\s*190px;/);
    const productPageRules = [...`${orderStyles}\n${navigation}`.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selector]) => selector.includes(".pagina-prodotti"));
    assert.ok(productPageRules.length > 0);
    productPageRules.forEach(([, selector, declarations]) => {
        assert.doesNotMatch(declarations, /grid-auto-flow\s*:\s*column/i, selector);
        const flow = declarations.match(/grid-auto-flow\s*:\s*([^;]+)/i);
        if (flow) assert.equal(flow[1].trim().toLowerCase(), "row", selector);
        const columns = declarations.match(/grid-template-columns\s*:\s*([^;]+)/i);
        if (columns) {
            assert.equal(
                columns[1].replace(/\s+/g, " ").trim().toLowerCase(),
                "repeat(3, minmax(0, 1fr))",
                selector
            );
        }
    });
    assert.match(navigation, /body\.orders-composer-page\.app-shell main\.container \.composer-main > \.prodotti-wrapper > #prodotti,\s*body\.orders-composer-page\.app-shell main\.container #ricerca-risultati\.griglia-prodotti\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;[^}]*scroll-snap-type:\s*x mandatory;[^}]*gap:\s*0;/);
    assert.match(navigation, /body\.orders-composer-page\.app-shell main\.container \.composer-main > \.prodotti-wrapper > #prodotti > \.pagina-prodotti,\s*body\.orders-composer-page\.app-shell main\.container #ricerca-risultati > \.pagina-prodotti\s*\{[^}]*flex:\s*0 0 100%;[^}]*scroll-snap-align:\s*start;/);
    assert.match(orderStyles, /\.griglia-prodotti\.is-dragging\s*\{[^}]*scroll-snap-type:\s*none;/);
    assert.match(navigation, /#ricerca-risultati \.prodotto-btn\s*\{[^}]*scroll-snap-align:\s*none;/);
    assert.match(orderStyles, /\.prodotto-btn \.prezzo-prodotto\s*\{[^}]*grid-row:\s*2;/);
    assert.match(navigation, /max-width: 767px[\s\S]*?\.prodotti-wrapper:not\(\.ricerca-risultati-wrapper\)\s*\{\s*height:\s*420px;/);
    const orderScript = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    assert.match(orderScript, /prodotti\.scrollLeft = 0;/);
    assert.match(orderScript, /const numeroPagine = Math\.ceil\(griglia\.querySelectorAll\("\.prodotto-btn"\)\.length \/ 9\)/);
    assert.match(orderScript, /Math\.abs\(spostamento\) < 5/);
    assert.match(orderScript, /griglia\.classList\.add\("is-dragging"\)[\s\S]*?ignoraClick = true;/);
    assert.match(orderScript, /creaBottoneProdotto\(prodotto\)[\s\S]*?bottone\.classList\.add\("ricerca-risultato"\)/);
    assert.match(orderScript, /renderPagineProdotti\(ricercaRisultati,\s*trovati/);
    assert.match(orderScript, /abilitaTrascinamentoOrizzontale\(ricercaRisultati\)/);
    assert.match(navigation, /@media \(min-width: 768px\) and \(max-width: 1024px\)/);
});

test("mobile list headers keep the title and actions on one line", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");
    const theme = fs.readFileSync(path.join(directory, "theme.css"), "utf8");

    assert.match(navigation, /body\.app-shell \.app-page-header\s*\{[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/);
    assert.match(navigation, /body\.app-shell \.app-page-header h1\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
    assert.match(navigation, /\.app-header-actions\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*margin-left:\s*auto;/);
    assert.match(navigation, /body\.app-shell \.app-page-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*width:\s*calc\(100% \+ var\(--app-mobile-gutter\) \+ var\(--app-mobile-gutter\)\);[^}]*margin:\s*0 var\(--app-mobile-gutter-negative\) 14px;/);
    assert.match(navigation, /body\.app-shell main\.home,\s*body\.app-shell main\.dashboard,\s*body\.app-shell main\.container\s*\{[^}]*padding-top:\s*0;/);
    assert.match(navigation, /body\.app-shell \.app-page-header \.app-header-actions\s*\{[^}]*min-width:\s*0;[^}]*margin-left:\s*auto;[^}]*justify-content:\s*flex-end;/);
    assert.match(theme, /@media \(max-width: 720px\)[\s\S]*?\.home\s*\{\s*padding:\s*0 16px 24px;/);
    assert.match(theme, /@media \(max-width: 420px\)[\s\S]*?\.home\s*\{\s*padding:\s*0 16px 24px;/);
    assert.match(theme, /\.dashboard-header:not\(\.app-page-header\)\s*\{[^}]*flex-wrap:\s*wrap;/);
    assert.match(theme, /\.dashboard-header:not\(\.app-page-header\) > div\s*\{[^}]*min-width:\s*min\(100%, 250px\);/);
});

test("mobile navigation and checkout use one safe-area offset", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");
    const navigationScript = fs.readFileSync(path.join(directory, "nav.js"), "utf8");
    const orderStyles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const orderScript = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const orderPage = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");

    assert.match(navigation, /--app-mobile-nav-content-height:\s*60px;[\s\S]*?--app-mobile-nav-height:\s*calc\(var\(--app-mobile-nav-content-height\) \+ env\(safe-area-inset-bottom\)\)/);
    assert.match(navigation, /html\.app-shell-root\s*\{\s*background:\s*var\(--theme-green\);/);
    assert.match(navigation, /body\.app-shell\s*\{\s*padding-bottom:\s*0;/);
    assert.match(navigation, /body\.app-shell nav\.app-bottom-nav\s*\{[^}]*height:\s*var\(--app-mobile-nav-height\);/);
    assert.match(navigation, /body\.app-shell nav\.app-bottom-nav > \.app-nav-item svg\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*padding:\s*5px;/);
    assert.match(navigation, /body\.app-shell nav\.app-bottom-nav > \.app-nav-item\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-end;[^}]*gap:\s*1px;/);
    assert.match(navigation, /body\.app-shell nav\.app-bottom-nav > \.app-bottom-create svg\s*\{[^}]*position:\s*static;[^}]*width:\s*56px;[^}]*height:\s*32px;[^}]*flex:\s*0 0 32px;[^}]*padding:\s*5px 17px;[^}]*border-radius:\s*16px;[^}]*background:\s*var\(--theme-gold\);[^}]*color:\s*var\(--theme-green-dark\);/);
    assert.match(navigation, /body\.app-shell nav\.app-bottom-nav > \.app-nav-item\.is-active\s*\{[^}]*color:\s*var\(--theme-green\);/);
    assert.doesNotMatch(navigation, /app-bottom-create svg\s*\{[^}]*top:\s*-33px;/);
    assert.match(navigationScript, /create = createLink\(\{ \.\.\.link, label: "Nuova" \}/);
    assert.match(navigationScript, /window\.location\.pathname === "\/ordini\.html"[\s\S]*?return "\/gestionale\.html"/);
    assert.match(orderStyles, /\.composer-summary > \.barra-conto\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*var\(--app-mobile-nav-height\);[^}]*height:\s*var\(--app-mobile-checkout-height\);/);
    assert.match(orderStyles, /\.composer-summary > \.barra-conto > \.btn-invia:disabled\s*\{[^}]*cursor:\s*not-allowed;[^}]*opacity:\s*\.45;/);
    assert.match(orderStyles, /@media \(max-width: 767px\), \(min-width: 768px\) and \(max-width: 1023px\) and \(orientation: portrait\)[\s\S]*?\.composer-layout\s*\{[^}]*display:\s*block;/);
    assert.match(orderStyles, /@media \(max-width: 1023px\) and \(orientation: portrait\)[\s\S]*?\.composer-summary > \.riepilogo-card\s*\{[^}]*display:\s*block;[^}]*border-radius:\s*16px;/);
    assert.match(orderStyles, /@media \(max-width: 767px\) and \(orientation: landscape\)[\s\S]*?\.composer-summary > \.riepilogo-card > \.riepilogo\s*\{\s*display:\s*none;/);
    assert.match(orderScript, /invia\.textContent = stato\.righe\.length\s*\? numeroModifica \? "Rivedi e salva" : "Rivedi e invia"/);
    assert.match(orderScript, /conferma-invio"\)\.textContent = numeroModifica\s*\? "Salva modifiche"/);
    assert.match(orderPage, /class="riepilogo-totale-riga">\s*<p id="riepilogo-conteggio" class="riepilogo-conteggio" aria-live="polite">0 prodotti<\/p>\s*<p id="riepilogo-totale" class="riepilogo-totale">[^<]*<\/p>/);
    assert.match(orderPage, /class="barra-conto-dettagli"[\s\S]*?<p id="barra-totale" class="riepilogo-totale">[^<]*<\/p>\s*<p id="barra-conteggio" class="riepilogo-conteggio" aria-live="polite">0 prodotti<\/p>/);
    assert.match(orderPage, /<button class="btn-invia" id="btn-invia" type="button" disabled>Aggiungi prodotti<\/button>/);
    assert.match(orderScript, /aggiornaConteggioProdotti\(riepilogoConteggio, stato\.righe\.length\);/);
    assert.match(orderScript, /barraTotale\.textContent = testoTotale;/);
    assert.match(orderScript, /aggiornaConteggioProdotti\(barraConteggio, stato\.righe\.length\);/);
    assert.doesNotMatch(orderStyles, /counter-reset:\s*order-items|counter-increment:\s*order-items|counter\(order-items\)/);
});

test("order summary rows are grouped with a compact one-item remove action", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const page = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");

    assert.match(page, /id="extra-intestazione" class="extra-intestazione" type="button" aria-expanded="false" aria-controls="extra-dettagli"/);
    assert.match(page, /id="extra-dettagli" class="extra-dettagli" hidden/);
    assert.match(styles, /\.riepilogo-item\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto 36px;[^}]*align-items:\s*baseline;[^}]*column-gap:\s*8px;[^}]*min-height:\s*44px;[^}]*padding:\s*8px;/);
    assert.match(styles, /\.riepilogo-quantita\s*\{[^}]*font-size:\s*14px;/);
    assert.match(styles, /\.riepilogo-item \.rimuovi\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*right:\s*8px;[^}]*width:\s*36px;[^}]*min-height:\s*36px;[^}]*background:\s*transparent;[^}]*font-size:\s*22px;/);
    assert.doesNotMatch(styles, /#riepilogo-items \.riepilogo-item\s*\{|#riepilogo-items \.rimuovi\s*\{/);
    assert.match(script, /const extra = nomiExtra\(riga\.extra\)\.join\(", "\);/);
    assert.match(script, /return `<div class="conferma-riga"><strong>\$\{quantitaTesto\}/);
    assert.match(styles, /\.conferma-righe\s*\{[^}]*overflow-y:\s*auto;/);
    assert.match(styles, /\.conferma-azioni\s*\{[^}]*flex:\s*0 0 auto;/);
    const aggiunta = script.match(/function aggiungiProdotto\(prodotto, origine = "ricerca"\) \{([\s\S]*?)\n\}/);
    assert.ok(aggiunta);
    assert.doesNotMatch(aggiunta[1], /scrollIntoView|\.focus\(/);
    assert.match(aggiunta[1], /origine === "griglia"\) aggiornaStatoIntestazione\("prodotto"\)/);
    assert.match(script, /if \(evento\.currentTarget === riepilogoSheetLista && riepilogoSheetAperto\)[\s\S]*?chiudiRiepilogoSheet\(false\)[\s\S]*?sezioneExtra\.scrollIntoView/);
    assert.match(page, /id="extra-ricerca" class="extra-ricerca" type="search" placeholder="Cerca extra/);
    assert.match(page, /id="extra-ricerca-vuota" class="extra-ricerca-vuota" role="status" hidden>Nessun extra trovato/);
});

test("desktop extra grid fills the panel and paginates dynamically", () => {
    const directory = path.join(__dirname, "../src/main/resources/static");
    const page = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");

    assert.match(page, /id="extra-lista-contenitore"[\s\S]*id="extra-lista"[\s\S]*id="extra-paginazione"[\s\S]*id="extra-pagina-precedente"[\s\S]*id="extra-pagina-indicatore"[\s\S]*id="extra-pagina-successiva"/);
    assert.match(styles, /\.extra-lista-contenitore\s*\{[^}]*display:\s*contents;/);
    assert.match(styles, /@media \(min-width: 800px\)[\s\S]*?\.extra-dettagli > \.extra-lista-contenitore\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;/);
    assert.match(styles, /\.extra-lista-contenitore \.griglia-extra\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;/);
    assert.match(styles, /#extra-lista \.pagina-extra\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(140px,\s*1fr\)\);[^}]*grid-template-rows:\s*repeat\(var\(--extra-righe,\s*1\),\s*64px\);/);
    assert.match(styles, /\.extra-lista-contenitore\.ha-altre-pagine::after\s*\{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/);
    assert.match(styles, /\.extra-paginazione button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    assert.match(navigation, /\.composer-layout\s*\{[^}]*height:\s*calc\(100dvh - 106px\)/);
    assert.match(styles, /\.composer-main > \.extra-dettagli:not\(\[hidden\]\)\s*\{[^}]*bottom:\s*var\(--extra-pannello-inset-bottom,\s*46px\)/);
    assert.match(script, /Math\.floor\(\(extraLista\.clientHeight \+ gap\) \/ \(altezzaCard \+ gap\)\)/);
    assert.match(script, /extraPaginaPrecedente\.disabled = pagina === 0;[\s\S]*extraPaginaSuccessiva\.disabled = pagina >= numeroPagine - 1;/);
    assert.match(script, /extraListaContenitore\.classList\.toggle\([\s\S]*?"ha-altre-pagine"/);
    assert.match(script, /extraLista\.addEventListener\("scroll", aggiornaPaginazioneExtra/);
    assert.match(script, /if \(mediaPannelloExtra\.matches\) \{\s*extraLista\.classList\.add\("is-dragging"\);\s*extraLista\.scrollLeft = 0;\s*extraLista\.classList\.remove\("is-dragging"\);\s*\}\s*renderGrigliaExtra\(\);/);

    const listHeightAt1280x800 = 800 - 106 - 46 - 22 - 44 - 36 - 36 - 44 - 4 * 8;
    assert.equal(Math.floor((listHeightAt1280x800 + 8) / (64 + 8)), 6);
});

test("portrait order summary sheet opens accessibly and removes rows through shared rendering", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const page = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);

    assert.equal(new Set(ids).size, ids.length);
    assert.match(page, /class="barra-conto-dettagli"[\s\S]*?role="button"[\s\S]*?aria-expanded="false"[\s\S]*?aria-controls="riepilogo-sheet"/);
    assert.match(page, /id="riepilogo-sheet"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="riepilogo-sheet-titolo"/);
    assert.match(page, /<h2 id="riepilogo-sheet-titolo">Riepilogo ordine<\/h2>/);
    assert.match(page, /class="riepilogo-totale-riga">\s*<p id="riepilogo-conteggio"[\s\S]*?<p id="riepilogo-totale"/);
    assert.match(page, /<footer class="riepilogo-sheet-footer">\s*<div class="riepilogo-totale-riga">\s*<p id="riepilogo-sheet-conteggio"[\s\S]*?<p id="riepilogo-sheet-totale"/);
    assert.match(styles, /\.riepilogo-totale-riga\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;[^}]*align-items:\s*baseline;[^}]*gap:\s*8px;[^}]*margin:\s*12px 0;/);
    assert.match(styles, /\.riepilogo-totale-riga \.riepilogo-totale\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(styles, /\.riepilogo-sheet-header h2\s*\{[^}]*outline:\s*none;/);
    assert.match(styles, /\.barra-conto,\s*\.barra-conto \*,\s*\.riepilogo-sheet,\s*\.riepilogo-sheet \*\s*\{[^}]*outline:\s*none;[^}]*-webkit-tap-highlight-color:\s*transparent;/);
    assert.match(styles, /\.riepilogo-sheet button:focus-visible\s*\{[^}]*outline:\s*2px solid #fff;[^}]*box-shadow:\s*0 0 0 4px #1A5EA9;/);
    assert.match(styles, /\.barra-conto-maniglia\s*\{[^}]*position:\s*absolute;[^}]*top:\s*6px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/);
    assert.match(styles, /\.barra-conto\s*\{[^}]*touch-action:\s*none;/);
    assert.match(styles, /\.riepilogo-sheet-header\s*\{[^}]*touch-action:\s*none;/);
    assert.match(styles, /@media \(max-width: 1023px\) and \(orientation: portrait\)[\s\S]*?\.riepilogo-sheet\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*85vh;[^}]*padding:\s*10px 16px 0;[^}]*border-radius:\s*20px 20px 0 0;/);
    assert.match(styles, /\.riepilogo-sheet-items\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/);
    assert.match(styles, /\.riepilogo-sheet-items\s*\{[^}]*flex:\s*0 1 auto;/);
    assert.match(styles, /\.riepilogo-sheet-footer\s*\{[^}]*padding:\s*10px 16px max\(12px, env\(safe-area-inset-bottom\)\);/);
    assert.match(styles, /\.riepilogo-sheet\s*\{[^}]*transition:\s*transform 280ms cubic-bezier\(\.2, \.9, \.3, 1\);/);
    assert.match(styles, /\.riepilogo-sheet-backdrop\s*\{[^}]*transition:\s*opacity 280ms cubic-bezier\(\.2, \.9, \.3, 1\);/);
    assert.match(styles, /\.riepilogo-sheet\s*\{[^}]*overscroll-behavior:\s*contain;/);
    assert.match(styles, /prefers-reduced-motion:\s*reduce/);
    assert.match(styles, /@media \(max-width: 1023px\) and \(orientation: portrait\) and \(prefers-reduced-motion: reduce\)/);
    assert.match(script, /matchMedia\("\(max-width: 1023px\) and \(orientation: portrait\)"\)/);
    assert.doesNotMatch(styles, /riepilogo-sheet(?:-backdrop)?\.is-dragging|body\.riepilogo-sheet-aperto/);
    assert.match(script, /renderRigheRiepilogo\(riepilogo\);\s*renderRigheRiepilogo\(riepilogoSheetLista\);/);
    assert.match(script, /riepilogoSheetLista\.addEventListener\("click", rimuoviRigaRiepilogo\)/);
    assert.match(script, /const indiceUltimaRiga = indici\[indici\.length - 1\];[\s\S]*?data-indice="\$\{escapeHtml\(indiceUltimaRiga\)\}" aria-label="Togli uno"/);
    assert.match(script, /function rimuoviRigaRiepilogo\(evento\)[\s\S]*?rimuoviProdotto\(stato\.righe, stato\.rigaAttiva, Number\(pulsante\.dataset\.indice\)\)[\s\S]*?renderRiepilogo\(\);/);
    assert.match(script, /raggruppaRigheConferma\(stato\.righe\)\.forEach\(\(\{ riga, quantita, indici \}\)/);
    assert.match(script, /<span class="riepilogo-quantita">\$\{quantita\}×<\/span>/);
    assert.match(script, /if \(!stato\.righe\.length\) contenitore\.innerHTML = "<p>Nessun prodotto selezionato<\/p>";/);
    assert.match(script, /barraConto\.addEventListener\("pointerdown", avviaTrascinamentoRiepilogo\)/);
    assert.match(script, /barraConto\.addEventListener\("pointercancel", terminaTrascinamentoRiepilogo\)/);
    assert.match(script, /barraConto\.addEventListener\("lostpointercapture", annullaTrascinamentoRiepilogo\)/);
    assert.match(script, /riepilogoSheetHeader\.addEventListener\("pointerdown", avviaTrascinamentoChiusuraSheet\)/);
    assert.match(script, /riepilogoSheetHeader\.addEventListener\("pointercancel", terminaTrascinamentoChiusuraSheet\)/);
    assert.match(script, /riepilogoSheetHeader\.addEventListener\("lostpointercapture", annullaTrascinamentoChiusuraSheet\)/);
    assert.match(script, /function impostaStatoSheet\(aperto\)[\s\S]*?window\.clearTimeout\(timerNascondiRiepilogoSheet\)[\s\S]*?document\.documentElement\.style\.overflow = "hidden"/);
    assert.match(script, /document\.documentElement\.style\.overflow = overflowRadicePrecedente/);
    assert.match(script, /distanza < -30 \|\| velocitaFinale < -0\.3 \|\| Math\.abs\(distanza\) < 8/);
    assert.match(script, /distanza > 30 \|\| velocitaFinale > 0\.3/);
    assert.doesNotMatch(script, /function impostaStatoSheet[\s\S]*?function apriConferma[\s\S]*?(?:\.inert|history\.|popstate|scrollTo|document\.body\.style\.position)/);
    assert.doesNotMatch(script, /frameTrascinamento|riepilogoSheetBackdrop\.style\.opacity|riepilogoSheet\.style\.transform/);
    assert.match(script, /riepilogoSheetApri\.focus\(\{ preventScroll: true \}\)/);
    assert.match(script, /riepilogoSheetChiudi\.focus\(\{ preventScroll: true \}\)/);
    assert.match(script, /riepilogoSheetChiudi\.addEventListener\("click", \(\) => chiudiRiepilogoSheet\(\)\)/);
    assert.doesNotMatch(script, /popstate|history\.pushState|history\.back|window\.scrollTo|document\.body\.style\.(?:position|top|width)/);
    assert.match(script, /mediaRiepilogoSheet\.addEventListener\("change", aggiornaSheetAlCambioViewport\)/);
    assert.match(script, /window\.addEventListener\("resize", aggiornaSheetAlCambioViewport\)/);
    assert.match(script, /window\.addEventListener\("orientationchange", aggiornaSheetAlCambioViewport\)/);
    assert.match(script, /riepilogoSheetAperto && !riepilogoSheetDisponibile\(\)\) chiudiRiepilogoSheet\(false\)/);
    assert.match(script, /document\.getElementById\("riepilogo-sheet-invia"\)\.addEventListener\("click", \(\) => \{\s*chiudiRiepilogoSheet\(\);\s*apriConferma\(\);/);
});

test("product names wrap only between words and clamp to two lines", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.css"),
        "utf8"
    );
    const regolaNomeProdotto = styles.match(/\.prodotto-btn strong\s*\{([^}]*)\}/);

    assert.ok(regolaNomeProdotto);
    assert.match(regolaNomeProdotto[1], /overflow-wrap:\s*normal;/);
    assert.match(regolaNomeProdotto[1], /word-break:\s*normal;/);
    assert.match(regolaNomeProdotto[1], /hyphens:\s*none;/);
    assert.match(regolaNomeProdotto[1], /-webkit-line-clamp:\s*2;/);
    assert.match(regolaNomeProdotto[1], /text-overflow:\s*ellipsis;/);
    assert.doesNotMatch(regolaNomeProdotto[1], /word-break:\s*break-(?:all|word)|hyphens:\s*auto/);
});

test("portrait tablet checkout avoids the sidebar and bottom navigation offsets", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.css"),
        "utf8"
    );
    const indiceTabletPortrait = styles.indexOf(
        "@media (min-width: 768px) and (max-width: 1023px) and (orientation: portrait)"
    );
    const fineRegoleTabletPortrait = styles.indexOf("\n@media", indiceTabletPortrait);

    assert.notEqual(indiceTabletPortrait, -1);
    assert.notEqual(fineRegoleTabletPortrait, -1);
    const regoleTabletPortrait = styles.slice(indiceTabletPortrait, fineRegoleTabletPortrait);
    assert.match(regoleTabletPortrait, /--app-mobile-checkout-height:\s*80px;/);
    assert.match(
        regoleTabletPortrait,
        /\.app-shell \.container\s*\{[^}]*padding-bottom:\s*calc\(var\(--app-mobile-checkout-height\) \+ env\(safe-area-inset-bottom\)\);/
    );
    assert.match(
        regoleTabletPortrait,
        /\.composer-summary > \.barra-conto\s*\{[^}]*right:\s*0;[^}]*bottom:\s*env\(safe-area-inset-bottom\);[^}]*left:\s*80px;/
    );
    assert.match(
        regoleTabletPortrait,
        /\.riepilogo-sheet-backdrop\s*\{[^}]*right:\s*0;[^}]*bottom:\s*env\(safe-area-inset-bottom\);[^}]*left:\s*80px;/
    );
});

test("table and people buttons use fixed heights and readable numbers", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "ordini.css"),
        "utf8"
    );

    assert.match(
        styles,
        /\.opzione-tavolo,\s*\.opzione-persone\s*\{[^}]*height:\s*48px;[^}]*min-height:\s*48px;[^}]*font-size:\s*18px;/
    );
    assert.match(
        styles,
        /@media \(min-width: 768px\)\s*\{[^}]*\.opzione-tavolo,\s*\.opzione-persone\s*\{[^}]*height:\s*52px;[^}]*min-height:\s*52px;/
    );
    assert.doesNotMatch(styles, /\.opzione-tavolo,\s*\.opzione-persone\s*\{[^}]*aspect-ratio:/);
});

test("mobile filters keep the date input inside its row and show the search full-width", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    assert.match(styles, /\.dashboard \.filtri\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(styles, /\.dashboard \.filtri > label:first-child\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
    assert.match(styles, /\.dashboard \.filtri input\[type="date"\]\s*\{[^}]*-webkit-appearance:\s*none;[^}]*appearance:\s*none;/);
    assert.match(styles, /\.dashboard \.filtri input\[type="search"\],[\s\S]*?\.dashboard \.filtri input\[type="date"\]\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*min-width:\s*0;/);
    assert.match(styles, /\.dashboard \.filtri \.switch\s*\{\s*grid-column:\s*2;/);
});

test("Civico7 logo is used in the sidebar and mobile header", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.js"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "nav.css"), "utf8");

    assert.match(navigation, /brandImage\.src = "\/icons\/logo-tondo-192\.png";/);
    assert.match(navigation, /brandImage\.alt = "Civico7 - Home";/);
    assert.match(navigation, /brandImage\.width = 96;[\s\S]*?brandImage\.height = 96;/);
    assert.match(navigation, /mobileBrand\.src = "\/icons\/logo-tondo-192\.png";/);
    assert.match(navigation, /mobileBrand\.width = 32;[\s\S]*?mobileBrand\.height = 32;/);
    assert.match(navigation, /if \(isHome && title\) title\.textContent = "Civico7"/);
    assert.match(styles, /@media \(min-width: 1025px\)[\s\S]*?\.app-brand\s*\{[^}]*width:\s*96px;[^}]*height:\s*96px;/);
    assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1024px\)[\s\S]*?\.app-sidebar \.app-brand\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.app-mobile-brand\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/);
});

test("shared card escapes field, product, extra and note content", () => {
    const html = render({
        tipo: "consegna",
        telefonoConsegna: "3331234567",
        indirizzoConsegna: "<script>alert(1)</script>",
        note: "<img src=x>",
        righe: [{
            prodotto: "<script>",
            totale: 7,
            extra: [{ nome: "<b>extra</b>" }]
        }]
    });

    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /<strong>&lt;script&gt;<\/strong>/);
    assert.match(html, /class="order-card__extra">\+ &lt;b&gt;extra&lt;\/b&gt;/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(html, /<script>|<img src=x>/);
});
