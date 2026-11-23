const handlerPaths = [
    "../lib/handlers/config",
    "../lib/handlers/clienti",
    "../lib/handlers/extra",
    "../lib/handlers/menu",
    "../lib/handlers/menu-admin",
    "../lib/handlers/reset-numeri",
    "../lib/handlers/stato-serata",
    "../lib/handlers/auth/logout",
    "../lib/handlers/auth/session",
    "../lib/handlers/auth/verify",
    "../lib/handlers/consegne",
    "../lib/handlers/ordini",
    "../lib/handlers/ordini/[numero]",
    "../lib/handlers/pages/[page]"
];

function loadApiRouter() {
    for (const path of handlerPaths) delete require.cache[require.resolve(path)];
    const routerPath = require.resolve("../api/router");
    delete require.cache[routerPath];
    return require(routerPath);
}

function withApiPath(request, path) {
    return {
        ...request,
        query: {
            ...(request.query || {}),
            percorso: path.split("/")
        }
    };
}

function apiRoute(path) {
    const router = loadApiRouter();
    return (request, response) => router(withApiPath(request, path), response);
}

module.exports = { loadApiRouter, withApiPath, apiRoute };
