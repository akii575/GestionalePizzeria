const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Firestore rules deny every direct client access", () => {
    const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
    const allowRules = rules.match(/^\s*allow .+$/gm) || [];

    assert.deepEqual(allowRules.map(rule => rule.trim()), ["allow read, write: if false;"]);
});
