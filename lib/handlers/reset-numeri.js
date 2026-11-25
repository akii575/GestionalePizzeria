const { randomUUID } = require("node:crypto");
const { api, methodNotAllowed } = require("../api");
const { httpError, requireAdmin, requireSameOrigin } = require("../auth");
const { getFirebaseServices } = require("../firebase-admin");
const { incrementOrdersVersion } = require("../orders-version");
const { saveNightSummaries } = require("../serate");
const {
    RESET_LOCK_MILLISECONDS,
    isActivePrintingJob,
    isPrinterQueuePaused
} = require("../printer-jobs");

function isRetryableFirestoreError(error) {
    return [4, 10, 14, "deadline-exceeded", "aborted", "unavailable"].includes(error?.code);
}

async function releaseResetLock(db, control, resetId) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await db.runTransaction(async transaction => {
                const controlSnapshot = await transaction.get(control);
                if (controlSnapshot.data()?.resetId === resetId) {
                    transaction.set(control, { paused: false });
                }
            });
            return;
        } catch (error) {
            if (attempt === 2 || !isRetryableFirestoreError(error)) throw error;
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }
}

module.exports = api(async (req, res) => {
    if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
    }
    await requireAdmin(req);
    requireSameOrigin(req);
    const { db } = getFirebaseServices();
    const orders = db.collection("orders");
    const ordersVersion = db.collection("metadata").doc("ordersVersion");
    const printerJobs = db.collection("printerJobs");
    const control = db.collection("metadata").doc("printerControl");
    const resetId = randomUUID();

    await db.runTransaction(async transaction => {
        const controlSnapshot = await transaction.get(control);
        if (isPrinterQueuePaused(controlSnapshot.data())) {
            throw httpError(409, "La coda di stampa e' gia' in manutenzione. Riprova tra poco.");
        }
        transaction.set(control, {
            paused: true,
            pausedUntil: Date.now() + RESET_LOCK_MILLISECONDS,
            resetId
        });
    });

    try {
        const printingJobs = await printerJobs.where("status", "==", "printing").get();
        if (printingJobs.docs.some(document => isActivePrintingJob(document.data()))) {
            throw httpError(409, "Attendi la fine della stampa prima di azzerare i numeri.");
        }

        const orderSnapshot = await orders.get();
        try {
            await saveNightSummaries(db, resetId, orderSnapshot.docs.map(document => document.data()));
        } catch (error) {
            console.error("Impossibile salvare i riepiloghi delle serate prima del reset.", error);
            throw httpError(500, "Impossibile salvare i riepiloghi delle serate. Gli ordini non sono stati cancellati.");
        }

        let ordersVersionIncremented = false;
        for (const collection of [orders, printerJobs, db.collection("idempotencyKeys")]) {
            let snapshot = await collection.limit(450).get();
            while (!snapshot.empty) {
                await db.runTransaction(async transaction => {
                    const controlSnapshot = await transaction.get(control);
                    if (controlSnapshot.data()?.resetId !== resetId) {
                        throw httpError(409, "Il reset e' stato interrotto. Riprova tra poco.");
                    }
                    transaction.set(control, {
                        paused: true,
                        pausedUntil: Date.now() + RESET_LOCK_MILLISECONDS,
                        resetId
                    });
                });
                const batch = db.batch();
                snapshot.docs.forEach(document => batch.delete(document.ref));
                if (collection === orders && !ordersVersionIncremented) {
                    incrementOrdersVersion(batch, ordersVersion);
                    ordersVersionIncremented = true;
                }
                await batch.commit();
                snapshot = await collection.limit(450).get();
            }
        }
        if (!ordersVersionIncremented) {
            const batch = db.batch();
            incrementOrdersVersion(batch, ordersVersion);
            await batch.commit();
        }
        await db.collection("metadata").doc("orderCounter").set({ value: 0 });
    } finally {
        await releaseResetLock(db, control, resetId);
    }
    return res.status(200).json({ ok: true });
});
