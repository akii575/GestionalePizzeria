const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scriptsDirectory = path.join(__dirname, "..", "scripts");
const printerScripts = [
    "printer-agent.js",
    "printer-terminal.js",
    "network-printer.js",
    "printer-agent-supervisor.js"
];
const allowedDependency = dependency => (
    dependency.startsWith("node:")
    || /^firebase-admin\/[^/]+$/.test(dependency)
    || dependency === "./network-printer"
    || dependency === "./printer-agent"
    || /^\.\.\/lib\/[^/]+\.json$/.test(dependency)
);

test("printer runtime scripts only require installable dependencies and allowed JSON files", () => {
    for (const fileName of printerScripts) {
        const source = fs.readFileSync(path.join(scriptsDirectory, fileName), "utf8");
        const dependencies = [...source.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g)]
            .map(match => match[1]);

        assert.ok(dependencies.length > 0, `${fileName} should contain static requires`);
        for (const dependency of dependencies) {
            assert.ok(
                allowedDependency(dependency),
                `${fileName} requires unsupported module ${dependency}`
            );
        }
    }
});
