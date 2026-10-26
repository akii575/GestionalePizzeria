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
        host: "192.168.1.222",
        port: 9100
    });
    assert.throws(
        () => validatePrinterConfig({ host: "192.168.1.222", port: 443 }),
        /porta ESC\/POS 9100/
    );
});

test("ESC/POS receipt contains readable section commands and a partial cut", () => {
    const payload = encodeEscPosReceipt([
        "COMANDA #12",
        "@@SECTION:PIZZE@@",
        "1 x Più Bufala",
        "TOTALE EUR 9,50"
    ].join("\r\n"));
    const text = payload.toString("ascii");

    assert.ok(payload.subarray(0, 2).equals(Buffer.from([0x1b, 0x40])));
    assert.match(text, /PIZZE/);
    assert.match(text, /Piu Bufala/);
    assert.doesNotMatch(text, /@@SECTION/);
    assert.ok(payload.subarray(-6).equals(Buffer.from([0x0a, 0x0a, 0x1d, 0x56, 0x41, 0x03])));
    assert.equal(payload[payload.length - 1], 3);
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
