const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "main", "resources", "static");
const destination = path.join(__dirname, "..", "public");
const protectedPages = ["index.html", "ordini.html", "gestionale.html", "modifica.html"];

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
console.log(`Copied static assets to ${destination}`);
