const { api, methodNotAllowed } = require("../../lib/api");
const { requireAdmin } = require("../../lib/auth");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    const user = await requireAdmin(req);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ admin: true, email: user.email || "" });
});
