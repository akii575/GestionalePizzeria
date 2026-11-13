const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pages = ["gestionale.html", "banco.html", "ritiri.html", "tavoli.html"];

test("order reset button is consistently labeled on every order-list page", () => {
    for (const name of pages) {
        const page = fs.readFileSync(
            path.join(__dirname, "../src/main/resources/static", name),
            "utf8"
        );
        assert.match(page, /<button id="reset-numeri"[^>]*>Reset ordini<\/button>/, name);
        assert.doesNotMatch(page, /Reset numeri/);
    }
});

test("reset confirmation warns that all orders are deleted and numbering restarts at one", () => {
    const script = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/gestionale.js"),
        "utf8"
    );
    assert.match(script, /reset eliminera' tutti gli ordini presenti e riportera' la numerazione a 1/);
});

test("mobile all-orders header reset delegates to the existing reset button", () => {
    const directory = path.join(__dirname, "../src/main/resources/static");
    const navigation = fs.readFileSync(path.join(directory, "nav.js"), "utf8");
    const styles = fs.readFileSync(path.join(directory, "nav.css"), "utf8");

    assert.match(navigation, /resetButton && window\.location\.pathname === "\/gestionale\.html"/);
    assert.match(navigation, /resetHeaderButton\.setAttribute\("aria-label", "Reset ordini"\)/);
    assert.match(navigation, /resetHeaderButton\.title = "Reset ordini"/);
    assert.match(navigation, /resetHeaderButton\.addEventListener\("click", \(\) => resetButton\.click\(\)\)/);
    assert.match(navigation, /resetHeaderButton\.hidden = resetButton\.hidden/);
    assert.ok(navigation.indexOf("actions.append(refreshButton)") < navigation.indexOf("actions.append(resetHeaderButton)"));
    assert.ok(navigation.indexOf("actions.append(resetHeaderButton)") < navigation.indexOf("actions.append(searchButton)"));
    assert.match(styles, /\.app-header-actions \.app-reset-header,\s*\.app-header-actions \.app-reset-header\[hidden\]\s*\{\s*display:\s*none;/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.app-header-actions \.app-reset-header\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*border-color:\s*#F7C1C1;[^}]*background:\s*rgba\(163, 45, 45, \.35\);[^}]*color:\s*#FCEBEB;/);
    assert.match(styles, /\.app-header-actions \.app-reset-header\[hidden\]\s*\{\s*display:\s*none;/);
});
