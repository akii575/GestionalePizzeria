const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const staticDirectory = path.join(root, "src", "main", "resources", "static");
const source = fs.readFileSync(path.join(staticDirectory, "sw.js"), "utf8");
const built = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8");

test("copy-static substitutes the version token and precaches static assets", () => {
    assert.match(source, /__CACHE_VERSION__/);
    assert.match(built, /const CACHE_NAME = "civico7-v[0-9a-f]{12}";/);
    assert.doesNotMatch(built, /__CACHE_VERSION__|__PRECACHE_URLS__/);

    const precache = JSON.parse(built.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/)[1]);
    assert.ok(precache.some(url => url.endsWith(".css")));
    assert.ok(precache.some(url => url.endsWith(".js")));
    assert.ok(precache.some(url => url.startsWith("/fonts/") && url.endsWith(".woff2")));
    assert.ok(precache.some(url => url.startsWith("/icons/")));
    assert.ok(precache.includes("/manifest.webmanifest"));
    assert.equal(precache.some(url => url.startsWith("/api/")), false);
});

test("service worker does not intercept API requests or non-GET requests", () => {
    const listeners = new Map();
    let networkCalls = 0;
    const self = {
        location: { origin: "https://civico7.example" },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        }
    };
    vm.runInNewContext(built, {
        self,
        URL,
        caches: {},
        fetch() {
            networkCalls++;
            return Promise.reject(new Error("unexpected network fetch"));
        },
        console
    });

    const fetchHandler = listeners.get("fetch");
    for (const request of [
        { method: "GET", url: "https://civico7.example/api/ordini", mode: "cors" },
        { method: "POST", url: "https://civico7.example/ordini.html", mode: "navigate" },
        { method: "GET", url: "https://identitytoolkit.googleapis.com/token", mode: "cors" },
        { method: "GET", url: "http://127.0.0.1:8765/status", mode: "cors" }
    ]) {
        let intercepted = false;
        fetchHandler({
            request,
            respondWith() {
                intercepted = true;
            },
            waitUntil() {}
        });
        assert.equal(intercepted, false, request.url);
    }
    assert.equal(networkCalls, 0);
});

test("Vercel serves the service worker with update and root-scope headers", () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    const serviceWorkerHeaders = config.headers.find(header => header.source === "/sw.js")?.headers;
    assert.ok(serviceWorkerHeaders);
    assert.equal(serviceWorkerHeaders.find(header => header.key === "Cache-Control").value, "no-cache");
    assert.equal(serviceWorkerHeaders.find(header => header.key === "Service-Worker-Allowed").value, "/");
});

test("all pages load nav.js for offline status and service worker registration", () => {
    const pages = fs.readdirSync(staticDirectory).filter(file => file.endsWith(".html"));
    for (const page of pages) {
        assert.match(fs.readFileSync(path.join(staticDirectory, page), "utf8"), /<script src="\/nav\.js"><\/script>/, page);
    }
    const navigation = fs.readFileSync(path.join(staticDirectory, "nav.js"), "utf8");
    assert.match(navigation, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
    assert.match(navigation, /Nessuna connessione internet — le comande non vengono inviate/);
    assert.match(navigation, /Connessione tornata/);
    assert.match(navigation, /civico7:online/);
    for (const script of ["gestionale.js", "consegne.js", "printer-status.js"]) {
        assert.match(
            fs.readFileSync(path.join(staticDirectory, script), "utf8"),
            /addEventListener\("civico7:online"/,
            script
        );
    }
});

test("order forms retain their data and show a clear message when offline", () => {
    const orderForm = fs.readFileSync(path.join(staticDirectory, "ordini.js"), "utf8");
    const editForm = fs.readFileSync(path.join(staticDirectory, "modifica.js"), "utf8");
    const offlineMessage = "Comanda NON inviata: manca la connessione. Riprova appena torna internet.";
    assert.ok(orderForm.includes(offlineMessage));
    assert.ok(editForm.includes(offlineMessage));
    assert.match(orderForm, /navigator\.onLine === false/);
    assert.match(orderForm, /errore instanceof TypeError/);
    assert.ok(orderForm.indexOf("stato.righe = [];") > orderForm.indexOf('fetch("/api/ordini"'));
    assert.match(editForm, /pulsante\.disabled = false;[\s\S]*?Comanda NON inviata/);
    for (const file of ["nav.js", "auth-guard.js", "auth-logout.js"]) {
        const logout = fs.readFileSync(path.join(staticDirectory, file), "utf8");
        assert.match(logout, /civico7ClearOfflineCaches|caches\.keys\(\)/, file);
        assert.match(logout, /caches\.delete|civico7ClearOfflineCaches/, file);
    }
    assert.match(
        fs.readFileSync(path.join(staticDirectory, "auth-guard.js"), "utf8"),
        /const networkBanner = document\.querySelector\("\.civico7-network-banner"\);[\s\S]*?if \(networkBanner\) document\.body\.append\(networkBanner\);/
    );
});
