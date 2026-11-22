const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("the API directory contains only the shared Vercel router function", () => {
    const apiDirectory = path.join(__dirname, "../api");
    const javascriptFiles = fs.readdirSync(apiDirectory, { recursive: true })
        .filter(file => String(file).endsWith(".js"))
        .map(file => String(file).replace(/\\/g, "/"))
        .sort();

    assert.deepEqual(javascriptFiles, ["router.js"]);
});
