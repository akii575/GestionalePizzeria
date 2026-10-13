function sendError(res, error) {
    if (error.statusCode) {
        return res.status(error.statusCode).json({ errore: error.message });
    }
    console.error("API request failed:", error.code || error.name || "unknown error");
    return res.status(500).json({ errore: "Errore interno del server." });
}

function api(handler) {
    return async function wrappedHandler(req, res) {
        try {
            await handler(req, res);
        } catch (error) {
            sendError(res, error);
        }
    };
}

function methodNotAllowed(res, allowed) {
    res.setHeader("Allow", allowed.join(", "));
    return res.status(405).json({ errore: "Metodo non consentito." });
}

module.exports = { api, methodNotAllowed };
