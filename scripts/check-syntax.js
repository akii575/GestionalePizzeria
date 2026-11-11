const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const folders = ["api", "lib", "scripts", "tests-node", path.join("src", "main", "resources", "static"), ".claude"];
const skipped = new Set([path.join("lib", "generated-pages.js")]);

function collect(dir, files) {
    if (!fs.existsSync(dir)) {
        return files;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "node_modules") {
                collect(full, files);
            }
        } else if (entry.name.endsWith(".js") && !skipped.has(path.relative(root, full))) {
            files.push(full);
        }
    }
    return files;
}

const files = folders.flatMap(folder => collect(path.join(root, folder), []));
files.push(path.join(root, "eslint.config.js"));
let failures = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
        failures++;
        process.stderr.write(`${path.relative(root, file)}\n${result.stderr}\n`);
    }
}
if (failures > 0) {
    console.error(`Errori di sintassi in ${failures} file su ${files.length}.`);
    process.exit(1);
}
console.log(`Sintassi OK in ${files.length} file.`);
