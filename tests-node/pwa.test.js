const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const staticDirectory = path.join(root, "src", "main", "resources", "static");
const iconDirectory = path.join(staticDirectory, "icons");
const publicDirectory = path.join(root, "public");
const iconSizes = {
    "apple-touch-icon.png": 180,
    "favicon-32.png": 32,
    "icon-192.png": 192,
    "icon-192-maskable.png": 192,
    "icon-512.png": 512,
    "icon-512-maskable.png": 512,
    "logo-tondo-192.png": 192
};
const iconSizeLimits = {
    "apple-touch-icon.png": 30 * 1024,
    "favicon-32.png": 4 * 1024,
    "icon-192.png": 30 * 1024,
    "icon-192-maskable.png": 25 * 1024,
    "icon-512.png": 160 * 1024,
    "icon-512-maskable.png": 110 * 1024
};

function pngDimensions(filePath) {
    const data = fs.readFileSync(filePath);
    assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    return {
        width: data.readUInt32BE(16),
        height: data.readUInt32BE(20)
    };
}

test("every page declares the installable app metadata", () => {
    const pages = fs.readdirSync(staticDirectory).filter(file => file.endsWith(".html"));
    assert.ok(pages.length > 0);

    for (const page of pages) {
        const html = fs.readFileSync(path.join(staticDirectory, page), "utf8");
        const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
        assert.match(head, /<meta name="viewport"[^>]*viewport-fit=cover/i, page);
        assert.match(head, /<link rel="manifest" href="\/manifest\.webmanifest"/i, page);
        assert.match(head, /<link rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/i, page);
        assert.match(head, /<link rel="icon" href="\/favicon\.ico" sizes="any"/i, page);
        assert.match(head, /<link rel="icon" type="image\/png" sizes="32x32" href="\/icons\/favicon-32\.png"/i, page);
        assert.match(head, /<meta name="theme-color" content="#1A5EA9"/i, page);
        assert.match(head, /<meta name="apple-mobile-web-app-capable" content="yes"/i, page);
        assert.match(head, /<meta name="mobile-web-app-capable" content="yes"/i, page);
        assert.match(head, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/i, page);
        assert.match(head, /<meta name="apple-mobile-web-app-title" content="Civico7"/i, page);
    }
});

test("manifest icons have the declared dimensions and are copied as public assets", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(staticDirectory, "manifest.webmanifest"), "utf8"));
    assert.deepEqual({
        name: manifest.name,
        short_name: manifest.short_name,
        start_url: manifest.start_url,
        scope: manifest.scope,
        display: manifest.display,
        orientation: manifest.orientation,
        background_color: manifest.background_color,
        theme_color: manifest.theme_color,
        lang: manifest.lang
    }, {
        name: "Civico7 Gestionale",
        short_name: "Civico7",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F3F6FA",
        theme_color: "#1A5EA9",
        lang: "it"
    });

    for (const [file, size] of Object.entries(iconSizes)) {
        const source = path.join(iconDirectory, file);
        assert.deepEqual(pngDimensions(source), { width: size, height: size }, file);
        assert.deepEqual(fs.readFileSync(path.join(publicDirectory, "icons", file)), fs.readFileSync(source), file);
    }
    assert.ok(fs.statSync(path.join(iconDirectory, "logo-tondo-192.png")).size < 20 * 1024);
    for (const [file, limit] of Object.entries(iconSizeLimits)) {
        assert.ok(fs.statSync(path.join(iconDirectory, file)).size < limit, file);
    }
    assert.equal(fs.existsSync(path.join(staticDirectory, "icons", "sorgente.png")), false);
    assert.equal(fs.existsSync(path.join(root, "design", "sorgente.png")), true);
    assert.deepEqual(
        fs.readFileSync(path.join(publicDirectory, "favicon.ico")),
        fs.readFileSync(path.join(staticDirectory, "favicon.ico"))
    );
    assert.deepEqual(fs.readFileSync(path.join(publicDirectory, "manifest.webmanifest")), fs.readFileSync(path.join(staticDirectory, "manifest.webmanifest")));
    assert.deepEqual(
        manifest.icons.filter(icon => icon.purpose === "maskable").map(icon => icon.sizes).sort(),
        ["192x192", "512x512"]
    );
});

test("manifest and icons use public static routes and the manifest MIME type", () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    const manifestHeaders = config.headers.find(header => header.source === "/manifest.webmanifest").headers;
    assert.equal(manifestHeaders.find(header => header.key === "Content-Type").value, "application/manifest+json");
    assert.equal(manifestHeaders.find(header => header.key === "Cache-Control").value, "public, max-age=604800");
    assert.equal(config.headers.find(header => header.source === "/fonts/(.*)").headers[0].value, "public, max-age=31536000, immutable");
    assert.equal(config.headers.find(header => header.source === "/icons/(.*)").headers[0].value, "public, max-age=604800");
    assert.equal(config.headers.find(header => header.source === "/favicon.ico").headers[0].value, "public, max-age=604800");
    assert.equal(config.rewrites.some(rewrite => /manifest\.webmanifest|favicon\.ico|favicon-32\.png|logo-tondo\.png|\/icons\//.test(rewrite.source)), false);
});

test("login and app navigation use the optimized round logo", () => {
    const login = fs.readFileSync(path.join(staticDirectory, "login.html"), "utf8");
    const navigation = fs.readFileSync(path.join(staticDirectory, "nav.js"), "utf8");
    assert.match(login, /src="\/icons\/logo-tondo-192\.png"/);
    assert.match(navigation, /\/icons\/logo-tondo-192\.png/);
    assert.doesNotMatch(login + navigation, /\/icons\/logo-tondo\.png/);
});

test("safe-area padding protects the mobile header, sidebar and bottom navigation", () => {
    const navCss = fs.readFileSync(path.join(staticDirectory, "nav.css"), "utf8");
    assert.match(navCss, /@media \(max-width: 767px\)[\s\S]*?\.app-page-header \{[\s\S]*?padding: calc\(8px \+ env\(safe-area-inset-top\)\)/);
    assert.match(navCss, /\.app-sidebar \{[\s\S]*?padding: max\(16px, env\(safe-area-inset-top\)\)/);
    assert.match(navCss, /safe-area-inset-bottom/);
});
