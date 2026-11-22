const { FieldValue } = require("firebase-admin/firestore");

function normalizeCustomerPhone(value) {
    if (typeof value !== "string") return null;
    const digits = value.trim().replace(/^(?:\+39|0039)/, "").replace(/\D/g, "");
    return digits.length >= 6 ? digits : null;
}

function customerProfileForOrder(order, data) {
    if (!order || !["consegna", "ritiro"].includes(order.tipo)) return null;
    const telefono = normalizeCustomerPhone(
        order.tipo === "consegna" ? order.telefonoConsegna : order.telefonoRitiro
    );
    if (!telefono) return null;

    const raggruppate = new Map();
    for (const riga of order.righe || []) {
        if (typeof riga?.prodotto !== "string") continue;
        const extra = (riga.extra || [])
            .map(elemento => typeof elemento === "string" ? elemento : elemento?.nome)
            .filter(nome => typeof nome === "string" && nome.trim())
            .map(nome => nome.trim());
        const chiave = JSON.stringify([riga.prodotto, [...extra].sort((a, b) => a.localeCompare(b, "it-IT"))]);
        const corrente = raggruppate.get(chiave);
        if (corrente) {
            corrente.quantita++;
        } else if (raggruppate.size < 30) {
            raggruppate.set(chiave, {
                prodotto: riga.prodotto,
                quantita: 1,
                extra
            });
        }
    }

    return {
        telefono,
        ...(order.tipo === "consegna"
            ? { indirizzo: typeof order.indirizzoConsegna === "string" ? order.indirizzoConsegna : "" }
            : typeof order.tavoloOCliente === "string" && order.tavoloOCliente.trim()
                ? { nome: order.tavoloOCliente.trim() }
                : {}),
        ultimoOrdine: {
            data: typeof data === "string" ? data : new Date().toISOString(),
            tipo: order.tipo,
            righe: [...raggruppate.values()]
        }
    };
}

function customerWriteData(profile, { incrementOrder = false, ordiniTotali = 0 } = {}) {
    return {
        ...profile,
        ordiniTotali: incrementOrder ? FieldValue.increment(1) : ordiniTotali,
        aggiornatoIl: FieldValue.serverTimestamp()
    };
}

module.exports = {
    normalizeCustomerPhone,
    customerProfileForOrder,
    customerWriteData
};
