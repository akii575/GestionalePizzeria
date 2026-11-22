const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApiRouter } = require("./api-router-helper");

const routeModules = {
    config: "../lib/handlers/config",
    extra: "../lib/handlers/extra",
    menu: "../lib/handlers/menu",
    "menu-admin": "../lib/handlers/menu-admin",
    "reset-numeri": "../lib/handlers/reset-numeri",
    "auth/logout": "../lib/handlers/auth/logout",
    "auth/session": "../lib/handlers/auth/session",
    "auth/verify": "../lib/handlers/auth/verify",
    consegne: "../lib/handlers/consegne",
    ordini: "../lib/handlers/ordini",
    "ordini/[numero]": "../lib/handlers/ordini/[numero]",
    "pages/[page]": "../lib/handlers/pages/[page]"
};

function installHandler(path, routeName) {
    const handlerPath = require.resolve(path);
    require.cache[handlerPath] = {
        id: handlerPath,
        filename: handlerPath,
        loaded: true,
        exports: (req, res) => res.status(200).json({ route: routeName, query: req.query })
    };
}

function responseFor(router, path, query = {}) {
    return new Promise(resolve => {
        const response = {
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                resolve(this);
                return this;
            }
        };
        void router({ method: "GET", query: { ...query, percorso: path.split("/") } }, response);
    });
}

test("catch-all dispatches every existing route and preserves route parameters", async () => {
    const router = loadApiRouter();
    for (const [route, path] of Object.entries(routeModules)) installHandler(path, route);
    const cases = [
        ["config", "config", {}],
        ["extra", "extra", {}],
        ["menu", "menu", {}],
        ["menu-admin", "menu-admin", {}],
        ["reset-numeri", "reset-numeri", {}],
        ["auth/logout", "auth/logout", {}],
        ["auth/session", "auth/session", {}],
        ["auth/verify", "auth/verify", {}],
        ["consegne", "consegne", {}],
        ["ordini", "ordini", {}],
        ["ordini/000000000012", "ordini/[numero]", { numero: "000000000012" }],
        ["pages/menu.html", "pages/[page]", { page: "menu.html" }]
    ];

    for (const [path, expectedRoute, expectedParameters] of cases) {
        const response = await responseFor(router, path, { filtro: "oggi" });
        assert.equal(response.statusCode, 200, path);
        assert.equal(response.body.route, expectedRoute, path);
        assert.deepEqual(response.body.query, { filtro: "oggi", ...expectedParameters }, path);
    }

    const notFound = await responseFor(router, "missing");
    assert.equal(notFound.statusCode, 404);
    assert.deepEqual(notFound.body, { errore: "Endpoint API non trovato." });
});
