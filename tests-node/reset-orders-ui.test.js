const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pages = ["gestionale.html", "banco.html", "ritiri.html", "tavoli.html"];
const staticDirectory = path.join(__dirname, "../src/main/resources/static");

function runOrdersPage(currentAccount, { missingIds = [] } = {}) {
    const source = fs.readFileSync(path.join(staticDirectory, "gestionale.js"), "utf8");
    const elements = new Map();
    const fetchCalls = [];
    function element(id) {
        if (!elements.has(id)) {
            const listeners = new Map();
            elements.set(id, {
                listeners,
                addEventListener(name, callback) { listeners.set(name, callback); },
                click() {
                    const listener = listeners.get("click");
                    if (listener) listener({ target: this });
                },
                querySelectorAll() { return []; },
                insertAdjacentHTML() {},
                className: "",
                value: "",
                checked: false,
                hidden: false,
                disabled: false,
                textContent: "",
                focus() {},
                showModal() { this.open = true; },
                close() { this.open = false; }
            });
        }
        return elements.get(id);
    }
    const context = {
        document: {
            body: {
                dataset: { serviceType: "" },
                addEventListener() {}
            },
            getElementById(id) { return missingIds.includes(id) ? null : element(id); },
            addEventListener() {},
            visibilityState: "visible"
        },
        window: {
            authReady: Promise.resolve(true),
            currentAccount,
            orderCard: {
                bindReprints() {
                    return { refresh() {}, isOpen() { return false; } };
                },
                bindDateFilter() {},
                currentServiceDate() { return "2026-11-24"; },
                createExpansionState() {
                    return { isOpen() { return false; }, toggle() {} };
                },
                render() { return ""; }
            }
        },
        fetch: async url => {
            fetchCalls.push(url);
            return {
                ok: true,
                async json() {
                    return url === "/api/menu" ? [] : { versione: 1, ordini: [] };
                }
            };
        },
        setInterval() { return 1; },
        clearInterval() {},
        Intl,
        Date,
        Promise,
        URLSearchParams,
        Set
    };
    vm.runInNewContext(source, context);
    return { elements, fetchCalls };
}

test("order reset button is consistently labeled on every order-list page", () => {
    for (const name of pages) {
        const page = fs.readFileSync(
            path.join(staticDirectory, name),
            "utf8"
        );
        assert.match(page, /<button id="reset-numeri"[^>]*hidden[^>]*>Reset ordini<\/button>/, name);
        assert.doesNotMatch(page, /Reset numeri/);
    }
});

test("reset confirmation explains the destructive action and does not use inline scripts or confirm()", () => {
    const page = fs.readFileSync(path.join(staticDirectory, "gestionale.html"), "utf8");
    const script = fs.readFileSync(path.join(staticDirectory, "gestionale.js"), "utf8");
    const resetHandler = script.slice(
        script.indexOf('const resetButton = document.getElementById("reset-numeri")'),
        script.indexOf("async function avvia()")
    );

    assert.match(page, /<dialog id="reset-numeri-dialog" class="reset-confirm-dialog"/);
    assert.match(page, /Verranno eliminati tutti gli ordini della giornata/);
    assert.match(page, /id="reset-numeri-phrase"/);
    assert.match(page, /id="reset-numeri-confirm"[^>]*disabled/);
    assert.doesNotMatch(resetHandler, /window\.confirm/);
    assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)/);
});

test("only admins see reset controls and the confirmation unlocks only for RESET", async () => {
    const { elements: staffElements } = runOrdersPage({ admin: false, staff: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(staffElements.get("reset-numeri").hidden, true);

    const { elements: adminElements } = runOrdersPage({ admin: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(adminElements.get("reset-numeri").hidden, false);

    const phrase = adminElements.get("reset-numeri-phrase");
    const confirmButton = adminElements.get("reset-numeri-confirm");
    const onInput = phrase.listeners.get("input");
    assert.equal(confirmButton.disabled, true);
    phrase.value = "RES";
    onInput();
    assert.equal(confirmButton.disabled, true);
    phrase.value = "reset";
    onInput();
    assert.equal(confirmButton.disabled, true);
    phrase.value = "RESET";
    onInput();
    assert.equal(confirmButton.disabled, false);
});

test("shared order-list script loads orders when reset dialog elements are absent", async () => {
    const dialogIds = [
        "reset-numeri-dialog",
        "reset-numeri-phrase",
        "reset-numeri-confirm",
        "reset-numeri-cancel"
    ];
    const { elements, fetchCalls } = runOrdersPage(
        { admin: false, staff: true },
        { missingIds: dialogIds }
    );

    await new Promise(resolve => setImmediate(resolve));

    assert.ok(fetchCalls.includes("/api/ordini"));
    assert.equal(elements.get("reset-numeri").hidden, true);
});

test("all-orders header reset is admin-only and mobile reset remains in More", () => {
    const directory = path.join(__dirname, "../src/main/resources/static");
    const navigation = fs.readFileSync(path.join(directory, "nav.js"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "nav.css"), "utf8");

    assert.match(navigation, /resetButton && window\.location\.pathname === "\/gestionale\.html"/);
    assert.match(navigation, /resetHeaderButton\.setAttribute\("aria-label", "Reset ordini"\)/);
    assert.match(navigation, /resetHeaderButton\.title = "Reset ordini"/);
    assert.match(navigation, /resetHeaderLabel\.textContent = "Reset ordini"/);
    assert.match(navigation, /resetHeaderButton\.addEventListener\("click", \(\) => resetButton\.click\(\)\)/);
    assert.match(navigation, /resetHeaderButton\.hidden = resetButton\.hidden \|\| account\.admin !== true/);
    assert.match(navigation, /resetCopy\.hidden = resetButton\.hidden \|\| account\.admin !== true/);
    assert.doesNotMatch(navigation, /sidebarActions\.append\(resetButton\)/);
    assert.match(navigation, /sheetLinks\.append\(resetCopy\)/);
    assert.ok(navigation.indexOf("actions.append(refreshButton)") < navigation.indexOf("actions.append(resetHeaderButton)"));
    assert.ok(navigation.indexOf("actions.append(resetHeaderButton)") < navigation.indexOf("actions.append(searchButton)"));
    assert.match(styles, /\.app-header-actions \.app-reset-header,\s*\.app-header-actions \.app-reset-header\[hidden\]\s*\{\s*display:\s*none;/);
    assert.match(styles, /@media \(min-width: 768px\)[\s\S]*?\.app-header-actions \.app-reset-header\s*\{[^}]*display:\s*inline-flex;[^}]*height:\s*48px;[^}]*border-color:\s*var\(--theme-red\);[^}]*background:\s*#fff;[^}]*color:\s*var\(--theme-red\);/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.app-header-actions \.app-reset-header\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*border-color:\s*#F7C1C1;[^}]*background:\s*rgba\(163, 45, 45, \.35\);[^}]*color:\s*#FCEBEB;/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.app-header-actions \.app-reset-header-label\s*\{\s*display:\s*none;/);
    assert.match(styles, /\.app-header-actions \.app-reset-header\[hidden\]\s*\{\s*display:\s*none;/);
});

test("desktop header reset delegates to the RESET confirmation", async () => {
    const navigation = fs.readFileSync(path.join(staticDirectory, "nav.js"), "utf8");
    const clickExpression = navigation.match(
        /resetHeaderButton\.addEventListener\("click",\s*(\(\) => resetButton\.click\(\))\)/
    )?.[1];
    const hiddenExpression = navigation.match(
        /resetHeaderButton\.hidden = (resetButton\.hidden \|\| account\.admin !== true)/
    )?.[1];
    assert.ok(clickExpression);
    assert.ok(hiddenExpression);

    const adminRun = runOrdersPage({ admin: true });
    const staffRun = runOrdersPage({ admin: false, staff: true });
    await new Promise(resolve => setImmediate(resolve));

    const adminReset = adminRun.elements.get("reset-numeri");
    const staffReset = staffRun.elements.get("reset-numeri");
    assert.equal(vm.runInNewContext(hiddenExpression, {
        resetButton: adminReset,
        account: { admin: true }
    }), false);
    assert.equal(vm.runInNewContext(hiddenExpression, {
        resetButton: staffReset,
        account: { admin: false }
    }), true);

    vm.runInNewContext(`(${clickExpression})()`, { resetButton: adminReset });
    assert.equal(adminRun.elements.get("reset-numeri-dialog").open, true);
    assert.equal(adminRun.elements.get("reset-numeri-phrase").value, "");
    assert.equal(adminRun.elements.get("reset-numeri-confirm").disabled, true);
});
