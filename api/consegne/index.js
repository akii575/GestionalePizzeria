const { api, methodNotAllowed } = require("../../lib/api");
const { requireDeliveryAccess } = require("../../lib/auth");
const { getFirebaseServices } = require("../../lib/firebase-admin");
const { publicOrder } = require("../../lib/orders");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireDeliveryAccess(req);
    const { db } = getFirebaseServices();
    const snapshot = await db.collection("orders")
        .where("tipo", "==", "consegna")
        .get();
    res.setHeader("Cache-Control", "private, no-store");
    const deliveries = snapshot.docs.map(document => publicOrder(document.data()))
        .filter(order => order.tipo === "consegna")
        .sort((first, second) => second.numero - first.numero);
    return res.status(200).json(deliveries);
});
