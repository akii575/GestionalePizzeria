const { api, methodNotAllowed } = require("../../api");
const { httpError, requireStaffAccess, requireSameOrigin } = require("../../auth");
const { getFirebaseServices } = require("../../firebase-admin");
const { getMenuData } = require("../../menu-store");
const { filterOrdersByType, prepareOrder, publicOrder } = require("../../orders");
const { incrementOrdersVersion } = require("../../orders-version");
const { hasExpiredPrinterQueuePause, isPrinterQueuePaused, jobId } = require("../../printer-jobs");
const { customerProfileForOrder, customerWriteData } = require("../../customers");
const { getRomeDayRange } = require("../../rome-day-range");

module.exports = api(async (req, res) => {
    await requireStaffAccess(req);
    const { db } = getFirebaseServices();
    const orders = db.collection("orders");

    if (req.method === "GET") {
        res.setHeader("Cache-Control", "no-store");
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
        const tipo = queryParams.tipo === "" ? undefined : queryParams.tipo;
        if (typeof tipo !== "undefined") filterOrdersByType([], tipo);
        const versionSnapshot = await db.collection("metadata").doc("ordersVersion").get();
        const versione = versionSnapshot.exists ? Number(versionSnapshot.data()?.versione || 0) : 0;
        if (!Number.isSafeInteger(versione) || versione < 0) {
            throw httpError(500, "Impossibile leggere la versione degli ordini.");
        }
        if (typeof parsedVersion !== "undefined" && parsedVersion === versione) {
            return res.status(200).json({ invariato: true, versione });
        }

        let query = orders.where("dataOra", ">=", start).where("dataOra", "<", end);
        if (typeof tipo !== "undefined") {
            query = tipo === "tavolo"
                ? query.where("tipo", "in", ["tavolo", "sala"])
                : query.where("tipo", "==", tipo);
        }
        const snapshot = await query.orderBy("dataOra", "asc").orderBy("numero", "desc").get();
        const results = snapshot.docs.map(document => publicOrder(document.data()));
        const filtered = typeof tipo === "undefined" ? results : filterOrdersByType(results, tipo);
        filtered.sort((first, second) => Number(second.numero) - Number(first.numero));
        return res.status(200).json({ versione, ordini: filtered });
    }
    if (req.method === "POST") {
        requireSameOrigin(req);
        const prepared = await prepareOrder(req.body, await getMenuData(db));
        const counter = db.collection("metadata").doc("orderCounter");
        const ordersVersion = db.collection("metadata").doc("ordersVersion");
        const control = db.collection("metadata").doc("printerControl");
        const order = await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(control);
            const controlData = controlSnapshot.data();
            if (isPrinterQueuePaused(controlData)) {
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
            if (hasExpiredPrinterQueuePause(controlData)) {
                transaction.set(control, { paused: false });
            }
            transaction.set(counter, { value: numero });
            transaction.set(orders.doc(String(numero)), saved);
            incrementOrdersVersion(transaction, ordersVersion);
            const customer = customerProfileForOrder(saved, now);
            if (customer) {
                transaction.set(
                    db.collection("clienti").doc(customer.telefono),
                    customerWriteData(customer, { incrementOrder: true }),
                    { merge: true }
                );
            }
            transaction.set(db.collection("printerJobs").doc(jobId(numero)), {
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
