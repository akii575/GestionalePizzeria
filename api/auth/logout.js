const { api, methodNotAllowed } = require("../../lib/api");
const { requireSameOrigin } = require("../../lib/auth");

module.exports = api(async (req, res) => {
    if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
    }
    requireSameOrigin(req);
    res.setHeader("Set-Cookie", "__Host-session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax");
    res.setHeader("Cache-Control", "no-store");
    return res.status(204).end();
});
