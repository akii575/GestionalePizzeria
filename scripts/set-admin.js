const { getFirebaseServices } = require("../lib/firebase-admin");

async function setAdmin(email, revoke) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Usage: node scripts/set-admin.js admin@example.com [--revoke]");
    }
    const { auth } = getFirebaseServices();
    const user = await auth.getUserByEmail(email);
    const claims = { ...user.customClaims };
    if (revoke) {
        delete claims.admin;
    } else {
        claims.admin = true;
    }
    await auth.setCustomUserClaims(user.uid, claims);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Admin claim ${revoke ? "removed from" : "assigned to"} ${user.email}. The user must sign in again.`);
}

const [email, action, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (action && action !== "--revoke")) {
    console.error("Usage: node scripts/set-admin.js admin@example.com [--revoke]");
    process.exitCode = 1;
} else {
    setAdmin(email, action === "--revoke").catch(error => {
        console.error("Unable to update the admin claim:", error.code || error.message);
        process.exitCode = 1;
    });
}
