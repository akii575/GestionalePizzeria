// Hook PostToolUse: formatta con Prettier il file appena modificato da Claude.
// Cross-platform (Windows incluso): invoca prettier.cjs con lo stesso node, senza shell né .cmd.
// Non blocca mai Claude: in caso di problemi esce comunque con codice 0.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, "..", ".."));
const prettierBin = path.join(projectDir, "node_modules", "prettier", "bin", "prettier.cjs");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
    raw += chunk;
});
process.stdin.on("end", () => {
    try {
        const input = JSON.parse(raw.replace(new RegExp("^\uFEFF"), "") || "{}");
        const filePath = input.tool_input && (input.tool_input.file_path || input.tool_input.notebook_path);
        if (!filePath || !fs.existsSync(prettierBin)) {
            return;
        }
        const absolute = path.resolve(projectDir, filePath);
        const relative = path.relative(projectDir, absolute);
        if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
            return;
        }
        // --ignore-unknown salta Java, .bat, .ps1 ecc.; .prettierignore esclude i file generati.
        const result = spawnSync(process.execPath, [prettierBin, "--write", "--ignore-unknown", "--log-level", "warn", absolute], {
            cwd: projectDir,
            encoding: "utf8",
            timeout: 20000
        });
        if (result.status !== 0 && result.stderr) {
            process.stderr.write(`Prettier non ha formattato ${relative}: ${result.stderr}`);
        }
    } catch (error) {
        process.stderr.write(`Hook format: ${error.message}\n`);
    }
});
