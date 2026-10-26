const { getFirebaseServices } = require("../lib/firebase-admin");

async function setDelivery(email, revoke) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Usage: node scripts/set-delivery.js user@example.com [--revoke]");
    }
    const { auth } = getFirebaseServices();
    const user = await auth.getUserByEmail(email);
    const claims = { ...user.customClaims };
    if (revoke) {
        delete claims.delivery;
    } else {
        claims.delivery = true;
    }
    await auth.setCustomUserClaims(user.uid, claims);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Delivery claim ${revoke ? "removed from" : "assigned to"} ${user.email}. The user must sign in again.`);
}

const [email, action, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (action && action !== "--revoke")) {
    console.error("Usage: node scripts/set-delivery.js user@example.com [--revoke]");
    process.exitCode = 1;
} else {
    setDelivery(email, action === "--revoke").catch(error => {
        console.error("Unable to update the delivery claim:", error.code || error.message);
        process.exitCode = 1;
    });
}
