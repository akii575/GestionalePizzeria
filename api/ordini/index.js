const { api, methodNotAllowed } = require("../../lib/api");
const { requireAdmin, requireSameOrigin } = require("../../lib/auth");
const { getFirebaseServices } = require("../../lib/firebase-admin");
const { prepareOrder, publicOrder } = require("../../lib/orders");

module.exports = api(async (req, res) => {
    await requireAdmin(req);
    const { db } = getFirebaseServices();
    const orders = db.collection("orders");

    if (req.method === "GET") {
        res.setHeader("Cache-Control", "no-store");
        const snapshot = await orders.orderBy("numero", "desc").get();
        return res.status(200).json(snapshot.docs.map(document => publicOrder(document.data())));
    }
    if (req.method === "POST") {
        requireSameOrigin(req);
        const prepared = prepareOrder(req.body);
        const counter = db.collection("metadata").doc("orderCounter");
        const order = await db.runTransaction(async transaction => {
            const counterSnapshot = await transaction.get(counter);
            const numero = (counterSnapshot.exists ? counterSnapshot.data().value : 0) + 1;
            const now = new Date().toISOString();
            const saved = { ...prepared, numero, dataOra: now };
            transaction.set(counter, { value: numero });
            transaction.set(orders.doc(String(numero)), saved);
            return saved;
        });
        return res.status(201).json(publicOrder(order));
    }
    return methodNotAllowed(res, ["GET", "POST"]);
});
