const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const {
    checkTcpConnection,
    encodeEscPosReceipt,
    isPrivateIpv4,
    validatePrinterConfig
} = require("../scripts/network-printer");

test("only private IPv4 addresses are accepted for the local printer", () => {
    assert.equal(isPrivateIpv4("192.168.1.222"), true);
    assert.equal(isPrivateIpv4("10.0.0.15"), true);
    assert.equal(isPrivateIpv4("172.20.1.5"), true);
    assert.equal(isPrivateIpv4("8.8.8.8"), false);
    assert.equal(isPrivateIpv4("printer.example.com"), false);
    assert.throws(() => validatePrinterConfig({ host: "8.8.8.8" }), /IPv4 privato/);
});

test("the network printer uses the Epson raw ESC/POS port", () => {
    assert.deepEqual(validatePrinterConfig({ host: "192.168.1.222" }), {
        printers: [{ name: "Stampante", host: "192.168.1.222", port: 9100, paperWidthMm: 80 }],
        port: 9100
    });
    assert.deepEqual(validatePrinterConfig({
        printers: [
            { name: "Cucina", host: "192.168.1.222", paperWidthMm: 58 },
            { name: "Sala", host: "192.168.1.223" }
        ],
        port: 9100
    }), {
        printers: [
            { name: "Cucina", host: "192.168.1.222", port: 9100, paperWidthMm: 58 },
            { name: "Sala", host: "192.168.1.223", port: 9100, paperWidthMm: 80 }
        ],
        port: 9100
    });
    assert.throws(() => validatePrinterConfig({
        printers: [
            { name: "Cucina", host: "192.168.1.222" },
            { name: "Sala", host: "192.168.1.222" }
        ]
    }), /indirizzo IP univoci/);
    assert.throws(
        () => validatePrinterConfig({ host: "192.168.1.222", port: 443 }),
        /porta ESC\/POS 9100/
    );
    assert.throws(
        () => validatePrinterConfig({ printers: [{ name: "Cucina", host: "192.168.1.222", paperWidthMm: 76 }] }),
        /larghezza carta.*58 o 80 mm/
    );
});

test("ESC/POS receipt contains readable section commands and a partial cut", () => {
    const payload = encodeEscPosReceipt([
        "=".repeat(24),
        "@@BIG:#42@@",
        "@@TITLE:CONSEGNA - POS@@",
        "@@SECTION:PIZZE@@",
        "@@ITEM:1X PIU BUFALA@@",
        "@@SMALL:  POMODORO, MOZZARELLA@@",
        "@@BIG:ORARIO 22:00@@",
        "@@BOLD:VIA ROMA 12@@",
        "NOTE:",
        "TOTALE EUR 9,50"
    ].join("\r\n"));
    const text = payload.toString("ascii");

    assert.ok(payload.subarray(0, 2).equals(Buffer.from([0x1b, 0x40])));
    assert.match(text, /#42/);
    assert.match(text, /PIZZE/);
    assert.ok(text.includes("-".repeat(24)));
    assert.match(text, /PIU BUFALA/);
    assert.match(text, /POMODORO, MOZZARELLA/);
    assert.match(text, /CONSEGNA/);
    assert.match(text, /ORARIO 22:00/);
    assert.match(text, /VIA ROMA 12/);
    assert.ok(payload.includes(Buffer.from([0x1b, 0x45, 1])));
    assert.ok(payload.includes(Buffer.from([0x1b, 0x45, 0, 0x1d, 0x21, 0x11, 0x1b, 0x61, 0])));
    assert.ok(payload.includes(Buffer.from([0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11])));
    assert.ok(payload.includes(Buffer.from([0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x22])));
    assert.ok(payload.includes(Buffer.from([0x1b, 0x45, 0, 0x1d, 0x21, 0x00, 0x1b, 0x61, 0])));
    assert.ok(payload.includes(Buffer.from([0x1b, 0x45, 1])));
    assert.ok(payload.includes(Buffer.from([0x1b, 0x4d, 0x00])));
    assert.equal(payload.includes(Buffer.from([0x1d, 0x21, 0x00])), true);
    assert.doesNotMatch(text, /COMANDA #12/);
    assert.doesNotMatch(text, /@@TITLE/);
    assert.doesNotMatch(text, /@@BIG|@@ITEM|@@SMALL/);
    assert.doesNotMatch(text, /@@SECTION/);
    assert.doesNotMatch(text, /@@BOLD/);
    assert.ok(payload.subarray(-6).equals(Buffer.from([0x0a, 0x0a, 0x1d, 0x56, 0x41, 0x03])));
    assert.equal(payload[payload.length - 1], 3);
});

test("note lines print bold, triple size and left aligned", () => {
    const { encodeEscPosReceipt } = require("../scripts/network-printer");
    const payload = encodeEscPosReceipt(["NOTE:", "@@NOTEBIG:! BEN COTTA@@", "TOTALE EUR 5,00"].join("\r\n"));
    const start = Buffer.from([0x1b, 0x61, 0, 0x1b, 0x45, 1, 0x1d, 0x21, 0x22]);
    const at = payload.indexOf(start);

    assert.ok(at > 0);
    assert.equal(payload.subarray(at + start.length, at + start.length + 11).toString("ascii"), "! BEN COTTA");
    assert.doesNotMatch(payload.toString("ascii"), /@@NOTEBIG/);
});

test("the printer reachability check connects without sending a print job", async t => {
    const server = net.createServer(socket => socket.end());
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(() => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    }));

    const { port } = server.address();
    assert.equal(await checkTcpConnection("127.0.0.1", port), true);
    assert.equal(await checkTcpConnection("127.0.0.1", port + 1, 100), false);
});
