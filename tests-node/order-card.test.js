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

test("all order services use the same card structure and field styling", () => {
    const orders = [
        { tipo: "consegna", telefonoConsegna: "3331234567", indirizzoConsegna: "Via Roma 12" },
        { tipo: "ritiro", tavoloOCliente: "Anna Rossi", telefonoRitiro: "3331234567" },
        { tipo: "banco", cognomeBanco: "Rossi" },
        { tipo: "tavolo", tavoloOCliente: "Tavolo 4", numeroPersone: 3 }
    ];

    for (const order of orders) {
        const html = render(order);
        assert.match(html, /class="order-card"/);
        assert.match(html, /class="order-card__header"/);
        assert.match(html, /class="order-card__totals"/);
        assert.match(html, /class="order-card__details"/);
        assert.match(html, /class="order-card__actions"/);
        assert.equal((html.match(/class="order-card__field(?: |")/g) || []).length, order.tipo === "banco" ? 1 : 2);
        assert.doesNotMatch(html, /consegna--tutti-ordini|consegna-recapiti/);
        assert.equal((html.match(/data-modifica=/g) || []).length, 1);
        assert.equal((html.match(/data-ristampa=/g) || []).length, 1);
        assert.equal((html.match(/data-elimina=/g) || []).length, 1);
    }
});

test("reprint controls are available only on editable order cards", () => {
    assert.match(render({ tipo: "tavolo" }), /data-ristampa="8"[^>]*>Ristampa/);
    assert.doesNotMatch(render({ tipo: "tavolo" }, { canEdit: false }), /data-ristampa=/);
});

test("all order types share two-column fields and counter names span the row", () => {
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

    for (const html of [delivery, pickup, counter, table]) {
        assert.match(html, /class="order-card__fields"/);
        assert.doesNotMatch(html, /order-card__field--inline|order-card__fields--delivery/);
    }
    assert.match(counter, /class="order-card__field order-card__field--full"/);
    assert.match(pickup, /order-card__field-label">Nome<\/strong>\s*<div class="order-card__field-value">Anna Rossi<\/div>/);

    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );
    assert.match(styles, /\.order-card__fields\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*150px\),\s*1fr\)\)/);
    assert.match(styles, /\.order-card__field--full\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
    assert.doesNotMatch(styles, /order-card__field--inline|order-card__fields--delivery/);
});

test("print status is a full-width header row below title and totals", () => {
    const messages = [
        "Stampata",
        "Comanda aggiornata; la copia gia' stampata non e' stata ristampata."
    ];
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    for (const message of messages) {
        const html = render({ tipo: "tavolo", messaggioStampa: message, stampaCompletata: true });
        const headingEnd = html.indexOf("</div>", html.indexOf('class="order-card__heading"'));
        const statusPosition = html.indexOf('class="order-card__print-status');
        const datePosition = html.indexOf('class="order-card__date"');
        assert.ok(headingEnd >= 0 && headingEnd < statusPosition);
        assert.ok(statusPosition < datePosition);
        assert.ok(html.includes(message.replace(/'/g, "&#39;")));
    }

    assert.match(styles, /\.order-card__print-status\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*width:\s*100%;[^}]*padding:\s*8px 12px;[^}]*border-radius:\s*10px;[^}]*text-align:\s*left;[^}]*white-space:\s*normal;/);
    assert.match(styles, /\.dashboard \.order-card\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
    assert.match(styles, /\.dashboard \.order-card__actions\s*\{[^}]*margin-top:\s*auto;/);
    assert.match(styles, /\.dashboard \.lista-ordini,[\s\S]*?align-items:\s*stretch;/);
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

    assert.match(deliveryWithFee, /Costo consegna: 2,00\s*€/);
    assert.doesNotMatch(deliveryWithoutFee, /order-card__delivery-fee/);
});

test("delivery surcharge toggle is placed beside payment and adapts to narrow screens", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const newOrderPage = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const editOrderPage = fs.readFileSync(path.join(directory, "modifica.html"), "utf8");
    const theme = fs.readFileSync(path.join(directory, "theme.css"), "utf8");

    assert.match(newOrderPage, /<div id="campo-pagamento-consegna" class="riga-pagamento-consegna" hidden>[\s\S]*?id="pagamento-consegna"[\s\S]*?id="btn-costo-consegna"/);
    assert.match(editOrderPage, /<div id="campo-pagamento" class="riga-pagamento-consegna" hidden>[\s\S]*?id="stato-pagamento"[\s\S]*?id="btn-costo-consegna"/);
    assert.match(theme, /\.riga-pagamento-consegna\s*\{\s*display:\s*flex;[^}]*align-items:\s*flex-end;[^}]*justify-content:\s*space-between;[^}]*gap:\s*12px;/);
    assert.match(theme, /@media \(max-width: 720px\)[\s\S]*?\.riga-pagamento-consegna > \.btn-costo-consegna\s*\{[^}]*min-height:\s*44px;/);
    assert.match(theme, /@media \(max-width: 350px\)[\s\S]*?\.riga-pagamento-consegna \{ flex-wrap: wrap; \}/);
});

test("order edit allows changing POS payment status and clears it when switching to pickup", () => {
    const editScript = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "modifica.js"),
        "utf8"
    );

    assert.doesNotMatch(editScript, /posFisso|statoPagamento\.disabled\s*=|tipo-ordine"\)\.disabled\s*=/);
    assert.match(editScript, /tipo !== "consegna" && statoPagamento\.value === "pos"[\s\S]*?statoPagamento\.value = "non_pagato"/);
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

test("payment status remains in the shared header, including non-applicable services", () => {
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
    assert.match(counter, /stato-pagamento--non-applicabile/);
    for (const html of [unpaid, pos, counter]) {
        assert.ok(html.indexOf('class="order-card__totals"') < html.indexOf('class="order-card__total"'));
    }
    assert.doesNotMatch(pos, /data-stato-pagamento/);
});

test("mobile stats stay in three columns and order totals stay on the header row", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );
    const theme = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "theme.css"),
        "utf8"
    );

    assert.match(theme, /\.metriche\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(theme, /\.metriche div\s*\{[^}]*padding:\s*8px;[^}]*text-align:\s*center;/);
    assert.match(theme, /\.order-card__header\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;\s*align-items:\s*start;/);
    assert.match(theme, /\.order-card__header\s*>\s*\.order-card__heading\s*\{[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*normal;/);
    assert.match(theme, /\.order-card__totals\s*\{\s*grid-column:\s*2;\s*grid-row:\s*1;\s*flex-wrap:\s*nowrap;/);
    assert.match(theme, /\.order-card__totals \.stato-pagamento\s*\{\s*flex:\s*0 0 108px;\s*width:\s*108px;\s*min-width:\s*108px;/);
    assert.match(styles, /\.order-card__totals \.stato-pagamento\s*\{[^}]*flex:\s*0 0 136px;/);
    assert.doesNotMatch(styles, /flex-basis:\s*124px/);
    assert.match(theme, /\.dashboard > #stato\s*\{\s*min-height:\s*0;\s*margin:\s*0 0 6px;/);
});

test("order date and service time remain together on one full-width header line", () => {
    const html = render({
        tipo: "consegna",
        dataOra: "2026-10-26T11:54:10.000Z",
        orario: "22:47",
        statoPagamento: "pos"
    });
    const heading = html.match(/<div class="order-card__heading">([\s\S]*?)<\/div>/)?.[1];
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    assert.ok(heading);
    assert.doesNotMatch(heading, /order-card__date/);
    assert.match(html, /class="order-card__date">[^<]*\| Orario: 22:47<\/p>/);
    assert.match(styles, /\.order-card__date\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*white-space:\s*nowrap;/);
});

test("all-orders title has a green separator before its navigation", () => {
    const page = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.html"),
        "utf8"
    );
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    assert.match(page, /class="dashboard-header dashboard-header--orders"/);
    assert.match(styles, /\.dashboard-header\.dashboard-header--orders > div\s*\{[^}]*border-bottom:\s*4px solid var\(--verde\);/);
});

test("mobile list headers keep the title and actions on one line", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");

    assert.match(navigation, /body\.app-shell \.app-page-header\s*\{[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/);
    assert.match(navigation, /\.app-page-header h1\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
    assert.match(navigation, /\.app-header-actions\s*\{[^}]*flex-wrap:\s*nowrap;/);
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

test("Civico7 is the full brand outside the compact icon-only sidebar", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.js"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "nav.css"), "utf8");

    assert.match(navigation, /brand\.textContent\s*=\s*"Civico7"/);
    assert.match(navigation, /if \(isHome && title\) title\.textContent = "Civico7"/);
    assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1024px\)[\s\S]*?\.app-sidebar \.app-brand::after\s*\{[^}]*content:\s*"C7";/);
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
    assert.match(html, /&lt;script&gt; x1/);
    assert.match(html, /Extra: &lt;b&gt;extra&lt;\/b&gt;/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(html, /<script>|<img src=x>/);
});
