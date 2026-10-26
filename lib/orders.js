const menu = require("./menu.json");
const extras = require("./extras.json");
const { httpError } = require("./auth");

const menuByName = new Map(menu.map(product => [product.nome, product]));
const extraById = new Map(extras.map(extra => [extra.id, extra]));
const categoriesWithExtras = new Set(["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"]);

function prepareOrder(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "La richiesta dell'ordine non e' valida.");
    }
    const tipo = input.tipo === undefined ? "sala" : input.tipo;
    if (!["sala", "consegna"].includes(tipo)) {
        throw httpError(400, "Tipo ordine non valido.");
    }
    if (typeof input.tavoloOCliente !== "string" || !input.tavoloOCliente.trim() || input.tavoloOCliente.length > 120) {
        throw httpError(400, "Tavolo o cliente e' obbligatorio.");
    }
    const indirizzoConsegna = tipo === "consegna" && typeof input.indirizzoConsegna === "string"
        ? input.indirizzoConsegna.trim()
        : "";
    const telefonoConsegna = tipo === "consegna" && typeof input.telefonoConsegna === "string"
        ? input.telefonoConsegna.trim()
        : "";
    if (tipo === "consegna" && (!indirizzoConsegna || indirizzoConsegna.length > 300)) {
        throw httpError(400, "L'indirizzo di consegna e' obbligatorio.");
    }
    if (tipo === "consegna" && (
        !/^\+?[\d\s().-]{6,30}$/.test(telefonoConsegna)
        || telefonoConsegna.replace(/\D/g, "").length < 6
    )) {
        throw httpError(400, "Il numero di telefono della consegna non e' valido.");
    }
    if (typeof input.note !== "undefined" && (typeof input.note !== "string" || input.note.length > 2000)) {
        throw httpError(400, "Le note non sono valide.");
    }
    if (!Array.isArray(input.righe) || input.righe.length === 0 || input.righe.length > 100) {
        throw httpError(400, "Seleziona da 1 a 100 prodotti.");
    }

    const rows = input.righe.map(row => {
        if (!row || typeof row.prodotto !== "string") {
            throw httpError(400, "Una riga dell'ordine non e' valida.");
        }
        const product = menuByName.get(row.prodotto);
        if (!product) throw httpError(400, `Prodotto non presente nel menu: ${row.prodotto}`);
        if (typeof row.extra !== "undefined" && !Array.isArray(row.extra)) {
            throw httpError(400, "Gli extra dell'ordine non sono validi.");
        }
        const selectedExtras = (row.extra || []).map(reference => {
            const id = typeof reference === "string"
                ? (extraById.has(reference) ? reference : extras.find(extra => extra.nome === reference)?.id)
                : reference && (reference.id || extras.find(extra => extra.nome === reference.nome)?.id);
            const extra = id && extraById.get(id);
            if (!extra) throw httpError(400, "Extra non ammesso.");
            return extra;
        });
        if (selectedExtras.length && !categoriesWithExtras.has(product.categoria)) {
            throw httpError(400, "Questo prodotto non consente extra.");
        }
        const total = product.prezzo + selectedExtras.reduce((sum, extra) => sum + extra.prezzo, 0);
        return {
            prodotto: product.nome,
            prezzoBase: product.prezzo,
            extra: selectedExtras,
            totale: Number(total.toFixed(2))
        };
    });
    const total = rows.reduce((sum, row) => sum + row.totale, 0);
    return {
        tipo,
        tavoloOCliente: input.tavoloOCliente.trim(),
        indirizzoConsegna,
        telefonoConsegna,
        note: typeof input.note === "string" ? input.note.trim() : "",
        righe: rows,
        totale: Number(total.toFixed(2))
    };
}

function publicOrder(order) {
    return {
        numero: order.numero,
        dataOra: order.dataOra,
        tipo: order.tipo || "sala",
        tavoloOCliente: order.tavoloOCliente,
        indirizzoConsegna: order.indirizzoConsegna || "",
        telefonoConsegna: order.telefonoConsegna || "",
        righe: order.righe,
        totale: order.totale,
        stampaCompletata: order.stampaCompletata === true,
        stampaInCoda: order.stampaInCoda === true,
        messaggioStampa: order.messaggioStampa || "Ordine salvato.",
        note: order.note || ""
    };
}

module.exports = { extras, menu, prepareOrder, publicOrder };
