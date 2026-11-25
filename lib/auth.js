const { createHash } = require("node:crypto");
const { getFirebaseServices } = require("./firebase-admin");

const sessionCache = new Map();
const sessionCacheMilliseconds = 60 * 1000;
const maximumSessionCacheEntries = 200;

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

    let sessionCookie;
    try {
        sessionCookie = decodeURIComponent(cookie.slice("__Host-session=".length));
    } catch {
        throw httpError(401, "Sessione non valida o scaduta.");
    }
    const cacheKey = createHash("sha256").update(sessionCookie).digest("hex");
    const now = Date.now();
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.scadeIl > now) {
        return cached.decoded;
    }
    if (cached) sessionCache.delete(cacheKey);

    const { auth } = getFirebaseServices();
    let decoded;
    try {
        decoded = await auth.verifySessionCookie(sessionCookie, true);
    } catch {
        throw httpError(401, "Sessione non valida o scaduta.");
    }
    const verifiedAt = Date.now();
    const expiresAt = Math.min(verifiedAt + sessionCacheMilliseconds, Number(decoded.exp) * 1000);
    if (Number.isFinite(expiresAt) && expiresAt > verifiedAt) {
        while (sessionCache.size >= maximumSessionCacheEntries) {
            sessionCache.delete(sessionCache.keys().next().value);
        }
        sessionCache.set(cacheKey, { decoded, scadeIl: expiresAt });
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

async function requireStaffAccess(req) {
    const decoded = await requireAuthenticatedUser(req);
    if (decoded.admin !== true && decoded.staff !== true) {
        throw httpError(403, "Accesso negato.");
    }
    return decoded;
}

async function requireDeliveryAccess(req) {
    const decoded = await requireAuthenticatedUser(req);
    if (decoded.admin !== true && decoded.staff !== true && decoded.delivery !== true) {
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

module.exports = { httpError, requireAdmin, requireStaffAccess, requireDeliveryAccess, requireSameOrigin };
