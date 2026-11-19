const { FieldValue } = require("firebase-admin/firestore");

function incrementOrdersVersion(writer, versionRef) {
    writer.set(versionRef, { versione: FieldValue.increment(1) }, { merge: true });
}

module.exports = { incrementOrdersVersion };
