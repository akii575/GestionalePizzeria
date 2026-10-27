const { api, methodNotAllowed } = require("../../lib/api");
const { httpError, requireAdmin, requireSameOrigin } = require("../../lib/auth");
const { getFirebaseServices } = require("../../lib/firebase-admin");
const { prepareOrder, preparePaymentUpdate, publicOrder } = require("../../lib/orders");

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
    const printerJob = db.collection("printerJobs").doc(String(numero).padStart(12, "0"));
    const printerControl = db.collection("metadata").doc("printerControl");

    if (req.method === "PUT") {
        requireSameOrigin(req);
        const prepared = prepareOrder(req.body);
        const saved = await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(printerControl);
            if (controlSnapshot.data()?.paused) {
                throw httpError(409, "La coda di stampa e' in manutenzione. Riprova tra poco.");
            }
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const jobSnapshot = await transaction.get(printerJob);
            const previous = snapshot.data();
            const job = jobSnapshot.exists ? jobSnapshot.data() : null;
            if (job && job.status === "printing") {
                throw httpError(409, "La comanda e' gia' in fase di stampa e non puo' essere modificata.");
            }
            const updated = {
                ...prepared,
                statoPagamento: Object.prototype.hasOwnProperty.call(req.body, "statoPagamento")
                    ? prepared.statoPagamento
                    : ["ritiro", "consegna"].includes(prepared.tipo)
                        ? previous.statoPagamento || null
                        : null,
                numero,
                dataOra: previous.dataOra,
                stampaCompletata: previous.stampaCompletata === true,
                stampaInCoda: job && job.status === "queued",
                messaggioStampa: job && job.status === "queued"
                    ? "Comanda aggiornata, in attesa di stampa automatica."
                    : previous.stampaCompletata
                        ? "Comanda aggiornata; la copia gia' stampata non e' stata ristampata."
                        : previous.messaggioStampa || "Comanda aggiornata."
            };
            if (previous.statoPagamento === "pos" && updated.statoPagamento !== "pos") {
                throw httpError(409, "Il pagamento POS e' fisso e non puo' essere modificato.");
            }
            transaction.set(order, updated);
            if (job && ["queued", "failed"].includes(job.status)) {
                transaction.update(printerJob, {
                    updatedAt: new Date().toISOString(),
                    printedPrinters: []
                });
            }
            return updated;
        });
        return res.status(200).json(publicOrder(saved));
    }
    if (req.method === "PATCH") {
        requireSameOrigin(req);
        const saved = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const previous = snapshot.data();
            const update = preparePaymentUpdate(previous, req.body);
            transaction.update(order, update);
            return { ...previous, ...update };
        });
        return res.status(200).json(publicOrder(saved));
    }
    if (req.method === "DELETE") {
        requireSameOrigin(req);
        await db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(printerControl);
            if (controlSnapshot.data()?.paused) {
                throw httpError(409, "La coda di stampa e' in manutenzione. Riprova tra poco.");
            }
            const snapshot = await transaction.get(order);
            if (!snapshot.exists) throw httpError(404, `Ordine non trovato: ${numero}`);
            const jobSnapshot = await transaction.get(printerJob);
            if (jobSnapshot.exists && jobSnapshot.data().status === "printing") {
                throw httpError(409, "La comanda e' gia' in fase di stampa e non puo' essere eliminata.");
            }
            if (jobSnapshot.exists && ["queued", "failed", "cancelled"].includes(jobSnapshot.data().status)) {
                transaction.delete(printerJob);
            }
            transaction.delete(order);
        });
        return res.status(204).end();
    }
    return methodNotAllowed(res, ["PUT", "PATCH", "DELETE"]);
});
