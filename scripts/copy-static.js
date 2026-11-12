const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "main", "resources", "static");
const destination = path.join(__dirname, "..", "public");
const protectedPages = ["index.html", "ordini.html", "gestionale.html", "modifica.html", "consegne.html", "ritiri.html", "banco.html", "tavoli.html"];
const fontFiles = [
    "poppins-latin-400-normal.woff2",
    "poppins-latin-500-normal.woff2",
    "poppins-latin-600-normal.woff2",
    "poppins-latin-ext-400-normal.woff2",
    "poppins-latin-ext-500-normal.woff2",
    "poppins-latin-ext-600-normal.woff2"
];

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
console.log(`Copied static assets to ${destination}`);
