const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function getFirebaseServices() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!projectId || !serviceAccountJson) {
        throw new Error("FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON must be configured.");
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.");
    }
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("The Firebase service account is missing required credentials.");
    }

    const app = getApps()[0] || initializeApp({
        credential: cert({
            projectId,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key.replace(/\\n/g, "\n")
        }),
        projectId
    });
    return {
        auth: getAuth(app),
        db: getFirestore(app)
    };
}

module.exports = { getFirebaseServices };
