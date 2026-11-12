const { randomUUID } = require("node:crypto");
const { api, methodNotAllowed } = require("../lib/api");
const { httpError, requireStaffAccess, requireSameOrigin } = require("../lib/auth");
const { getFirebaseServices } = require("../lib/firebase-admin");
const {
    RESET_LOCK_MILLISECONDS,
    isActivePrintingJob,
    isPrinterQueuePaused
} = require("../lib/printer-jobs");

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
    await requireStaffAccess(req);
    requireSameOrigin(req);
    const { db } = getFirebaseServices();
    const orders = db.collection("orders");
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

        for (const collection of [orders, printerJobs]) {
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
                await batch.commit();
                snapshot = await collection.limit(450).get();
            }
        }
        await db.collection("metadata").doc("orderCounter").set({ value: 0 });
    } finally {
        await releaseResetLock(db, control, resetId);
    }
    return res.status(200).json({ ok: true });
});
