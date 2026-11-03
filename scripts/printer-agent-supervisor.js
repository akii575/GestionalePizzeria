const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const projectRoot = path.resolve(__dirname, "..");
const agentPath = path.join(__dirname, "printer-terminal.js");
const logDirectory = path.join(projectRoot, "data");
const maximumLogBytes = 5 * 1024 * 1024;
const restartDelayMilliseconds = 5000;
let activeChild = null;
let stopping = false;

function appendRotatingLog(filePath, message, maximumBytes = maximumLogBytes) {
    const backupPath = `${filePath}.1`;
    const line = `${new Date().toISOString()} ${message}\r\n`;
    const lineBytes = Buffer.byteLength(line);
    let currentBytes = 0;
    try {
        currentBytes = fs.statSync(filePath).size;
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }

    if (currentBytes + lineBytes > maximumBytes) {
        try {
            fs.unlinkSync(backupPath);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
        try {
            fs.renameSync(filePath, backupPath);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }

    fs.appendFileSync(filePath, line, { encoding: "utf8" });
}

function record(fileName, message) {
    try {
        appendRotatingLog(path.join(logDirectory, fileName), message);
    } catch (error) {
        process.stderr.write(`Unable to write printer log ${fileName}: ${error.message}\n`);
    }
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function runAgent() {
    fs.mkdirSync(logDirectory, { recursive: true });

    while (!stopping) {
        record("printer-agent.out.log", "Starting printer terminal.");
        let child;
        let outcome;

        try {
            child = spawn(process.execPath, [agentPath], {
                cwd: projectRoot,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"]
            });
            activeChild = child;

            for (const [stream, fileName] of [
                [child.stdout, "printer-agent.out.log"],
                [child.stderr, "printer-agent.err.log"]
            ]) {
                if (!stream) continue;
                const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
                lines.on("line", line => record(fileName, line));
            }

            outcome = await new Promise(resolve => {
                let settled = false;
                const finish = result => {
                    if (settled) return;
                    settled = true;
                    resolve(result);
                };
                child.once("error", error => finish({ code: 1, signal: null, error }));
                child.once("exit", (code, signal) => finish({ code, signal, error: null }));
            });
        } catch (error) {
            outcome = { code: 1, signal: null, error };
        } finally {
            activeChild = null;
        }

        if (outcome.error) {
            record("printer-agent.err.log", `Unable to run printer terminal: ${outcome.error.message}`);
        } else {
            record(
                "printer-agent.err.log",
                `Printer terminal stopped (code=${outcome.code}, signal=${outcome.signal || "none"}).`
            );
        }

        if (!stopping) {
            record("printer-agent.err.log", `Restarting printer terminal in ${restartDelayMilliseconds / 1000} seconds.`);
            await delay(restartDelayMilliseconds);
        }
    }
}

function stopAgent() {
    stopping = true;
    if (activeChild && !activeChild.killed) {
        activeChild.kill();
    }
}

process.once("SIGINT", stopAgent);
process.once("SIGTERM", stopAgent);

if (require.main === module) {
    runAgent().catch(error => {
        record("printer-agent.err.log", `Supervisor stopped unexpectedly: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { appendRotatingLog };
