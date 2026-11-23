const CACHE_NAME = "civico7-v__CACHE_VERSION__";
const PRECACHE_URLS = "__PRECACHE_URLS__";
const PAGE_PATHS = new Set([
    "/",
    "/index.html",
    "/ordini.html",
    "/gestionale.html",
    "/consegne.html",
    "/ritiri.html",
    "/banco.html",
    "/tavoli.html",
    "/menu.html",
    "/login.html"
]);

function isPageNavigation(request, url) {
    return request.mode === "navigate" && PAGE_PATHS.has(url.pathname);
}

function isStaticAsset(url) {
    return url.pathname === "/manifest.webmanifest"
        || /\.(?:css|js|woff2?|png|jpe?g|svg|ico|webp)$/i.test(url.pathname);
}

function offlinePage() {
    return new Response(
        "<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Offline | CIVICO7</title><style>body{margin:0;padding:24px;font:16px sans-serif;color:#1b2b25;background:#f3f6fa}main{max-width:420px;margin:15vh auto;padding:24px;border-radius:16px;background:#fff;text-align:center}button{min-height:48px;padding:0 20px;border:0;border-radius:12px;background:#1a5ea9;color:#fff;font:inherit;font-weight:600}</style><main><p>Nessuna connessione. Riprova appena torna internet.</p><button id=\"retry\" type=\"button\">Riprova</button></main><script>document.getElementById(\"retry\").addEventListener(\"click\",()=>location.reload())</script></html>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
}

async function cachedResponse(request) {
    try {
        return await (await caches.open(CACHE_NAME)).match(request);
    } catch (error) {
        console.error("Service worker cache read failed:", error);
        return null;
    }
}

async function handlePageRequest(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    let response;
    try {
        response = await fetch(request, { cache: "no-cache", signal: controller.signal });
    } catch {
        return (await cachedResponse(request)) || offlinePage();
    } finally {
        clearTimeout(timeout);
    }

    if (response.status === 200 && !response.redirected) {
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        } catch (error) {
            console.error("Service worker page cache write failed:", error);
        }
    }
    if (response.status >= 500) return (await cachedResponse(request)) || response;
    return response;
}

function handleStaticAsset(event) {
    const request = event.request;
    const cachePromise = caches.open(CACHE_NAME).catch(error => {
        console.error("Service worker cache open failed:", error);
        return null;
    });
    const cachedPromise = cachePromise
        .then(cache => cache ? cache.match(request) : null)
        .catch(error => {
            console.error("Service worker cache read failed:", error);
            return null;
        });
    const networkPromise = fetch(request, { cache: "no-cache" }).then(async response => {
        if (response.status === 200 && !response.redirected) {
            const cache = await cachePromise;
            if (cache) {
                try {
                    await cache.put(request, response.clone());
                } catch (error) {
                    console.error("Service worker asset cache write failed:", error);
                }
            }
        }
        return response;
    });

    event.waitUntil(networkPromise.then(
        () => undefined,
        error => console.warn("Service worker asset refresh failed:", error)
    ));
    event.respondWith(cachedPromise.then(cached => cached || networkPromise));
}

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE_URLS);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
            .filter(name => name.startsWith("civico7-") && name !== CACHE_NAME)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin
        || url.hostname === "127.0.0.1"
        || url.hostname === "identitytoolkit.googleapis.com"
        || url.pathname === "/api"
        || url.pathname.startsWith("/api/")) {
        return;
    }

    if (isPageNavigation(request, url)) {
        event.respondWith(handlePageRequest(request));
        return;
    }
    if (isStaticAsset(url)) handleStaticAsset(event);
});
