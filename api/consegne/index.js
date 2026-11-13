const { api, methodNotAllowed } = require("../../lib/api");
const { requireDeliveryAccess } = require("../../lib/auth");
const { getFirebaseServices } = require("../../lib/firebase-admin");
const { publicOrder } = require("../../lib/orders");
const { getRomeDayRange } = require("../../lib/rome-day-range");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireDeliveryAccess(req);
    const { db } = getFirebaseServices();
    const { start, end } = getRomeDayRange((req.query || {}).data);
    res.setHeader("Cache-Control", "private, no-store");
    const snapshot = await db.collection("orders")
        .where("tipo", "==", "consegna")
        .where("dataOra", ">=", start)
        .where("dataOra", "<", end)
        .orderBy("dataOra", "asc")
        .orderBy("numero", "desc")
        .get();
    const deliveries = snapshot.docs.map(document => publicOrder(document.data()))
        .filter(order => order.tipo === "consegna")
        .sort((first, second) => second.numero - first.numero);
    return res.status(200).json(deliveries);
});
