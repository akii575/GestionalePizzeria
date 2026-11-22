const { api, methodNotAllowed } = require("../../api");
const { requireSameOrigin } = require("../../auth");

module.exports = api(async (req, res) => {
    if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
    }
    requireSameOrigin(req);
    res.setHeader("Set-Cookie", "__Host-session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax");
    res.setHeader("Cache-Control", "no-store");
    return res.status(204).end();
});
