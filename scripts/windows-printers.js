const { execFile } = require("node:child_process");
const path = require("node:path");

const PRINTER_SCRIPT = path.join(__dirname, "list-printers.ps1");

function listPrinters() {
    return new Promise((resolve, reject) => {
        execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-File", PRINTER_SCRIPT],
            { timeout: 7000, maxBuffer: 64 * 1024, windowsHide: true },
            (error, stdout) => {
                if (error) {
                    reject(new Error(error.code || "printer_query_failed"));
                    return;
                }
                try {
                    const printers = JSON.parse(stdout.trim() || "[]");
                    if (!Array.isArray(printers)) {
                        throw new Error("invalid_printer_response");
                    }
                    resolve(printers.map(normalizePrinter));
                } catch {
                    reject(new Error("invalid_printer_response"));
                }
            }
        );
    });
}

function normalizePrinter(printer) {
    const status = String(printer.status ?? "unknown");
    const normalizedStatus = status.toLowerCase();
    let state = "unknown";
    if (/offline|stopped|error|paper.?out|paper.?jam|not.?available|no.?toner|door.?open/.test(normalizedStatus)) {
        state = "unavailable";
    } else if (/printing|busy|processing|warming.?up/.test(normalizedStatus)) {
        state = "busy";
    } else if (/normal|idle|ready/.test(normalizedStatus) || normalizedStatus === "3") {
        state = "ready";
    }

    return {
        name: String(printer.name || "Stampante senza nome"),
        isDefault: printer.isDefault === true,
        isVirtual: printer.isVirtual === true,
        status,
        state
    };
}

module.exports = { listPrinters, normalizePrinter };
