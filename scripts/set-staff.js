const { getFirebaseServices } = require("../lib/firebase-admin");

async function setStaff(email, revoke) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Usage: node scripts/set-staff.js user@example.com [--revoke]");
    }
    const { auth } = getFirebaseServices();
    const user = await auth.getUserByEmail(email);
    const claims = { ...user.customClaims };
    if (revoke) {
        delete claims.staff;
    } else {
        claims.staff = true;
    }
    await auth.setCustomUserClaims(user.uid, claims);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Staff claim ${revoke ? "removed from" : "assigned to"} ${user.email}. The user must sign in again.`);
}

const [email, action, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (action && action !== "--revoke")) {
    console.error("Usage: node scripts/set-staff.js user@example.com [--revoke]");
    process.exitCode = 1;
} else {
    setStaff(email, action === "--revoke").catch(error => {
        console.error("Unable to update the staff claim:", error.code || error.message);
        process.exitCode = 1;
    });
}
