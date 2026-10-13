const { api, methodNotAllowed } = require("../../lib/api");
const { httpError, requireAdmin, requireSameOrigin } = require("../../lib/auth");
const { getFirebaseServices } = require("../../lib/firebase-admin");
const { prepareOrder, publicOrder } = require("../../lib/orders");

function orderNumber(req) {
    const value = Number(req.query.numero);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw httpError(400, "Numero ordine non valido.");
    }
    return value;
}

module.exports = api(async (req, res) => {
    await requireAdmin(req);
    const numero = orderNumber(req);
    const { db } = getFirebaseServices();
    const order = db.collection("orders").doc(String(numero));

    if (req.method === "PUT") {
        requireSameOrigin(req);
        const prepared = prepareOrder(req.body);
        const saved = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const updated = { ...prepared, numero, dataOra: snapshot.data().dataOra };
            transaction.set(order, updated);
            return updated;
        });
        return res.status(200).json(publicOrder(saved));
    }
    if (req.method === "DELETE") {
        requireSameOrigin(req);
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            transaction.delete(order);
        });
        return res.status(204).end();
    }
    return methodNotAllowed(res, ["PUT", "DELETE"]);
});
