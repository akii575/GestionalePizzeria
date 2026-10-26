const { api, methodNotAllowed } = require("../../lib/api");
const { httpError, requireSameOrigin } = require("../../lib/auth");
const { getFirebaseServices } = require("../../lib/firebase-admin");

const maxAgeSeconds = 5 * 24 * 60 * 60;

module.exports = api(async (req, res) => {
    if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
    }
    requireSameOrigin(req);
    const idToken = req.body && req.body.idToken;
    if (typeof idToken !== "string" || !idToken) {
        throw httpError(400, "Token di accesso mancante.");
    }
    const { auth } = getFirebaseServices();
    let decoded;
    try {
        decoded = await auth.verifyIdToken(idToken, true);
    } catch {
        throw httpError(401, "Credenziali non valide.");
    }
    if (decoded.admin !== true && decoded.delivery !== true) {
        throw httpError(403, "Accesso negato.");
    }
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: maxAgeSeconds * 1000 });
    res.setHeader("Set-Cookie", `__Host-session=${encodeURIComponent(sessionCookie)}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(204).end();
});
