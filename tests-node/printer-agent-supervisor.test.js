const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendRotatingLog } = require("../scripts/printer-agent-supervisor");

test("printer supervisor rotates logs when the configured size is reached", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "printer-supervisor-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const logPath = path.join(directory, "printer-agent.out.log");

    appendRotatingLog(logPath, "first entry", 60);
    appendRotatingLog(logPath, "second entry", 60);

    assert.match(fs.readFileSync(`${logPath}.1`, "utf8"), /first entry/);
    assert.match(fs.readFileSync(logPath, "utf8"), /second entry/);
});
