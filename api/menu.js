const { api, methodNotAllowed } = require("../lib/api");
const { requireStaffAccess } = require("../lib/auth");
const { getFirebaseServices } = require("../lib/firebase-admin");
const { getMenuData } = require("../lib/menu-store");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireStaffAccess(req);
    res.setHeader("Cache-Control", "no-store");
    const { db } = getFirebaseServices();
    const { menu } = await getMenuData(db);
    return res.status(200).json(menu);
});
