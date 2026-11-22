const { api, methodNotAllowed } = require("../api");
const { requireStaffAccess } = require("../auth");
const { getFirebaseServices } = require("../firebase-admin");
const { getMenuData, getMenuVersion } = require("../menu-store");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireStaffAccess(req);
    res.setHeader("Cache-Control", "no-store");
    const { db } = getFirebaseServices();
    const { menu } = await getMenuData(db);
    res.setHeader("X-Menu-Version", String(getMenuVersion(db) ?? 0));
    return res.status(200).json(menu);
});
