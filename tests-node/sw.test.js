const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const staticDirectory = path.join(root, "src", "main", "resources", "static");
const source = fs.readFileSync(path.join(staticDirectory, "sw.js"), "utf8");
const built = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8");

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function createServiceWorker({
    cachedResponse = null,
    fetchImpl,
    setTimer,
    clearTimer,
    cachePut,
    onWaitUntil
} = {}) {
    const listeners = new Map();
    const waitUntilPromises = [];
    const cacheOperations = [];
    let cacheValue = cachedResponse;
    let navigationPreloadEnabled = 0;
    const cache = {
        async match() {
            return cacheValue;
        },
        async put(request, response) {
            cacheOperations.push({ type: "put", request, response });
            if (cachePut) {
                await cachePut(request, response);
            }
            cacheValue = response;
        },
        async delete(request) {
            cacheOperations.push({ type: "delete", request });
            cacheValue = null;
            return true;
        }
    };
    const self = {
        location: { origin: "https://civico7.example" },
        registration: {
            navigationPreload: {
                async enable() {
                    navigationPreloadEnabled++;
                }
            }
        },
        clients: { claim: async () => {} },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        }
    };
    const serviceWorkerContext = {
        self,
        URL,
        Response,
        caches: {
            open: async () => cache,
            keys: async () => [],
            delete: async () => true
        },
        fetch: fetchImpl || (async () => {
            throw new Error("unexpected network fetch");
        }),
        setTimeout: setTimer || setTimeout,
        clearTimeout: clearTimer || clearTimeout,
        console
    };
    vm.runInNewContext(built, serviceWorkerContext);

    return {
        cacheOperations,
        get cacheValue() { return cacheValue; },
        dispatchFetch(request, preloadResponse) {
            let responsePromise;
            const event = {
                request,
                preloadResponse,
                respondWith(response) {
                    responsePromise = Promise.resolve(response);
                },
                waitUntil(promise) {
                    waitUntilPromises.push(Promise.resolve(promise));
                    if (onWaitUntil) onWaitUntil();
                }
            };
            listeners.get("fetch")(event);
            return responsePromise;
        },
        listeners,
        get navigationPreloadEnabled() { return navigationPreloadEnabled; },
        waitUntilPromises
    };
}

function pageResponse(body, { status = 200, redirected = false, url = "https://civico7.example/tavoli.html" } = {}) {
    return {
        body,
        status,
        redirected,
        url,
        clone() {
            return pageResponse(body, { status, redirected, url });
        }
    };
}

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

test("activate enables navigation preload when supported", async () => {
    const worker = createServiceWorker();
    let activation;
    worker.listeners.get("activate")({
        waitUntil(promise) {
            activation = promise;
        }
    });

    await activation;
    assert.equal(worker.navigationPreloadEnabled, 1);
});

test("cached pages respond before revalidation and are refreshed inside waitUntil", async () => {
    const cached = pageResponse("cached");
    const refreshed = pageResponse("refreshed");
    const preload = deferred();
    const worker = createServiceWorker({ cachedResponse: cached });
    const request = { method: "GET", url: "https://civico7.example/tavoli.html", mode: "navigate" };
    const responsePromise = worker.dispatchFetch(request, preload.promise);

    assert.equal(await responsePromise, cached);
    assert.equal(worker.cacheOperations.length, 0);

    preload.resolve(refreshed);
    await Promise.all(worker.waitUntilPromises);
    assert.equal(worker.cacheOperations[0].type, "put");
    assert.equal(worker.cacheOperations[0].request, request);
    assert.equal(worker.cacheValue.body, "refreshed");
});

test("uncached navigation uses preload or a bare fetch and cache writes do not delay its response", async () => {
    const request = { method: "GET", url: "https://civico7.example/tavoli.html", mode: "navigate" };
    const networkResponse = pageResponse("network");
    const cacheWrite = deferred();
    const fetchArguments = [];
    let waitUntilCalled = false;
    const worker = createServiceWorker({
        fetchImpl: async (...args) => {
            fetchArguments.push(args);
            return networkResponse;
        },
        cachePut() {
            assert.equal(waitUntilCalled, true);
            return cacheWrite.promise;
        },
        onWaitUntil() {
            waitUntilCalled = true;
        }
    });
    const responsePromise = worker.dispatchFetch(request, Promise.resolve(undefined));

    assert.equal(await responsePromise, networkResponse);
    assert.equal(fetchArguments.length, 1);
    assert.equal(fetchArguments[0].length, 1);
    assert.equal(fetchArguments[0][0], request);
    assert.equal(worker.cacheOperations[0].type, "put");
    cacheWrite.resolve();
    await Promise.all(worker.waitUntilPromises);
});

test("a redirect to login removes the cached page", async () => {
    const request = { method: "GET", url: "https://civico7.example/tavoli.html", mode: "navigate" };
    const worker = createServiceWorker({ cachedResponse: pageResponse("cached") });
    const loginRedirect = pageResponse("login", {
        redirected: true,
        url: "https://civico7.example/login.html"
    });
    const responsePromise = worker.dispatchFetch(request, Promise.resolve(loginRedirect));

    assert.equal((await responsePromise).body, "cached");
    await Promise.all(worker.waitUntilPromises);
    assert.deepEqual(worker.cacheOperations.map(operation => operation.type), ["delete"]);
    assert.equal(worker.cacheValue, null);
});

test("uncached navigation falls back to the offline page after 2.5 seconds", async () => {
    const timers = [];
    const worker = createServiceWorker({
        setTimer(callback, delay) {
            const timer = { callback, delay };
            timers.push(timer);
            return timer;
        },
        clearTimer() {}
    });
    const request = { method: "GET", url: "https://civico7.example/tavoli.html", mode: "navigate" };
    const responsePromise = worker.dispatchFetch(request, new Promise(() => {}));

    await new Promise(resolve => setImmediate(resolve));
    const timeout = timers.find(timer => timer.delay === 2500);
    assert.ok(timeout);
    timeout.callback();
    const response = await responsePromise;
    assert.equal(response.status, 503);
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
        if (page === "modifica.html") {
            assert.match(fs.readFileSync(path.join(staticDirectory, page), "utf8"), /src="\/modifica-redirect\.js"/);
            continue;
        }
        assert.match(fs.readFileSync(path.join(staticDirectory, page), "utf8"), /<script src="\/nav\.js"><\/script>/, page);
    }
    const navigation = fs.readFileSync(path.join(staticDirectory, "nav.js"), "utf8");
    assert.match(navigation, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
    assert.match(navigation, /Nessuna connessione internet — le comande non vengono inviate/);
    assert.match(navigation, /Connessione tornata/);
    assert.match(navigation, /civico7:online/);
    assert.doesNotMatch(source, /"\/modifica\.html"/);
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
    const newOrderOfflineMessage = "Comanda NON inviata: manca la connessione. Riprova appena torna internet.";
    const editOfflineMessage = "Modifiche NON salvate: manca la connessione. Riprova appena torna internet.";
    assert.ok(orderForm.includes(newOrderOfflineMessage));
    assert.ok(orderForm.includes(editOfflineMessage));
    assert.match(orderForm, /navigator\.onLine === false/);
    assert.match(orderForm, /errore instanceof TypeError/);
    assert.ok(orderForm.indexOf("stato.righe = [];") > orderForm.indexOf('fetch("/api/ordini"'));
    assert.match(orderForm, /fetch\(`\/api\/ordini\/\$\{numeroModifica\}`,[\s\S]*?method: "PUT"/);
    assert.match(orderForm, /Modifiche NON salvate:[\s\S]*?invia\.disabled = false;/);
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
