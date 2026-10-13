const fs = require("node:fs");
const path = require("node:path");

function readJavaString(value) {
    const match = value.match(/"(?:\\.|[^"\\])*"/);
    if (!match) {
        throw new Error("Menu source contains an invalid string literal.");
    }
    return JSON.parse(match[0]);
}

function extractProducts(source) {
    const products = [];
    const marker = "new ProdottoMenu(";
    let position = 0;
    while ((position = source.indexOf(marker, position)) !== -1) {
        const start = position + marker.length;
        let cursor = start;
        let depth = 1;
        let quoted = false;
        let escaped = false;
        for (; depth > 0; cursor++) {
            const character = source[cursor];
            if (quoted) {
                if (escaped) escaped = false;
                else if (character === "\\") escaped = true;
                else if (character === "\"") quoted = false;
            } else if (character === "\"") {
                quoted = true;
            } else if (character === "(") {
                depth++;
            } else if (character === ")") {
                depth--;
            }
            if (cursor >= source.length) {
                throw new Error("Menu source has an unclosed product definition.");
            }
        }

        const body = source.slice(start, cursor - 1);
        const args = [];
        let last = 0;
        let nesting = 0;
        quoted = false;
        escaped = false;
        for (let index = 0; index < body.length; index++) {
            const character = body[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (character === "\\") escaped = true;
                else if (character === "\"") quoted = false;
            } else if (character === "\"") {
                quoted = true;
            } else if (character === "(" || character === "[") {
                nesting++;
            } else if (character === ")" || character === "]") {
                nesting--;
            } else if (character === "," && nesting === 0) {
                args.push(body.slice(last, index).trim());
                last = index + 1;
            }
        }
        args.push(body.slice(last).trim());

        const ingredientArgument = args.slice(3).find(argument => argument.includes("Arrays.asList("));
        const ingredients = ingredientArgument
            ? [...ingredientArgument.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]))
            : [];
        products.push({
            nome: readJavaString(args[0]),
            categoria: readJavaString(args[1]),
            prezzo: Number(readJavaString(args[2])),
            ingredienti: ingredients
        });
        position = cursor;
    }
    if (products.length === 0) {
        throw new Error("No products found in the Java menu source.");
    }
    return products;
}

function extractExtras(source) {
    const extras = [...source.matchAll(/extra\("((?:\\.|[^"\\])*)",\s*"([\d.]+)"\)/g)]
        .map(([, name, price]) => ({
            id: JSON.parse(`"${name}"`).toLowerCase().replaceAll(" ", "-").replaceAll("/", "-"),
            nome: JSON.parse(`"${name}"`),
            prezzo: Number(price)
        }));
    if (extras.length === 0) {
        throw new Error("No extras found in the Java menu source.");
    }
    return extras.sort((first, second) => first.nome.localeCompare(second.nome, "it", { sensitivity: "base" }));
}

function exportCatalog() {
    const root = path.join(__dirname, "..");
    const javaServices = path.join(root, "src", "main", "java", "it", "pizzeria", "gestionale", "service");
    const products = extractProducts(fs.readFileSync(path.join(javaServices, "MenuService.java"), "utf8"));
    const extras = extractExtras(fs.readFileSync(path.join(javaServices, "ExtraMenu.java"), "utf8"));
    const destination = path.join(root, "lib");
    fs.writeFileSync(path.join(destination, "menu.json"), `${JSON.stringify(products)}\n`);
    fs.writeFileSync(path.join(destination, "extras.json"), `${JSON.stringify(extras)}\n`);
}

if (require.main === module) {
    exportCatalog();
} else {
    module.exports = { extractProducts, extractExtras, exportCatalog };
}
