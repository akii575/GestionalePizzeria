const { api, methodNotAllowed } = require("../lib/api");
const { requireStaffAccess } = require("../lib/auth");
const { extras } = require("../lib/orders");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireStaffAccess(req);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(extras);
});
