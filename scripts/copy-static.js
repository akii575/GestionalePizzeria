const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "main", "resources", "static");
const destination = path.join(__dirname, "..", "public");
const protectedPages = ["index.html", "ordini.html", "gestionale.html", "consegne.html", "ritiri.html", "banco.html", "tavoli.html", "menu.html", "storico.html"];
const fontFiles = [
    "poppins-latin-400-normal.woff2",
    "poppins-latin-500-normal.woff2",
    "poppins-latin-600-normal.woff2",
    "poppins-latin-ext-400-normal.woff2",
    "poppins-latin-ext-500-normal.woff2",
    "poppins-latin-ext-600-normal.woff2"
];

function staticFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const fullPath = path.join(directory, entry.name);
            return entry.isDirectory() ? staticFiles(fullPath) : [fullPath];
        })
        .sort();
}

function serviceWorkerBuildData() {
    const files = staticFiles(source);
    const hash = crypto.createHash("sha256");
    for (const file of files) {
        hash.update(path.relative(source, file).split(path.sep).join("/"));
        hash.update(fs.readFileSync(file));
    }
    const fontSources = fontFiles.map(file => path.join(
        __dirname,
        "..",
        "node_modules",
        "@fontsource",
        "poppins",
        "files",
        file
    ));
    for (const file of fontSources) hash.update(fs.readFileSync(file));

    const chartSource = path.join(__dirname, "..", "node_modules", "chart.js", "dist", "chart.umd.js");
    hash.update(fs.readFileSync(chartSource));
    const assetPattern = /\.(?:css|js|woff2?|png|jpe?g|svg|ico|webp)$/i;
    const precacheUrls = files
        .filter(file => assetPattern.test(file) || path.basename(file) === "manifest.webmanifest")
        .map(file => `/${path.relative(source, file).split(path.sep).join("/")}`);
    precacheUrls.push(...fontFiles.map(file => `/fonts/${file}`), "/vendor/chart.umd.js");
    return {
        version: hash.digest("hex").slice(0, 12),
        precacheUrls: [...new Set(precacheUrls)].sort()
    };
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
for (const page of protectedPages) {
    fs.rmSync(path.join(destination, page), { force: true });
}
const pages = Object.fromEntries(protectedPages.map(page => [
    `/${page}`,
    fs.readFileSync(path.join(source, page), "utf8")
]));
fs.writeFileSync(
    path.join(__dirname, "..", "lib", "generated-pages.js"),
    `module.exports = ${JSON.stringify(pages)};\n`
);
const fontsDirectory = path.join(destination, "fonts");
fs.mkdirSync(fontsDirectory, { recursive: true });
for (const fontFile of fontFiles) {
    fs.copyFileSync(
        path.join(__dirname, "..", "node_modules", "@fontsource", "poppins", "files", fontFile),
        path.join(fontsDirectory, fontFile)
    );
}
const vendorDirectory = path.join(destination, "vendor");
fs.mkdirSync(vendorDirectory, { recursive: true });
fs.copyFileSync(
    path.join(__dirname, "..", "node_modules", "chart.js", "dist", "chart.umd.js"),
    path.join(vendorDirectory, "chart.umd.js")
);

const serviceWorkerPath = path.join(destination, "sw.js");
let serviceWorker = fs.readFileSync(serviceWorkerPath, "utf8");
const { version, precacheUrls } = serviceWorkerBuildData();
if (!serviceWorker.includes("__CACHE_VERSION__") || !serviceWorker.includes("__PRECACHE_URLS__")) {
    throw new Error("Service worker build placeholders are missing.");
}
serviceWorker = serviceWorker
    .replace("__CACHE_VERSION__", version)
    .replace('"__PRECACHE_URLS__"', JSON.stringify(precacheUrls));
fs.writeFileSync(serviceWorkerPath, serviceWorker);
console.log(`Copied static assets to ${destination}`);
