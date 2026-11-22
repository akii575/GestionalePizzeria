const { FieldPath } = require("firebase-admin/firestore");
const { getFirebaseServices } = require("../lib/firebase-admin");
const { normalizeCustomerAddress } = require("../lib/customers");

const batchSize = 450;

async function backfillCustomerAddresses({ db, dryRun = false, log = console.log } = {}) {
    const firestore = db || getFirebaseServices().db;
    const collection = firestore.collection("clienti");
    let cursor = null;
    let processed = 0;
    let updated = 0;

    while (true) {
        let query = collection.orderBy(FieldPath.documentId()).limit(batchSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        if (!snapshot.docs.length) break;

        const batch = dryRun ? null : firestore.batch();
        let updatesInBatch = 0;
        for (const document of snapshot.docs) {
            processed++;
            const customer = document.data() || {};
            if (typeof customer.indirizzo !== "string") continue;
            const indirizzoRicerca = normalizeCustomerAddress(customer.indirizzo);
            if (customer.indirizzoRicerca === indirizzoRicerca) continue;

            updated++;
            if (batch) {
                batch.update(document.ref, { indirizzoRicerca });
                updatesInBatch++;
            }
        }
        if (updatesInBatch) await batch.commit();

        cursor = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < batchSize) break;
    }

    log(`${dryRun ? "Dry run" : "Backfill"} clienti: ${processed} letti, ${updated} da aggiornare.`);
    return { processed, updated };
}

if (require.main === module) {
    backfillCustomerAddresses({ dryRun: process.argv.includes("--dry-run") }).catch(error => {
        console.error("Backfill clienti failed:", error.code || error.message);
        process.exitCode = 1;
    });
}

module.exports = { backfillCustomerAddresses };
