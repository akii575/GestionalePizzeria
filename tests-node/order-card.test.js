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

test("order heading shows only the service name and number without truncation", () => {
    const orders = [
        { tipo: "consegna", title: "Consegna #8" },
        { tipo: "ritiro", title: "Ritiro #8" },
        { tipo: "banco", title: "Banco #8" },
        { tipo: "tavolo", title: "Tavolo #8" }
    ];
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    for (const order of orders) {
        const html = render(order);
        assert.match(html, new RegExp(`<h2 class="order-card__number">${order.title}<\\/h2>`));
        assert.doesNotMatch(html, /order-card__title|Dettagli (consegna|ritiro|banco|tavolo)/);
    }

    assert.match(styles, /\.order-card__number\s*\{[^}]*font-size:\s*18px;[^}]*font-weight:\s*600;[^}]*white-space:\s*nowrap;/);
    assert.doesNotMatch(styles, /\.order-card__number\s*\{[^}]*text-overflow:\s*ellipsis/);
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

test("print status occupies its own row after the header and retains its full title", () => {
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
        const headerEnd = html.indexOf("</header>");
        const datePosition = html.indexOf('class="order-card__date"');
        assert.ok(headingEnd >= 0 && headingEnd < statusPosition);
        assert.ok(headerEnd < statusPosition);
        assert.ok(statusPosition < datePosition);
        assert.ok(html.includes(message.replace(/'/g, "&#39;")));
        assert.ok(html.includes(`title="${message.replace(/'/g, "&#39;")}"`));
    }

    assert.match(styles, /\.order-card__print-status\s*\{[^}]*margin:\s*0 14px;[^}]*padding:\s*8px 12px;[^}]*border-radius:\s*10px;[^}]*text-align:\s*left;[^}]*white-space:\s*normal;/);
    assert.match(styles, /\.dashboard \.order-card\s*\{[^}]*display:\s*grid;/);
    assert.match(styles, /\.dashboard \.order-card__actions\s*\{[^}]*margin-top:\s*auto;/);
    assert.match(styles, /\.dashboard \.lista-ordini,[\s\S]*?align-items:\s*stretch;/);
    assert.match(styles, /\.dashboard \.order-card__print-status:not\(\.order-card__print-status--empty\)\s*\{[^}]*max-height:\s*calc\(2 \* 1\.25em \+ 16px\);[^}]*-webkit-line-clamp:\s*2;/);
    assert.ok(
        styles.indexOf(".dashboard .order-card__print-status:not(.order-card__print-status--empty)") <
        styles.indexOf("@media (min-width: 768px)")
    );
    assert.match(styles, /\.order-card__print-status--empty\s*\{[^}]*height:\s*0;[^}]*visibility:\s*hidden;/);
    assert.match(styles, /grid-template-rows:\s*subgrid;/);
    const fallbackStart = styles.indexOf("@supports not (grid-template-rows: subgrid)");
    assert.ok(fallbackStart >= 0);
    const fallbackStyles = styles.slice(fallbackStart);
    assert.match(fallbackStyles, /grid-template-rows:\s*minmax\(74px,\s*auto\)[\s\S]*?minmax\(122px,\s*auto\);/);
    assert.match(fallbackStyles, /\.dashboard \.order-card__header \{ min-height:\s*74px; \}/);
    assert.match(fallbackStyles, /\.dashboard \.order-card__print-status \{ min-height:\s*46px;/);
    assert.match(fallbackStyles, /\.dashboard \.order-card__date \{ min-height:\s*36px; \}/);
    assert.match(fallbackStyles, /\.dashboard \.order-card__field \{ min-height:\s*90px; \}/);
    assert.doesNotMatch(styles.slice(0, fallbackStart), /min-height:\s*(?:74|46|36|110|90|66|122)px/);
    assert.match(styles, /\.dashboard \.order-card\s*\{[^}]*row-gap:\s*8px;/);
    assert.match(styles, /\.dashboard \.lista-ordini,[\s\S]*?gap:\s*16px;/);
});

test("orders without a print status reserve desktop alignment space but not mobile space", () => {
    const html = render({ tipo: "tavolo", tavoloOCliente: "Tavolo 4", numeroPersone: 3 });
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    assert.match(html, /class="order-card__print-status order-card__print-status--empty" aria-hidden="true"/);
    assert.match(styles, /\.order-card__print-status--empty\s*\{[^}]*height:\s*0;[^}]*visibility:\s*hidden;/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.dashboard \.order-card__print-status--empty \{ display:\s*none;/);
});

test("delivery map action stays beside the address within equal-height fields", () => {
    const html = render({
        tipo: "consegna",
        indirizzoConsegna: "Via Roma 12, Napoli"
    });
    const styles = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "resources", "static", "gestionale.css"),
        "utf8"
    );

    assert.match(html, /<span title="Via Roma 12, Napoli">Via Roma 12, Napoli<\/span><span class="order-card__field-hint">Apri nelle mappe<\/span>/);
    assert.match(styles, /\.dashboard \.order-card__field \{\s*padding:\s*8px 10px;/);
    assert.match(styles, /\.order-card__field-action \{ display:\s*grid;[^}]*justify-items:\s*start;/);
    assert.match(styles, /\.order-card__field-hint \{[^}]*font-size:\s*12px;/);
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
    assert.match(styles, /\.order-card__totals \.stato-pagamento\s*\{[^}]*flex:\s*0 0 108px;/);
    assert.doesNotMatch(styles, /flex-basis:\s*124px/);
    assert.match(theme, /\.dashboard > #stato\s*\{\s*min-height:\s*0;\s*margin:\s*0 0 6px;/);
});

test("order date and service time remain together in their shared aligned row", () => {
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
    assert.match(styles, /\.order-card__date\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(styles, /\.dashboard \.order-card__date \{\s*padding:\s*0 14px;/);
    assert.match(styles.slice(styles.indexOf("@supports not (grid-template-rows: subgrid)"), -1), /\.dashboard \.order-card__date \{ min-height:\s*36px; \}/);
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
    assert.match(navigation, /sidebarActions\.append\(resetButton\)/);
});

test("wide desktop layouts use the space beside the sidebar", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");
    const orderStyles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");

    assert.match(navigation, /@media \(min-width: 1440px\)[\s\S]*?body\.app-shell main\.dashboard\s*\{[^}]*width: min\(1808px, calc\(100% - 260px\)\);[^}]*margin-left: calc\(240px \+ max\(0px, \(100% - 2048px\) \/ 2\)\);[^}]*padding: 24px;/);
    assert.match(navigation, /body\.app-shell main\.container,\s*body\.app-shell main\.modifica\s*\{[^}]*width: min\(1400px, calc\(100% - 260px\)\);[^}]*margin-left: calc\(240px \+ max\(0px, \(100% - 1640px\) \/ 2\)\);/);
    assert.match(navigation, /body\.app-shell main\.home\s*\{[^}]*width: min\(1100px, calc\(100% - 260px\)\);[^}]*margin-left: calc\(240px \+ max\(0px, \(100% - 1340px\) \/ 2\)\);/);
    assert.match(navigation, /body\.app-shell main\.dashboard \.lista-ordini,\s*body\.app-shell main\.dashboard \.lista-consegne\s*\{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(340px, 1fr\)\);/);
    assert.match(navigation, /body\.app-shell main\.dashboard \.metriche\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    assert.match(navigation, /body\.app-shell main\.dashboard \.metriche > div:last-child\s*\{[^}]*grid-column: auto;/);
    assert.match(navigation, /body\.app-shell main\.container \.composer-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 420px\);/);
    assert.match(orderStyles, /grid-template-rows: repeat\(3, 132px\)/);
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
    assert.match(navigation, /body\.app-shell main\.home,\s*body\.app-shell main\.dashboard,\s*body\.app-shell main\.container,\s*body\.app-shell main\.modifica\s*\{[^}]*padding-top:\s*0;/);
    assert.match(navigation, /body\.app-shell \.app-page-header \.app-header-actions\s*\{[^}]*min-width:\s*0;[^}]*margin-left:\s*auto;[^}]*justify-content:\s*flex-end;/);
    assert.match(theme, /@media \(max-width: 720px\)[\s\S]*?\.home\s*\{\s*padding:\s*0 16px 24px;/);
    assert.match(theme, /@media \(max-width: 420px\)[\s\S]*?\.home\s*\{\s*padding:\s*0 12px 24px;/);
    assert.match(theme, /\.dashboard-header:not\(\.app-page-header\)\s*\{[^}]*flex-wrap:\s*wrap;/);
    assert.match(theme, /\.dashboard-header:not\(\.app-page-header\) > div\s*\{[^}]*min-width:\s*min\(100%, 250px\);/);
});

test("mobile navigation and checkout use one safe-area offset", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const navigation = fs.readFileSync(path.join(directory, "nav.css"), "utf8");
    const navigationScript = fs.readFileSync(path.join(directory, "nav.js"), "utf8");
    const orderStyles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const editStyles = fs.readFileSync(path.join(directory, "modifica.css"), "utf8");
    const orderScript = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");
    const editScript = fs.readFileSync(path.join(directory, "modifica.js"), "utf8");
    const orderPage = fs.readFileSync(path.join(directory, "ordini.html"), "utf8");
    const editPage = fs.readFileSync(path.join(directory, "modifica.html"), "utf8");

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
    assert.match(orderStyles, /\.composer-summary > \.barra-conto\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*var\(--app-mobile-nav-height\);[^}]*height:\s*var\(--app-mobile-checkout-height\);/);
    assert.match(orderStyles, /\.composer-summary > \.barra-conto > \.btn-invia:disabled\s*\{[^}]*cursor:\s*not-allowed;[^}]*opacity:\s*\.45;/);
    assert.match(orderStyles, /@media \(max-width: 767px\) and \(orientation: portrait\)[\s\S]*?\.composer-summary > \.riepilogo-card\s*\{[^}]*display:\s*block;[^}]*border-radius:\s*16px;/);
    assert.match(orderStyles, /@media \(max-width: 767px\) and \(orientation: landscape\)[\s\S]*?\.composer-summary > \.riepilogo-card > \.riepilogo\s*\{\s*display:\s*none;/);
    assert.match(orderScript, /invia\.textContent = stato\.righe\.length \? "Rivedi e invia" : "Aggiungi prodotti";/);
    assert.match(editStyles, /\.modifica-footer\s*\{[^}]*bottom:\s*var\(--app-mobile-nav-height\);/);
    assert.match(orderPage, /class="riepilogo-totale-riga">\s*<p id="riepilogo-conteggio" class="riepilogo-conteggio" aria-live="polite">0 prodotti<\/p>\s*<p id="riepilogo-totale" class="riepilogo-totale">[^<]*<\/p>/);
    assert.match(orderPage, /class="barra-conto-dettagli"[\s\S]*?<p id="barra-totale" class="riepilogo-totale">[^<]*<\/p>\s*<p id="barra-conteggio" class="riepilogo-conteggio" aria-live="polite">0 prodotti<\/p>/);
    assert.match(orderPage, /<button class="btn-invia" id="btn-invia" type="button" disabled>Aggiungi prodotti<\/button>/);
    assert.match(orderScript, /aggiornaConteggioProdotti\(riepilogoConteggio, stato\.righe\.length\);/);
    assert.match(orderScript, /barraTotale\.textContent = testoTotale;/);
    assert.match(orderScript, /aggiornaConteggioProdotti\(barraConteggio, stato\.righe\.length\);/);
    assert.match(editPage, /<p id="totale-modifica">[^<]*<\/p>\s*<p id="conteggio-modifica" class="riepilogo-conteggio" aria-live="polite">0 prodotti<\/p>/);
    assert.match(editPage, /src="\/prodotti-ui\.js"[\s\S]*?src="\/modifica\.js"/);
    assert.match(editScript, /aggiornaConteggioProdotti\(conteggioModifica, righeOrdine\.length\);/);
    assert.doesNotMatch(orderStyles, /counter-reset:\s*order-items|counter-increment:\s*order-items|counter\(order-items\)/);
    assert.doesNotMatch(editStyles, /counter-reset:\s*edit-products|counter-increment:\s*edit-products|counter\(edit-products\)/);
});

test("order summary rows keep a two-column remove action and omit empty extras", () => {
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");
    const styles = fs.readFileSync(path.join(directory, "ordini.css"), "utf8");
    const script = fs.readFileSync(path.join(directory, "ordini.js"), "utf8");

    assert.match(styles, /\.riepilogo-item\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;[^}]*column-gap:\s*12px;[^}]*align-items:\s*start;/);
    assert.match(styles, /\.riepilogo-item \.rimuovi\s*\{[^}]*min-height:\s*40px;[^}]*padding:\s*6px 10px;[^}]*border:\s*1px solid #F7C1C1;[^}]*border-radius:\s*8px;[^}]*background:\s*#FCEBEB;[^}]*color:\s*#A32D2D;[^}]*font-size:\s*13px;[^}]*font-weight:\s*600;[^}]*text-decoration:\s*none;[^}]*white-space:\s*nowrap;/);
    assert.doesNotMatch(styles, /#riepilogo-items \.riepilogo-item\s*\{|#riepilogo-items \.rimuovi\s*\{/);
    assert.match(script, /const extra = riga\.extra\.length\s*\?\s*`<span>Extra: \$\{testoSicuro\(nomiExtra\(riga\.extra\)\.join\(", "\)\)\}<\/span>`\s*:\s*"";/);
    assert.doesNotMatch(script, /Nessun extra/);
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
    assert.match(styles, /@media \(max-width: 767px\) and \(orientation: portrait\)[\s\S]*?\.riepilogo-sheet\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*85vh;[^}]*padding:\s*10px 16px 0;[^}]*border-radius:\s*20px 20px 0 0;/);
    assert.match(styles, /\.riepilogo-sheet-items\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/);
    assert.match(styles, /\.riepilogo-sheet-items\s*\{[^}]*flex:\s*0 1 auto;/);
    assert.match(styles, /\.riepilogo-sheet-footer\s*\{[^}]*padding:\s*10px 16px max\(12px, env\(safe-area-inset-bottom\)\);/);
    assert.match(styles, /\.riepilogo-sheet\s*\{[^}]*transition:\s*transform 280ms cubic-bezier\(\.2, \.9, \.3, 1\);/);
    assert.match(styles, /\.riepilogo-sheet-backdrop\s*\{[^}]*transition:\s*opacity 280ms cubic-bezier\(\.2, \.9, \.3, 1\);/);
    assert.match(styles, /\.riepilogo-sheet\s*\{[^}]*overscroll-behavior:\s*contain;/);
    assert.match(styles, /prefers-reduced-motion:\s*reduce/);
    assert.doesNotMatch(styles, /riepilogo-sheet(?:-backdrop)?\.is-dragging|body\.riepilogo-sheet-aperto/);
    assert.match(script, /renderRigheRiepilogo\(riepilogo\);\s*renderRigheRiepilogo\(riepilogoSheetLista\);/);
    assert.match(script, /riepilogoSheetLista\.addEventListener\("click", rimuoviRigaRiepilogo\)/);
    assert.match(script, /function rimuoviRigaRiepilogo\(evento\)[\s\S]*?stato\.righe\.splice\(Number\(pulsante\.dataset\.indice\), 1\);[\s\S]*?renderRiepilogo\(\);/);
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

    assert.match(navigation, /brandImage\.src = "\/icons\/logo-tondo\.png";/);
    assert.match(navigation, /brandImage\.alt = "Civico7 - Home";/);
    assert.match(navigation, /brandImage\.width = 96;[\s\S]*?brandImage\.height = 96;/);
    assert.match(navigation, /mobileBrand\.src = "\/icons\/logo-tondo\.png";/);
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
    assert.match(html, /&lt;script&gt; x1/);
    assert.match(html, /Extra: &lt;b&gt;extra&lt;\/b&gt;/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(html, /<script>|<img src=x>/);
});
