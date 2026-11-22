const { api, methodNotAllowed } = require("../api");
const { httpError, requireStaffAccess } = require("../auth");
const { getFirebaseServices } = require("../firebase-admin");
const { normalizeCustomerPhone } = require("../customers");

module.exports = api(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireStaffAccess(req);
    const telefono = normalizeCustomerPhone(req.query?.telefono);
    if (!telefono) throw httpError(400, "Il numero di telefono non e' valido.");

    const { db } = getFirebaseServices();
    const snapshot = await db.collection("clienti").doc(telefono).get();
    if (!snapshot.exists) return res.status(200).json({ trovato: false });

    const cliente = snapshot.data() || {};
    return res.status(200).json({
        trovato: true,
        indirizzo: typeof cliente.indirizzo === "string" ? cliente.indirizzo : "",
        nome: typeof cliente.nome === "string" ? cliente.nome : "",
        ultimoOrdine: cliente.ultimoOrdine || null,
        ordiniTotali: Number.isSafeInteger(cliente.ordiniTotali) && cliente.ordiniTotali >= 0
            ? cliente.ordiniTotali
            : 0
    });
});
