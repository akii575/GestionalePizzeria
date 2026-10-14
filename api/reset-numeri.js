const { api, methodNotAllowed } = require("../lib/api");
const { httpError, requireAdmin, requireSameOrigin } = require("../lib/auth");
const { getFirebaseServices } = require("../lib/firebase-admin");

module.exports = api(async (req, res) => {
    if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
    }
    await requireAdmin(req);
    requireSameOrigin(req);
    const { db } = getFirebaseServices();
    const orders = db.collection("orders");
    const printerJobs = db.collection("printerJobs");
    const control = db.collection("metadata").doc("printerControl");
    await control.set({ paused: true });
    try {
        const activeJobs = await printerJobs.where("status", "==", "printing").limit(1).get();
        if (!activeJobs.empty) {
            throw httpError(409, "Attendi la fine della stampa prima di azzerare i numeri.");
        }

        for (const collection of [orders, printerJobs]) {
            let snapshot = await collection.limit(450).get();
            while (!snapshot.empty) {
                const batch = db.batch();
                snapshot.docs.forEach(document => batch.delete(document.ref));
                await batch.commit();
                snapshot = await collection.limit(450).get();
            }
        }
        await db.collection("metadata").doc("orderCounter").set({ value: 0 });
        return res.status(200).json({ ok: true });
    } finally {
        await control.set({ paused: false });
    }
});
