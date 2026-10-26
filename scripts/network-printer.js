const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const PRINTER_CONFIG_PATH = path.join(__dirname, "..", "data", "printer-config.json");
const DEFAULT_PORT = 9100;
const CONNECT_TIMEOUT_MILLISECONDS = 3000;

function isPrivateIpv4(host) {
    if (!net.isIPv4(host)) return false;
    const [first, second] = host.split(".").map(Number);
    return first === 10
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168);
}

function validatePrinterConfig(config) {
    const host = typeof config?.host === "string" ? config.host.trim() : "";
    if (!isPrivateIpv4(host)) {
        throw new Error("L'indirizzo della stampante deve essere un IPv4 privato della rete locale.");
    }
    if (config.port !== undefined && Number(config.port) !== DEFAULT_PORT) {
        throw new Error(`La stampante deve usare la porta ESC/POS ${DEFAULT_PORT}.`);
    }
    return { host, port: DEFAULT_PORT };
}

function loadPrinterConfig({ env = process.env, configPath = PRINTER_CONFIG_PATH } = {}) {
    if (env.PRINTER_HOST) {
        return validatePrinterConfig({
            host: env.PRINTER_HOST,
            port: env.PRINTER_PORT || DEFAULT_PORT
        });
    }
    if (!fs.existsSync(configPath)) {
        throw new Error("Manca data/printer-config.json. Esegui installa-stampa-automatica.bat.");
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
    const online = await checkTcpConnection(config.host, config.port);
    return [{
        name: `Epson Ethernet (${config.host})`,
        host: config.host,
        port: config.port,
        isDefault: true,
        isVirtual: false,
        status: online ? "Normal" : "Offline",
        state: online ? "ready" : "unavailable"
    }];
}

function toPrinterText(value) {
    return String(value)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7e]/g, "?");
}

function encodeEscPosReceipt(receipt) {
    const commands = [];
    const text = value => commands.push(Buffer.from(toPrinterText(value), "ascii"));
    const bytes = (...values) => commands.push(Buffer.from(values));
    const lineFeed = () => bytes(0x0a);
    const normalText = () => {
        bytes(0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x1b, 0x61, 0);
    };

    bytes(0x1b, 0x40);
    for (const line of String(receipt).split(/\r?\n/)) {
        const section = /^@@SECTION:(.*)@@$/.exec(line);
        if (section) {
            bytes(0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11);
            text(section[1]);
            lineFeed();
            normalText();
            text("----------------------------");
            lineFeed();
            continue;
        }
        if (line.startsWith("COMANDA #")) {
            bytes(0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11);
            text(line);
            lineFeed();
            normalText();
            continue;
        }
        if (line.startsWith("TOTALE")) bytes(0x1b, 0x45, 1);
        text(line);
        lineFeed();
        if (line.startsWith("TOTALE")) bytes(0x1b, 0x45, 0);
    }
    bytes(0x0a, 0x0a, 0x1d, 0x56, 0x41, 0x03);
    return Buffer.concat(commands);
}

function sendEscPosReceipt(printer, receipt, timeout = 15000) {
    const config = validatePrinterConfig(printer);
    const payload = encodeEscPosReceipt(receipt);
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(config);
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
    encodeEscPosReceipt,
    isPrivateIpv4,
    listNetworkPrinters,
    loadPrinterConfig,
    sendEscPosReceipt,
    validatePrinterConfig
};
