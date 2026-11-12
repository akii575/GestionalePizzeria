const { api, methodNotAllowed } = require("../../lib/api");
const { requireDeliveryAccess } = require("../../lib/auth");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    const user = await requireDeliveryAccess(req);
    res.setHeader("Cache-Control", "no-store");
    const admin = user.admin === true;
    const staff = !admin && user.staff === true;
    return res.status(200).json({
        admin,
        staff,
        delivery: !admin && !staff && user.delivery === true,
        email: user.email || ""
    });
});
