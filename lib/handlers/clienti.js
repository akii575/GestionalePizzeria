const { api, methodNotAllowed } = require("../api");
const { httpError, requireStaffAccess } = require("../auth");
const { getFirebaseServices } = require("../firebase-admin");
const { normalizeCustomerAddress, normalizeCustomerPhone } = require("../customers");

module.exports = api(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
        return methodNotAllowed(res, ["GET"]);
    }
    await requireStaffAccess(req);
    if (typeof req.query?.indirizzo !== "undefined") {
        const indirizzo = normalizeCustomerAddress(req.query.indirizzo);
        if (!indirizzo || indirizzo.length < 3) {
            throw httpError(400, "Inserisci almeno 3 caratteri dell'indirizzo.");
        }
        const { db } = getFirebaseServices();
        const snapshot = await db.collection("clienti")
            .where("indirizzoRicerca", ">=", indirizzo)
            .where("indirizzoRicerca", "<=", `${indirizzo}\uf8ff`)
            .limit(5)
            .get();
        return res.status(200).json({
            risultati: snapshot.docs.map(documento => {
                const cliente = documento.data() || {};
                return {
                    telefono: documento.id,
                    indirizzo: typeof cliente.indirizzo === "string" ? cliente.indirizzo : "",
                    ordiniTotali: Number.isSafeInteger(cliente.ordiniTotali) && cliente.ordiniTotali >= 0
                        ? cliente.ordiniTotali
                        : 0,
                    ultimoOrdine: cliente.ultimoOrdine || null
                };
            })
        });
    }

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
