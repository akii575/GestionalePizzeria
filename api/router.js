const { api } = require("../lib/api");

const routeLoaders = {
    config: () => require("../lib/handlers/config"),
    clienti: () => require("../lib/handlers/clienti"),
    extra: () => require("../lib/handlers/extra"),
    menu: () => require("../lib/handlers/menu"),
    "menu-admin": () => require("../lib/handlers/menu-admin"),
    "reset-numeri": () => require("../lib/handlers/reset-numeri"),
    "stato-serata": () => require("../lib/handlers/stato-serata"),
    "auth/logout": () => require("../lib/handlers/auth/logout"),
    "auth/session": () => require("../lib/handlers/auth/session"),
    "auth/verify": () => require("../lib/handlers/auth/verify"),
    consegne: () => require("../lib/handlers/consegne"),
    ordini: () => require("../lib/handlers/ordini"),
    "ordini/:numero": () => require("../lib/handlers/ordini/[numero]"),
    "pages/:page": () => require("../lib/handlers/pages/[page]")
};

function routeParts(req) {
    const raw = req.query?.percorso;
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw) return raw.split("/").filter(Boolean);
    const pathname = typeof req.url === "string" ? req.url.split("?")[0] : "";
    return pathname.startsWith("/api/")
        ? pathname.slice(5).split("/").filter(Boolean).map(part => decodeURIComponent(part))
        : [];
}

function resolveRoute(parts) {
    if (parts.length === 1) return routeLoaders[parts[0]] || null;
    if (parts.length === 2 && parts[0] === "ordini") return routeLoaders["ordini/:numero"];
    if (parts.length === 2 && parts[0] === "auth") return routeLoaders[`auth/${parts[1]}`] || null;
    if (parts.length === 2 && parts[0] === "pages") return routeLoaders["pages/:page"];
    return null;
}

module.exports = api(async (req, res) => {
    const parts = routeParts(req);
    const loader = resolveRoute(parts);
    if (!loader) {
        return res.status(404).json({ errore: "Endpoint API non trovato." });
    }

    req.query = { ...(req.query || {}) };
    delete req.query.percorso;
    if (parts[0] === "ordini" && parts.length === 2) req.query.numero = parts[1];
    if (parts[0] === "pages" && parts.length === 2) req.query.page = parts[1];
    return loader()(req, res);
});
