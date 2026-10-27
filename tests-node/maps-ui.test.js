const test = require("node:test");
const assert = require("node:assert/strict");
const mapsUI = require("../src/main/resources/static/maps-ui");

test("map links encode the complete address for Google and Apple Maps", () => {
    const links = mapsUI.urlsForAddress("Via Roma 12, 00100 Roma");
    const query = "Via%20Roma%2012%2C%2000100%20Roma";

    assert.equal(links.google, `https://www.google.com/maps/search/?api=1&query=${query}`);
    assert.equal(links.apple, `https://maps.apple.com/?q=${query}`);
});

test("clicking an address opens the chooser with links for both map services", () => {
    const previousDocument = global.document;
    const elements = {
        "#app-mappe-indirizzo": { textContent: "" },
        "#app-mappe-google": { href: "" },
        "#app-mappe-apple": { href: "" }
    };
    const dialog = {
        open: false,
        querySelector(selector) {
            return elements[selector];
        },
        showModal() {
            this.open = true;
        }
    };
    global.document = { getElementById: () => dialog };

    try {
        let clickHandler;
        mapsUI.initialize({
            addEventListener(type, handler) {
                if (type === "click") clickHandler = handler;
            }
        });
        const address = "Via Roma 12, 00100 Roma";
        const button = {
            dataset: { indirizzo: address },
            closest: selector => selector === "[data-indirizzo]" ? button : null
        };
        let prevented = false;
        clickHandler({
            target: button,
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(prevented, true);
        assert.equal(dialog.open, true);
        assert.equal(elements["#app-mappe-indirizzo"].textContent, address);
        assert.equal(elements["#app-mappe-google"].href, mapsUI.urlsForAddress(address).google);
        assert.equal(elements["#app-mappe-apple"].href, mapsUI.urlsForAddress(address).apple);
    } finally {
        if (previousDocument === undefined) delete global.document;
        else global.document = previousDocument;
    }
});

test("map UI is loaded on delivery and all-orders screens", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const directory = path.join(__dirname, "..", "src", "main", "resources", "static");

    for (const [page, renderer] of [
        ["consegne.html", "consegne.js"],
        ["gestionale.html", "gestionale.js"]
    ]) {
        const html = fs.readFileSync(path.join(directory, page), "utf8");
        assert.ok(html.indexOf("/maps-ui.js") < html.indexOf(`/${renderer}`), `${page} must load map handling first`);
    }
});
