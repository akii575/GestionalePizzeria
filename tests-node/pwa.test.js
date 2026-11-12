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
    "icon-192.png": 192,
    "icon-192-maskable.png": 192,
    "icon-512.png": 512,
    "icon-512-maskable.png": 512
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
    assert.deepEqual(fs.readFileSync(path.join(publicDirectory, "manifest.webmanifest")), fs.readFileSync(path.join(staticDirectory, "manifest.webmanifest")));
    assert.deepEqual(
        manifest.icons.filter(icon => icon.purpose === "maskable").map(icon => icon.sizes).sort(),
        ["192x192", "512x512"]
    );
});

test("manifest and icons use public static routes and the manifest MIME type", () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    assert.equal(config.headers.find(header => header.source === "/manifest.webmanifest")
        ?.headers.find(header => header.key === "Content-Type")?.value, "application/manifest+json");
    assert.equal(config.rewrites.some(rewrite => /manifest\.webmanifest|\/icons\//.test(rewrite.source)), false);
});

test("safe-area padding protects the mobile header, sidebar and bottom navigation", () => {
    const navCss = fs.readFileSync(path.join(staticDirectory, "nav.css"), "utf8");
    assert.match(navCss, /@media \(max-width: 767px\)[\s\S]*?\.app-page-header \{[\s\S]*?padding: calc\(8px \+ env\(safe-area-inset-top\)\)/);
    assert.match(navCss, /\.app-sidebar \{[\s\S]*?padding: max\(16px, env\(safe-area-inset-top\)\)/);
    assert.match(navCss, /safe-area-inset-bottom/);
});
