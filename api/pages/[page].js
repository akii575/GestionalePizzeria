const pages = require("../../lib/generated-pages");
const { api, methodNotAllowed } = require("../../lib/api");
const { requireAdmin, requireDeliveryAccess } = require("../../lib/auth");

const deniedPage = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accesso negato</title><link rel="stylesheet" href="/theme.css"><body class="accesso-negato"><main><h1>Accesso negato</h1><p>Questo account non è autorizzato.</p><button id="logout" type="button">Esci</button></main><script src="/auth-logout.js"></script></body></html>`;

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    let user;
    try {
        const pageName = req.query.page || "index.html";
        user = pageName === "consegne.html"
            ? await requireDeliveryAccess(req)
            : await requireAdmin(req);
    } catch (error) {
        if (error.statusCode === 401) {
            res.setHeader("Cache-Control", "no-store");
            return res.redirect(302, "/login.html");
        }
        if (error.statusCode === 403) {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(403).send(deniedPage);
        }
        throw error;
    }
    const page = pages[req.query.page ? `/${req.query.page}` : "/"];
    if (!page) {
        return res.status(404).send("Pagina non trovata.");
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (user.email) res.setHeader("X-Authenticated-User", user.email);
    return res.status(200).send(page);
});
