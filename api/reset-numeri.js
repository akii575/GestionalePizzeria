const { api, methodNotAllowed } = require("../lib/api");
const { requireAdmin, requireSameOrigin } = require("../lib/auth");
const { getFirebaseServices } = require("../lib/firebase-admin");

module.exports = api(async (req, res) => {
    if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
    }
    await requireAdmin(req);
    requireSameOrigin(req);
    const { db } = getFirebaseServices();
    const orders = db.collection("orders");
    let snapshot = await orders.limit(450).get();
    while (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(document => batch.delete(document.ref));
        await batch.commit();
        snapshot = await orders.limit(450).get();
    }
    await db.collection("metadata").doc("orderCounter").set({ value: 0 });
    return res.status(200).json({ ok: true });
});
