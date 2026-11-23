const { api, methodNotAllowed } = require("../../api");
const { httpError, requireDeliveryAccess, requireStaffAccess, requireSameOrigin } = require("../../auth");
const { getFirebaseServices } = require("../../firebase-admin");
const { getMenuData } = require("../../menu-store");
const {
    prepareDeliveryStatusUpdate,
    normalizeOrderType,
    prepareOrder,
    preparePaymentUpdate,
    publicOrder
} = require("../../orders");
const { incrementOrdersVersion } = require("../../orders-version");
const { diffRighe } = require("../../order-diff");
const { customerProfileForOrder, customerWriteData } = require("../../customers");
const {
    hasExpiredPrinterQueuePause,
    isActivePrintingJob,
    isPrinterQueuePaused,
    isValidPrinterSelection,
    jobId,
    PRINTER_NAMES
} = require("../../printer-jobs");

function orderNumber(req) {
    const value = Number(req.query.numero);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw httpError(400, "Numero ordine non valido.");
    }
    return value;
}

module.exports = api(async (req, res) => {
    const user = req.method === "PATCH"
        ? await requireDeliveryAccess(req)
        : await requireStaffAccess(req);
    const deliveryOnly = req.method === "PATCH"
        && user.delivery === true
        && user.admin !== true
        && user.staff !== true;
    const numero = orderNumber(req);
    const { db } = getFirebaseServices();
    const order = db.collection("orders").doc(String(numero));
    const printerJobs = db.collection("printerJobs");
    const printerControl = db.collection("metadata").doc("printerControl");
    const ordersVersion = db.collection("metadata").doc("ordersVersion");

    if (req.method === "POST") {
        requireSameOrigin(req);
        if (req.body?.azione !== "ristampa") {
            throw httpError(400, "Azione non valida.");
        }
        if (!isValidPrinterSelection(req.body.stampanti)) {
            throw httpError(400, "Seleziona almeno una stampante valida.");
        }
        const stampanti = PRINTER_NAMES.filter(stampante => req.body.stampanti.includes(stampante));
        const nomiStampanti = stampanti.length === 2 ? "Cucina e Sala" : stampanti[0];
        const saved = await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(printerControl);
            const controlData = controlSnapshot.data();
            if (isPrinterQueuePaused(controlData)) {
                throw httpError(409, "La coda di stampa e' in manutenzione. Riprova tra poco.");
            }
            const orderSnapshot = await transaction.get(order);
            if (!orderSnapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const orderData = orderSnapshot.data();
            const contatore = orderData.contatoreStampe === undefined ? 0 : orderData.contatoreStampe;
            if (!Number.isSafeInteger(contatore) || contatore < 0 || contatore === Number.MAX_SAFE_INTEGER) {
                throw httpError(409, "Impossibile creare un nuovo lavoro di stampa per questo ordine.");
            }
            const progressivo = contatore + 1;
            const createdAt = new Date().toISOString();
            const messaggioStampa = `Ristampa in coda (${nomiStampanti})`;
            transaction.update(order, {
                contatoreStampe: progressivo,
                stampaInCoda: true,
                messaggioStampa
            });
            incrementOrdersVersion(transaction, ordersVersion);
            transaction.set(printerJobs.doc(jobId(numero, progressivo)), {
                numero,
                tipoStampa: "ristampa",
                stampanti,
                status: "queued",
                createdAt,
                attemptCount: 0,
                printedPrinters: []
            });
            if (hasExpiredPrinterQueuePause(controlData)) {
                transaction.set(printerControl, { paused: false });
            }
            return { messaggioStampa };
        });
        return res.status(202).json({ ok: true, ...saved });
    }
    if (req.method === "PUT") {
        requireSameOrigin(req);
        const catalog = await getMenuData(db);
        const saved = await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(printerControl);
            const controlData = controlSnapshot.data();
            if (isPrinterQueuePaused(controlData)) {
                throw httpError(409, "La coda di stampa e' in manutenzione. Riprova tra poco.");
            }
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const jobSnapshot = await transaction.get(printerJobs.where("numero", "==", numero));
            const previous = snapshot.data();
            const prepared = prepareOrder(req.body, catalog, {
                existingRows: previous.righe || [],
                existingOrder: previous
            });
            const customer = customerProfileForOrder(prepared, previous.dataOra);
            const customerRef = customer
                ? db.collection("clienti").doc(customer.telefono)
                : null;
            const customerSnapshot = customerRef ? await transaction.get(customerRef) : null;
            const previousCustomer = customerSnapshot?.data() || {};
            const previousLatestOrderTime = Date.parse(previousCustomer.ultimoOrdine?.data);
            const updatedOrderTime = Date.parse(customer?.ultimoOrdine?.data);
            if (Number.isFinite(previousLatestOrderTime)
                    && Number.isFinite(updatedOrderTime)
                    && previousLatestOrderTime > updatedOrderTime) {
                customer.ultimoOrdine = previousCustomer.ultimoOrdine;
            }
            const jobs = jobSnapshot.docs.map(document => ({ ref: document.ref, ...document.data() }));
            if (jobs.some(job => job.status === "printing")) {
                throw httpError(409, "La comanda e' gia' in fase di stampa e non puo' essere modificata.");
            }
            const mainJob = jobs.find(job => job.ref.id === jobId(numero));
            const rowDiff = mainJob?.status === "printed"
                ? diffRighe(previous.righe || [], prepared.righe)
                : null;
            const tipoNuovoJob = rowDiff?.rimosse.length
                ? "ristampa"
                : rowDiff?.aggiunte.length ? "aggiunta" : null;
            let contatoreStampe = previous.contatoreStampe;
            let nuovoJob = null;
            if (tipoNuovoJob) {
                contatoreStampe = previous.contatoreStampe === undefined ? 0 : previous.contatoreStampe;
                if (!Number.isSafeInteger(contatoreStampe)
                        || contatoreStampe < 0 || contatoreStampe === Number.MAX_SAFE_INTEGER) {
                    throw httpError(409, "Impossibile creare un nuovo lavoro di stampa per questo ordine.");
                }
                contatoreStampe++;
                nuovoJob = {
                    numero,
                    status: "queued",
                    createdAt: new Date().toISOString(),
                    attemptCount: 0,
                    printedPrinters: [],
                    tipoStampa: tipoNuovoJob,
                    ...(tipoNuovoJob === "ristampa"
                        ? { motivo: "modificata" }
                        : {
                            righe: rowDiff.aggiunte.map(row => ({ ...row }))
                        })
                };
            }
            const queued = Boolean(nuovoJob) || jobs.some(job => job.status === "queued");
            const previousDelivery = prepared.tipo === "consegna"
                ? normalizeOrderType(previous.tipo || "tavolo") === "consegna"
                    ? publicOrder(previous)
                    : { statoConsegna: "da_consegnare" }
                : null;
            const updated = {
                ...prepared,
                statoPagamento: Object.prototype.hasOwnProperty.call(req.body, "statoPagamento")
                    ? prepared.statoPagamento
                    : ["ritiro", "consegna"].includes(prepared.tipo)
                        ? previous.statoPagamento || null
                        : null,
                numero,
                dataOra: previous.dataOra,
                ...(typeof contatoreStampe === "undefined" ? {} : { contatoreStampe }),
                stampaCompletata: previous.stampaCompletata === true,
                stampaInCoda: queued,
                messaggioStampa: nuovoJob?.tipoStampa === "aggiunta"
                    ? "Aggiunta in coda per la stampa."
                    : nuovoJob?.tipoStampa === "ristampa"
                        ? "Comanda modificata: ristampa in coda."
                        : queued
                            ? "Comanda aggiornata, in attesa di stampa automatica."
                    : previous.stampaCompletata
                        ? "Comanda aggiornata; la copia gia' stampata non e' stata ristampata."
                        : previous.messaggioStampa || "Comanda aggiornata.",
                ...(previousDelivery ? {
                    statoConsegna: previousDelivery.statoConsegna,
                    ...(previousDelivery.consegnataAlle
                        ? { consegnataAlle: previousDelivery.consegnataAlle }
                        : {})
                } : {})
            };
            if (hasExpiredPrinterQueuePause(controlData)) {
                transaction.set(printerControl, { paused: false });
            }
            transaction.set(order, updated);
            incrementOrdersVersion(transaction, ordersVersion);
            if (customer) {
                const ordiniTotali = Number.isSafeInteger(previousCustomer.ordiniTotali)
                    && previousCustomer.ordiniTotali >= 0
                    ? previousCustomer.ordiniTotali
                    : 0;
                transaction.set(
                    customerRef,
                    customerWriteData(customer, { ordiniTotali }),
                    { merge: true }
                );
            }
            for (const job of jobs.filter(job => ["queued", "failed"].includes(job.status))) {
                transaction.update(job.ref, {
                    updatedAt: new Date().toISOString(),
                    printedPrinters: []
                });
            }
            if (nuovoJob?.tipoStampa === "ristampa") {
                for (const job of jobs.filter(job => (
                    job.tipoStampa === "aggiunta" && job.status === "queued"
                ))) {
                    transaction.update(job.ref, {
                        status: "cancelled",
                        lastError: "sostituita_da_ristampa"
                    });
                }
            }
            if (nuovoJob) {
                transaction.set(printerJobs.doc(jobId(numero, contatoreStampe)), nuovoJob);
            }
            return updated;
        });
        return res.status(200).json(publicOrder(saved));
    }
    if (req.method === "PATCH") {
        requireSameOrigin(req);
        const body = req.body;
        const hasDeliveryStatus = body && typeof body === "object" && !Array.isArray(body)
            && Object.prototype.hasOwnProperty.call(body, "statoConsegna");
        const bodyKeys = body && typeof body === "object" && !Array.isArray(body)
            ? Object.keys(body)
            : [];
        if (deliveryOnly && (!hasDeliveryStatus || bodyKeys.some(key => key !== "statoConsegna"))) {
            throw httpError(403, "Il rider puo' aggiornare solo lo stato della consegna.");
        }
        if (hasDeliveryStatus && bodyKeys.some(key => !["statoConsegna", "statoPagamento"].includes(key))) {
            throw httpError(400, "La richiesta dello stato consegna non e' valida.");
        }
        const saved = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const previous = snapshot.data();
            let update;
            if (hasDeliveryStatus) {
                const statusUpdate = prepareDeliveryStatusUpdate(previous, body);
                update = {
                    ...statusUpdate,
                    consegnataAlle: statusUpdate.statoConsegna === "consegnata"
                        ? previous.statoConsegna === "consegnata" && previous.consegnataAlle
                            ? previous.consegnataAlle
                            : new Date().toISOString()
                        : null
                };
                if (Object.prototype.hasOwnProperty.call(body, "statoPagamento")) {
                    update = {
                        ...update,
                        ...preparePaymentUpdate(previous, { statoPagamento: body.statoPagamento })
                    };
                }
            } else {
                if (deliveryOnly) {
                    throw httpError(403, "Il rider puo' aggiornare solo lo stato della consegna.");
                }
                update = preparePaymentUpdate(previous, body);
            }
            transaction.update(order, update);
            incrementOrdersVersion(transaction, ordersVersion);
            return { ...previous, ...update };
        });
        return res.status(200).json(publicOrder(saved));
    }
    if (req.method === "DELETE") {
        requireSameOrigin(req);
        await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(printerControl);
            const controlData = controlSnapshot.data();
            if (isPrinterQueuePaused(controlData)) {
                throw httpError(409, "La coda di stampa e' in manutenzione. Riprova tra poco.");
            }
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const jobSnapshot = await transaction.get(printerJobs.where("numero", "==", numero));
            if (jobSnapshot.docs.some(document => isActivePrintingJob(document.data()))) {
                throw httpError(409, "La comanda e' gia' in fase di stampa e non puo' essere eliminata.");
            }
            for (const document of jobSnapshot.docs) transaction.delete(document.ref);
            if (hasExpiredPrinterQueuePause(controlData)) {
                transaction.set(printerControl, { paused: false });
            }
            transaction.delete(order);
            incrementOrdersVersion(transaction, ordersVersion);
        });
        return res.status(204).end();
    }
    return methodNotAllowed(res, ["POST", "PUT", "PATCH", "DELETE"]);
});
