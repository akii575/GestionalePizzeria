const { getFirebaseServices } = require("./firebase-admin");

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function requireAuthenticatedUser(req) {
    const cookie = (req.headers.cookie || "").split(";").map(part => part.trim())
        .find(part => part.startsWith("__Host-session="));
    if (!cookie) {
        throw httpError(401, "Autenticazione richiesta.");
    }

    const { auth } = getFirebaseServices();
    let decoded;
    try {
        decoded = await auth.verifySessionCookie(decodeURIComponent(cookie.slice("__Host-session=".length)), true);
    } catch {
        throw httpError(401, "Sessione non valida o scaduta.");
    }
    return decoded;
}

async function requireAdmin(req) {
    const decoded = await requireAuthenticatedUser(req);
    if (decoded.admin !== true) {
        throw httpError(403, "Accesso negato.");
    }
    return decoded;
}

async function requireDeliveryAccess(req) {
    const decoded = await requireAuthenticatedUser(req);
    if (decoded.admin !== true && decoded.delivery !== true) {
        throw httpError(403, "Accesso negato.");
    }
    return decoded;
}

function requireSameOrigin(req) {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin || !host) {
        throw httpError(403, "Origine della richiesta non valida.");
    }
    let originHost;
    try {
        originHost = new URL(origin).host;
    } catch {
        throw httpError(403, "Origine della richiesta non valida.");
    }
    if (originHost !== host) {
        throw httpError(403, "Origine della richiesta non valida.");
    }
}

module.exports = { httpError, requireAdmin, requireDeliveryAccess, requireSameOrigin };
