const { api, methodNotAllowed } = require("../api");
const { httpError, requireStaffAccess, requireSameOrigin } = require("../auth");
const { getFirebaseServices } = require("../firebase-admin");
const { normalizeOrderType, publicOrder } = require("../orders");
const { retryFailedPrinterJobs } = require("../printer-jobs");
const { getRomeDayRange } = require("../rome-day-range");

const PRINTER_AGENT_LEASE_MILLISECONDS = 120 * 1000;

function parseOrdersVersion(value) {
    if (typeof value === "undefined") return undefined;
    if (!(typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
        && !(typeof value === "string" && /^\d+$/.test(value))) {
        throw httpError(400, "La versione degli ordini non e' valida.");
    }
    const version = Number(value);
    if (!Number.isSafeInteger(version) || version < 0) {
        throw httpError(400, "La versione degli ordini non e' valida.");
    }
    return version;
}

function leaseMillis(lock) {
    const lease = lock?.leaseUntil;
    if (!lease || typeof lease.toMillis !== "function") return null;
    const value = lease.toMillis();
    return Number.isFinite(value) ? value : null;
}

function orderSummary(orders) {
    const tables = new Set();
    const summary = {
        ordini: orders.length,
        totale: 0,
        tavoli: 0,
        tavoliPagati: 0,
        incassoTavoli: 0,
        coperti: 0,
        consegneDaFare: 0,
        consegneInCorso: 0,
        consegneFatte: 0,
        ritiri: 0,
        banco: 0,
        nonStampati: 0
    };

    for (const rawOrder of orders) {
        const order = publicOrder(rawOrder);
        const type = normalizeOrderType(rawOrder.tipo || "tavolo");
        const total = Number(order.totale);
        summary.totale += Number.isFinite(total) ? total : 0;
        if (type === "tavolo") {
            if (order.tavoloChiuso) {
                summary.tavoliPagati++;
                summary.incassoTavoli += Number.isFinite(total) ? total : 0;
            } else {
                if (order.tavoloOCliente) tables.add(order.tavoloOCliente);
                summary.coperti += Number.isFinite(order.numeroPersone) ? order.numeroPersone : 0;
            }
        } else if (type === "consegna") {
            if (order.statoConsegna === "in_consegna") summary.consegneInCorso++;
            else if (order.statoConsegna === "consegnata") summary.consegneFatte++;
            else summary.consegneDaFare++;
        } else if (type === "ritiro") {
            summary.ritiri++;
        } else if (type === "banco") {
            summary.banco++;
        }
        if (order.stampaCompletata !== true) summary.nonStampati++;
    }

    summary.tavoli = tables.size;
    summary.totale = Math.round((summary.totale + Number.EPSILON) * 100) / 100;
    summary.incassoTavoli = Math.round((summary.incassoTavoli + Number.EPSILON) * 100) / 100;
    return summary;
}

async function printerStatus(db) {
    const metadata = db.collection("metadata");
    const jobs = db.collection("printerJobs");
    const [lockSnapshot, queuedCount, printingCount, failedCount] = await Promise.all([
        metadata.doc("printerAgentLock").get(),
        jobs.where("status", "==", "queued").count().get(),
        jobs.where("status", "==", "printing").count().get(),
        jobs.where("status", "==", "failed").count().get()
    ]);
    const leaseUntil = leaseMillis(lockSnapshot.data());
    const now = Date.now();
    return {
        attiva: lockSnapshot.exists && leaseUntil !== null && leaseUntil > now,
        ultimoContatto: leaseUntil === null
            ? null
            : new Date(leaseUntil - PRINTER_AGENT_LEASE_MILLISECONDS).toISOString(),
        inCoda: queuedCount.data().count,
        inStampa: printingCount.data().count,
        nonRiuscite: failedCount.data().count
    };
}

module.exports = api(async (req, res) => {
    await requireStaffAccess(req);
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "POST") {
        requireSameOrigin(req);
        if (req.query?.azione !== "riprova") {
            throw httpError(400, "Azione non valida.");
        }
        const { db } = getFirebaseServices();
        const riprovate = await retryFailedPrinterJobs(db);
        return res.status(200).json({ riprovate });
    }
    if (req.method !== "GET") return methodNotAllowed(res, ["GET", "POST"]);

    const queryParams = req.query || {};
    const requestedVersion = parseOrdersVersion(queryParams.versione);
    const { start, end } = getRomeDayRange(queryParams.data);
    const { db } = getFirebaseServices();
    const [versionSnapshot, stampa] = await Promise.all([
        db.collection("metadata").doc("ordersVersion").get(),
        printerStatus(db)
    ]);
    const versione = versionSnapshot.exists ? Number(versionSnapshot.data()?.versione || 0) : 0;
    if (!Number.isSafeInteger(versione) || versione < 0) {
        throw httpError(500, "Impossibile leggere la versione degli ordini.");
    }
    if (typeof requestedVersion !== "undefined" && requestedVersion === versione) {
        return res.status(200).json({ invariato: true, stampa });
    }

    const snapshot = await db.collection("orders")
        .where("dataOra", ">=", start)
        .where("dataOra", "<", end)
        .orderBy("dataOra", "asc")
        .orderBy("numero", "desc")
        .get();
    const orders = snapshot.docs.map(document => document.data());
    return res.status(200).json({
        versione,
        stampa,
        oggi: orderSummary(orders)
    });
});
