const { api, methodNotAllowed } = require("../../lib/api");
const { httpError, requireAdmin, requireSameOrigin } = require("../../lib/auth");
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
        const control = db.collection("metadata").doc("printerControl");
        const order = await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(control);
            if (controlSnapshot.data()?.paused) {
                throw httpError(409, "La coda di stampa e' in manutenzione. Riprova tra poco.");
            }
            const counterSnapshot = await transaction.get(counter);
            const numero = (counterSnapshot.exists ? counterSnapshot.data().value : 0) + 1;
            const now = new Date().toISOString();
            const saved = {
                ...prepared,
                numero,
                dataOra: now,
                stampaCompletata: false,
                stampaInCoda: true,
                messaggioStampa: "Comanda in coda per la stampa automatica."
            };
            transaction.set(counter, { value: numero });
            transaction.set(orders.doc(String(numero)), saved);
            transaction.set(db.collection("printerJobs").doc(String(numero).padStart(12, "0")), {
                numero,
                status: "queued",
                createdAt: now,
                attemptCount: 0,
                printedPrinters: []
            });
            return saved;
        });
        return res.status(201).json(publicOrder(order));
    }
    return methodNotAllowed(res, ["GET", "POST"]);
});
