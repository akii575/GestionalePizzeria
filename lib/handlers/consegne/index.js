const { api, methodNotAllowed } = require("../../api");
const { httpError, requireDeliveryAccess } = require("../../auth");
const { getFirebaseServices } = require("../../firebase-admin");
const { publicOrder } = require("../../orders");
const { getRomeDayRange } = require("../../rome-day-range");

module.exports = api(async (req, res) => {
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireDeliveryAccess(req);
    const { db } = getFirebaseServices();
    const queryParams = req.query || {};
    const requestedVersion = queryParams.versione;
    if (typeof requestedVersion !== "undefined"
            && !(typeof requestedVersion === "number" && Number.isSafeInteger(requestedVersion)
                && requestedVersion >= 0)
            && !(typeof requestedVersion === "string" && /^\d+$/.test(requestedVersion))) {
        throw httpError(400, "La versione degli ordini non e' valida.");
    }
    const parsedVersion = typeof requestedVersion === "undefined"
        ? undefined
        : Number(requestedVersion);
    if (typeof parsedVersion !== "undefined"
            && (!Number.isSafeInteger(parsedVersion) || parsedVersion < 0)) {
        throw httpError(400, "La versione degli ordini non e' valida.");
    }
    const { start, end } = getRomeDayRange(queryParams.data);
    res.setHeader("Cache-Control", "private, no-store");
    const versionSnapshot = await db.collection("metadata").doc("ordersVersion").get();
    const versione = versionSnapshot.exists ? Number(versionSnapshot.data()?.versione || 0) : 0;
    if (!Number.isSafeInteger(versione) || versione < 0) {
        throw httpError(500, "Impossibile leggere la versione degli ordini.");
    }
    if (typeof parsedVersion !== "undefined" && parsedVersion === versione) {
        return res.status(200).json({ invariato: true, versione });
    }
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
    return res.status(200).json({ versione, ordini: deliveries });
});
