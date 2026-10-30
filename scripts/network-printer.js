const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const PRINTER_CONFIG_PATH = path.join(__dirname, "..", "data", "printer-config.json");
const DEFAULT_PORT = 9100;
const DEFAULT_RECEIPT_WIDTH = 24;
const CONNECT_TIMEOUT_MILLISECONDS = 3000;

function isPrivateIpv4(host) {
    if (!net.isIPv4(host)) return false;
    const [first, second] = host.split(".").map(Number);
    return first === 10
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168);
}

function validatePrinterConfig(config) {
    if (!config || typeof config !== "object") {
        throw new Error("La configurazione delle stampanti non e' valida.");
    }
    if (config.port !== undefined && Number(config.port) !== DEFAULT_PORT) {
        throw new Error(`La stampante deve usare la porta ESC/POS ${DEFAULT_PORT}.`);
    }
    const entries = Array.isArray(config.printers)
        ? config.printers
        : Array.isArray(config.hosts)
            ? config.hosts
            : typeof config.host === "string"
                ? [config]
                : [];
    if (entries.length === 0) {
        throw new Error("Configura almeno una stampante di rete.");
    }
    const names = new Set();
    const hosts = new Set();
    const printers = entries.map((entry, index) => {
        const host = typeof entry === "string"
            ? entry.trim()
            : entry && typeof entry.host === "string" ? entry.host.trim() : "";
        const name = entry && typeof entry === "object"
                && typeof entry.name === "string" && entry.name.trim()
            ? entry.name.trim()
            : entries.length === 1 ? "Stampante" : `Stampante ${index + 1}`;
        const port = entry && typeof entry === "object" && entry.port !== undefined
            ? Number(entry.port)
            : DEFAULT_PORT;
        const paperWidthMm = entry && typeof entry === "object" && entry.paperWidthMm !== undefined
            ? Number(entry.paperWidthMm)
            : 80;
        if (!isPrivateIpv4(host)) {
            throw new Error(`L'indirizzo della stampante ${name} deve essere un IPv4 privato della rete locale.`);
        }
        if (port !== DEFAULT_PORT) {
            throw new Error(`La stampante deve usare la porta ESC/POS ${DEFAULT_PORT}.`);
        }
        if (![58, 80].includes(paperWidthMm)) {
            throw new Error(`La larghezza carta della stampante ${name} deve essere 58 o 80 mm.`);
        }
        if (names.has(name) || hosts.has(host)) {
            throw new Error("Ogni stampante deve avere un nome e un indirizzo IP univoci.");
        }
        names.add(name);
        hosts.add(host);
        return { name, host, port: DEFAULT_PORT, paperWidthMm };
    });
    return { printers, port: DEFAULT_PORT };
}

function loadPrinterConfig({ env = process.env, configPath = PRINTER_CONFIG_PATH } = {}) {
    if (env.PRINTER_HOST) {
        return validatePrinterConfig({
            printers: [{ name: "Stampante", host: env.PRINTER_HOST }],
            port: env.PRINTER_PORT || DEFAULT_PORT
        });
    }
    if (!fs.existsSync(configPath)) {
        throw new Error("Manca data/printer-config.json. Configura le stampanti Epson sul PC.");
    }
    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
        throw new Error("La configurazione della stampante non contiene JSON valido.");
    }
    return validatePrinterConfig(config);
}

function checkTcpConnection(host, port = DEFAULT_PORT, timeout = CONNECT_TIMEOUT_MILLISECONDS) {
    return new Promise(resolve => {
        const socket = net.createConnection({ host, port });
        let settled = false;
        const finish = reachable => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(reachable);
        };
        socket.setTimeout(timeout, () => finish(false));
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
    });
}

async function listNetworkPrinters(config = loadPrinterConfig()) {
    const validated = validatePrinterConfig(config);
    return Promise.all(validated.printers.map(async (printer, index) => {
        const online = await checkTcpConnection(printer.host, printer.port);
        return {
            ...printer,
            isDefault: index === 0,
            isVirtual: false,
            status: online ? "Normal" : "Offline",
            state: online ? "ready" : "unavailable"
        };
    }));
}

function toPrinterText(value) {
    return String(value)
        .toLocaleUpperCase("it-IT")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7e]/g, "");
}

function encodeEscPosReceipt(receipt) {
    const commands = [];
    const text = value => commands.push(Buffer.from(toPrinterText(value), "ascii"));
    const bytes = (...values) => commands.push(Buffer.from(values));
    const lineFeed = () => bytes(0x0a);
    const receiptLines = String(receipt).split(/\r?\n/);
    const dividerWidth = receiptLines.find(line => /^[-=]+$/.test(line))?.length
        || DEFAULT_RECEIPT_WIDTH;
    const normalText = () => {
        bytes(0x1b, 0x45, 0, 0x1d, 0x21, 0x11, 0x1b, 0x61, 0);
    };

    bytes(0x1b, 0x40);
    bytes(0x1b, 0x4d, 0x00);
    normalText();
    for (const line of receiptLines) {
        const section = /^@@SECTION:(.*)@@$/.exec(line);
        const title = /^@@TITLE:(.*)@@$/.exec(line);
        const bold = /^@@BOLD:(.*)@@$/.exec(line);
        if (section) {
            bytes(0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11);
            text(section[1]);
            lineFeed();
            normalText();
            text("-".repeat(dividerWidth));
            lineFeed();
            continue;
        }
        if (title) {
            bytes(0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11);
            text(title[1]);
            lineFeed();
            normalText();
            continue;
        }
        if (bold) {
            bytes(0x1b, 0x45, 1);
            text(bold[1]);
            lineFeed();
            normalText();
            continue;
        }
        if (line === "NOTE:") {
            bytes(0x1b, 0x61, 1, 0x1b, 0x45, 1);
            text(line);
            lineFeed();
            normalText();
            continue;
        }
        const item = /^\d+X /.test(line);
        if (item) bytes(0x1b, 0x45, 1);
        if (line.startsWith("TOTALE")) bytes(0x1b, 0x45, 1);
        text(line);
        lineFeed();
        if (item || line.startsWith("TOTALE")) bytes(0x1b, 0x45, 0);
    }
    bytes(0x0a, 0x0a, 0x1d, 0x56, 0x41, 0x03);
    return Buffer.concat(commands);
}

function sendEscPosReceipt(printer, receipt, timeout = 15000) {
    const config = validatePrinterConfig(printer).printers[0];
    const payload = encodeEscPosReceipt(receipt);
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: config.host, port: config.port });
        let settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (error) reject(error);
            else resolve();
        };
        socket.setTimeout(timeout, () => finish(new Error("printer_connection_timeout")));
        socket.once("connect", () => socket.end(payload));
        socket.once("finish", () => finish());
        socket.once("error", error => finish(new Error(error.code || "printer_connection_failed")));
    });
}

module.exports = {
    checkTcpConnection,
    DEFAULT_RECEIPT_WIDTH,
    encodeEscPosReceipt,
    isPrivateIpv4,
    listNetworkPrinters,
    loadPrinterConfig,
    sendEscPosReceipt,
    validatePrinterConfig
};
