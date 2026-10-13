const { api, methodNotAllowed } = require("../lib/api");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    const { FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_APP_ID } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_WEB_API_KEY || !FIREBASE_AUTH_DOMAIN || !FIREBASE_APP_ID) {
        return res.status(503).json({ errore: "Configurazione Firebase incompleta." });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
        apiKey: FIREBASE_WEB_API_KEY,
        authDomain: FIREBASE_AUTH_DOMAIN,
        projectId: FIREBASE_PROJECT_ID,
        appId: FIREBASE_APP_ID
    });
});
