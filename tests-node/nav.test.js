const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const staticDirectory = path.join(__dirname, "../src/main/resources/static");
const navigation = fs.readFileSync(path.join(staticDirectory, "nav.js"), "utf8");
const navigationStyles = fs.readFileSync(path.join(staticDirectory, "nav.css"), "utf8");
const themeStyles = fs.readFileSync(path.join(staticDirectory, "theme.css"), "utf8");

function createElement(tagName) {
    let text = "";
    const listeners = {};
    const element = {
        tagName: tagName.toUpperCase(),
        children: [],
        attributes: {},
        className: "",
        hidden: false,
        parentElement: null,
        listeners,
        classList: {
            add(...names) {
                const classes = new Set(element.className.split(/\s+/).filter(Boolean));
                names.forEach(name => classes.add(name));
                element.className = [...classes].join(" ");
            },
            toggle(name, force) {
                const classes = new Set(element.className.split(/\s+/).filter(Boolean));
                const enabled = force === undefined ? !classes.has(name) : force;
                if (enabled) classes.add(name);
                else classes.delete(name);
                element.className = [...classes].join(" ");
                return enabled;
            }
        },
        append(...children) {
            for (const child of children) {
                if (child.parentElement) {
                    child.parentElement.children = child.parentElement.children.filter(item => item !== child);
                }
                child.parentElement = element;
                element.children.push(child);
            }
        },
        prepend(...children) {
            for (const child of children.reverse()) {
                if (child.parentElement) {
                    child.parentElement.children = child.parentElement.children.filter(item => item !== child);
                }
                child.parentElement = element;
                element.children.unshift(child);
            }
        },
        insertBefore(child, reference) {
            if (child.parentElement) {
                child.parentElement.children = child.parentElement.children.filter(item => item !== child);
            }
            child.parentElement = element;
            const index = element.children.indexOf(reference);
            element.children.splice(index < 0 ? element.children.length : index, 0, child);
        },
        setAttribute(name, value) {
            element.attributes[name] = String(value);
        },
        addEventListener(name, listener) {
            listeners[name] = listener;
        },
        click() {
            return listeners.click && listeners.click({ target: element });
        },
        focus() {},
        remove() {
            if (element.parentElement) {
                element.parentElement.children = element.parentElement.children.filter(item => item !== element);
                element.parentElement = null;
            }
        },
        querySelector(selector) {
            if (selector === ":scope > header") {
                return element.children.find(child => child.tagName === "HEADER") || null;
            }
            return findElement(element, child => selector.startsWith(".")
                ? child.className.split(/\s+/).includes(selector.slice(1))
                : child.tagName.toLowerCase() === selector.toLowerCase());
        },
        get textContent() {
            return text + element.children.map(child => child.textContent).join("");
        },
        set textContent(value) {
            text = String(value);
            element.children = [];
        }
    };
    return element;
}

function findElement(root, predicate) {
    for (const child of root.children) {
        if (predicate(child)) return child;
        const nested = findElement(child, predicate);
        if (nested) return nested;
    }
    return null;
}

async function runNavigationWithLogout() {
    const main = createElement("main");
    const title = createElement("h1");
    title.textContent = "CIVICO7";
    main.append(title);
    const body = createElement("body");
    body.append(main);
    const html = createElement("html");
    html.style = { setProperty() {}, removeProperty() {} };
    const document = {
        body,
        documentElement: html,
        createElement,
        createElementNS(namespace, tagName) {
            return createElement(tagName);
        },
        querySelector(selector) {
            if (selector === "main") return main;
            if (selector === "nav .auth-logout") return null;
            return null;
        },
        getElementById() {
            return null;
        },
        addEventListener() {},
        dispatchEvent() {}
    };
    const localStorage = new Map([["civico7-account-v1", "saved-account"]]);
    const sessionStorage = new Map([["civico7-account-role-reload", "1"]]);
    const deletedCaches = [];
    const location = {
        pathname: "/index.html",
        search: "",
        replacedTo: null,
        replace(url) {
            this.replacedTo = url;
        }
    };
    const window = {
        authReady: Promise.resolve(true),
        currentAccount: { admin: true, email: "admin@example.com" },
        location,
        localStorage: {
            removeItem(key) { localStorage.delete(key); }
        },
        sessionStorage: {
            removeItem(key) { sessionStorage.delete(key); }
        },
        caches: {
            async keys() { return ["civico7-menu-v1", "unrelated-cache"]; },
            async delete(name) {
                deletedCaches.push(name);
                return true;
            }
        },
        fetch: async (url, init) => {
            assert.equal(url, "/api/auth/logout");
            assert.equal(init.method, "POST");
            return { ok: true };
        },
        addEventListener() {},
        setTimeout() { return 1; },
        clearTimeout() {}
    };

    vm.runInNewContext(navigation, {
        document,
        window,
        navigator: { onLine: true }
    });
    await new Promise(resolve => setImmediate(resolve));

    const moreButton = findElement(body, element => element.className.split(/\s+/).includes("app-bottom-more"));
    const moreMenuLogout = findElement(body, element =>
        element.tagName === "BUTTON"
        && element.className === "app-nav-item"
        && element.textContent === "Esci"
    );
    assert.ok(moreButton);
    assert.ok(moreMenuLogout);
    await moreButton.click();
    await moreMenuLogout.click();

    return { deletedCaches, localStorage, location, sessionStorage };
}

test("account email appears only in the More sheet and desktop sidebar", () => {
    assert.match(navigation, /createAccountEmail\("app-sidebar-account-email", accountEmail\)/);
    assert.match(navigation, /createAccountEmail\("app-more-account-email", accountEmail\)/);
    assert.match(navigation, /const accountEmail = typeof account\.email === "string" \? account\.email\.trim\(\) : "";/);
    assert.match(navigationStyles, /\.app-sidebar-account-email\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
    assert.match(navigationStyles, /\.app-more-account-email\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
    assert.doesNotMatch(themeStyles, /\.account-toolbar/);
});

test("the history navigation link is only added for admins", () => {
    assert.match(navigation, /if \(account\.admin === true\) \{\s*links\.push\(\{ label: "Storico", href: "\/storico\.html", icon: "history" \}\);/);
});

test("the More menu logout clears account and offline caches", async () => {
    assert.match(navigation, /sheetLinks\.append\(createButtonLink\("Esci", "logout", \(\) => logoutButton\.click\(\)\)\);/);
    assert.match(navigation, /window\.civico7ClearOfflineCaches = async \(\) => \{[\s\S]*?window\.caches\.keys\(\)[\s\S]*?window\.caches\.delete\(name\)/);

    const result = await runNavigationWithLogout();
    assert.equal(result.localStorage.has("civico7-account-v1"), false);
    assert.equal(result.sessionStorage.has("civico7-account-role-reload"), false);
    assert.deepEqual(result.deletedCaches, ["civico7-menu-v1"]);
    assert.equal(result.location.replacedTo, "/login.html");
});

test("mobile app headers and offline banners respect the iOS safe area", () => {
    assert.match(navigationStyles, /body\.app-shell \.app-page-header\s*\{[^}]*top:\s*0;[^}]*min-height:\s*calc\(60px \+ env\(safe-area-inset-top\)\);[^}]*padding:\s*env\(safe-area-inset-top\) 12px 8px;/);
    assert.match(navigationStyles, /\.civico7-network-banner\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/);
    assert.match(navigationStyles, /\.civico7-network-banner\s*\{[^}]*padding-top:\s*calc\(10px \+ env\(safe-area-inset-top\)\);/);
});

test("compact tablet navigation keeps icon labels accessible through tooltips and aria labels", () => {
    assert.match(navigation, /anchor\.title = link\.label;[\s\S]*anchor\.setAttribute\("aria-label", link\.label\)/);
    assert.match(navigation, /button\.title = label;[\s\S]*button\.setAttribute\("aria-label", label\)/);
    assert.match(navigation, /label\.append\(createIcon\("email"\), value\)/);
    assert.match(navigationStyles, /@media \(min-width: 800px\) and \(max-width: 1439px\)[\s\S]*body\.app-shell \.app-sidebar\s*\{[^}]*width:\s*68px;/);
    assert.match(navigationStyles, /\.app-sidebar-account-email > svg\s*\{[^}]*display:\s*block;/);
});

test("sidebar icons have bounded dimensions and desktop email remains readable", () => {
    assert.match(navigation, /svg\.setAttribute\("width", "20"\);[\s\S]*svg\.setAttribute\("height", "20"\);/);
    assert.match(navigationStyles, /\.app-sidebar svg\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;/);
    assert.match(navigationStyles, /@media \(min-width: 1440px\)[\s\S]*?\.app-sidebar-account-email\s*\{[^}]*display:\s*flex;[^}]*font-size:\s*12px;/);
    assert.match(navigationStyles, /@media \(min-width: 1440px\)[\s\S]*?\.app-sidebar-account-email > svg\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/);
    assert.match(navigationStyles, /@media \(min-width: 1440px\)[\s\S]*?\.app-sidebar-account-email-value\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
    assert.match(navigation, /label\.setAttribute\("aria-label", `Indirizzo email: \$\{email\}`\)/);
});

test("short landscape tablet sidebars move overflow actions into an Altro popover", () => {
    assert.match(navigation, /sidebarMoreButton = createButtonLink\("Altro", "more", \(\) => setMoreOpen\(true\)\)/);
    assert.match(navigation, /sideNav\.scrollHeight > sideNav\.clientHeight/);
    assert.match(navigationStyles, /@media \(min-width: 800px\) and \(max-width: 1439px\) and \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?\.app-sidebar \.app-brand\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/);
    assert.match(navigationStyles, /@media \(min-width: 800px\) and \(max-width: 1439px\) and \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?nav\.app-sidebar-links > \.app-nav-item\s*\{[^}]*min-height:\s*38px;[^}]*height:\s*38px;/);
    assert.match(navigationStyles, /@media \(min-width: 800px\) and \(max-width: 1439px\) and \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?nav\.app-sidebar-links::-webkit-scrollbar\s*\{[^}]*display:\s*none;/);
    assert.match(navigationStyles, /has-overflow-menu \.app-sidebar-links > \.app-nav-item\[data-icon="printer"\]/);
    assert.match(navigationStyles, /@media \(min-width: 800px\) and \(max-width: 1439px\) and \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?\.app-more-sheet\s*\{[^}]*position:\s*absolute;[^}]*left:\s*76px;/);
});

test("compact list pages preserve accessible search labels and fit the first result row", () => {
    for (const [file, label] of [
        ["gestionale.html", "Cerca tavolo, cliente, recapito o prodotto"],
        ["tavoli.html", "Cerca tavolo"],
        ["consegne.html", "Cerca indirizzo o telefono"],
        ["ritiri.html", "Cerca cliente"],
        ["banco.html", "Cerca ordine"]
    ]) {
        const page = fs.readFileSync(path.join(staticDirectory, file), "utf8");
        assert.match(page, new RegExp(`<span class="filtri__etichetta">${label}</span>`));
        assert.match(page, new RegExp(`id="filtro" type="search" aria-label="${label}" placeholder=`));
    }
    assert.match(navigationStyles, /@media \(max-height: 560px\), \(max-width: 1023px\) and \(orientation: landscape\)[\s\S]*?\.app-header-actions button\s*\{[^}]*min-height:\s*40px;[^}]*height:\s*40px;/);
    assert.match(navigationStyles, /@media \(max-height: 560px\), \(max-width: 1023px\) and \(orientation: landscape\)[\s\S]*?\.filtri__etichetta\s*\{[^}]*display:\s*none;/);
    assert.match(navigationStyles, /@media \(max-height: 560px\), \(max-width: 1023px\) and \(orientation: landscape\)[\s\S]*?\.metriche\s*\{[^}]*flex-wrap:\s*nowrap;/);
    assert.match(navigationStyles, /@media \(max-height: 560px\), \(max-width: 1023px\) and \(orientation: landscape\)[\s\S]*?\.lista-ordini,[\s\S]*?\.lista-consegne\s*\{[^}]*margin-top:\s*0;/);
});
