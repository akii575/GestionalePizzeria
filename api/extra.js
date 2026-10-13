const { api, methodNotAllowed } = require("../lib/api");
const { requireAdmin } = require("../lib/auth");
const { extras } = require("../lib/orders");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireAdmin(req);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(extras);
});
