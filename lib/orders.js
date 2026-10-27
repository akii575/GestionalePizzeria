const menu = require("./menu.json");
const extras = require("./extras.json");
const { httpError } = require("./auth");

const menuByName = new Map(menu.map(product => [product.nome, product]));
const extraById = new Map(extras.map(extra => [extra.id, extra]));
const categoriesWithExtras = new Set(["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"]);
const serviceTypes = new Set(["tavolo", "banco", "ritiro", "consegna"]);
const paymentTypes = new Set(["ritiro", "consegna"]);

function currentOrderTime() {
    return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).format(new Date());
}

function normalizeOrderType(tipo) {
    return tipo === "sala" ? "tavolo" : tipo;
}

function filterOrdersByType(orders, tipo) {
    if (!serviceTypes.has(tipo)) {
        throw httpError(400, "Tipo servizio non valido.");
    }
    return orders.filter(order => normalizeOrderType(order.tipo || "tavolo") === tipo);
}

function prepareOrder(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "La richiesta dell'ordine non e' valida.");
    }
    const tipo = normalizeOrderType(input.tipo === undefined ? "tavolo" : input.tipo);
    if (!serviceTypes.has(tipo)) {
        throw httpError(400, "Tipo ordine non valido.");
    }
    const orario = tipo === "tavolo"
        ? ""
        : input.orario === undefined
            ? currentOrderTime()
            : typeof input.orario === "string" ? input.orario.trim() : "";
    if (tipo !== "tavolo" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(orario)) {
        throw httpError(400, "Inserisci un orario valido nel formato HH:MM.");
    }
    let statoPagamento = null;
    if (paymentTypes.has(tipo)) {
        if (input.statoPagamento === undefined) {
            statoPagamento = "non_pagato";
        } else if (input.statoPagamento === null || input.statoPagamento === "") {
            statoPagamento = null;
        } else if (input.statoPagamento === "non_pagato" || input.statoPagamento === "pagato"
            || (tipo === "consegna" && input.statoPagamento === "pos")) {
            statoPagamento = input.statoPagamento;
        } else {
            throw httpError(400, "Stato di pagamento non valido per questo servizio.");
        }
    }
    const richiedeDestinazione = tipo === "tavolo" || tipo === "ritiro";
    const tavoloOCliente = typeof input.tavoloOCliente === "string" ? input.tavoloOCliente.trim() : "";
    const cognomeBanco = tipo === "banco" && typeof input.cognomeBanco === "string"
        ? input.cognomeBanco.trim()
        : "";
    if (tipo === "banco" && (!cognomeBanco || cognomeBanco.length > 80)) {
        throw httpError(400, "Il cognome per l'ordine al banco e' obbligatorio.");
    }
    if (richiedeDestinazione && (!tavoloOCliente || tavoloOCliente.length > 120)) {
        throw httpError(400, "Tavolo o nome cliente e' obbligatorio.");
    }
    if (tipo === "tavolo" && (
        !Number.isInteger(input.numeroPersone === undefined ? 1 : Number(input.numeroPersone))
        || Number(input.numeroPersone === undefined ? 1 : input.numeroPersone) < 1
        || Number(input.numeroPersone === undefined ? 1 : input.numeroPersone) > 30
    )) {
        throw httpError(400, "Il numero di persone deve essere compreso tra 1 e 30.");
    }
    const indirizzoConsegna = tipo === "consegna" && typeof input.indirizzoConsegna === "string"
        ? input.indirizzoConsegna.trim()
        : "";
    const telefonoConsegna = tipo === "consegna" && typeof input.telefonoConsegna === "string"
        ? input.telefonoConsegna.trim()
        : "";
    const telefonoRitiro = tipo === "ritiro" && typeof input.telefonoRitiro === "string"
        ? input.telefonoRitiro.trim()
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
    if (tipo === "ritiro" && (
        !/^\+?[\d\s().-]{6,30}$/.test(telefonoRitiro)
        || telefonoRitiro.replace(/\D/g, "").length < 6
    )) {
        throw httpError(400, "Il numero di telefono del ritiro non e' valido.");
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
        orario,
        statoPagamento,
        tavoloOCliente: richiedeDestinazione ? tavoloOCliente : "",
        cognomeBanco,
        numeroPersone: tipo === "tavolo"
            ? Number(input.numeroPersone === undefined ? 1 : input.numeroPersone)
            : null,
        indirizzoConsegna,
        telefonoConsegna,
        telefonoRitiro,
        note: typeof input.note === "string" ? input.note.trim() : "",
        righe: rows,
        totale: Number(total.toFixed(2))
    };
}

function preparePaymentUpdate(order, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "La richiesta dello stato di pagamento non e' valida.");
    }
    const tipo = normalizeOrderType(order.tipo || "tavolo");
    const nextStatus = input.statoPagamento;
    if (!paymentTypes.has(tipo)) {
        throw httpError(400, "Il pagamento puo' essere aggiornato solo per ritiri e consegne.");
    }
    if (nextStatus !== "non_pagato" && nextStatus !== "pagato") {
        throw httpError(400, "Stato di pagamento non valido.");
    }
    if (order.statoPagamento === "pos") {
        throw httpError(409, "Il pagamento POS e' fisso e non puo' essere modificato dal riepilogo.");
    }
    return { statoPagamento: nextStatus };
}

function publicOrder(order) {
    const tipo = normalizeOrderType(order.tipo || "tavolo");
    return {
        numero: order.numero,
        dataOra: order.dataOra,
        tipo,
        orario: tipo === "tavolo" ? "" : typeof order.orario === "string" ? order.orario : "",
        statoPagamento: paymentTypes.has(tipo)
            && ["non_pagato", "pagato", "pos"].includes(order.statoPagamento)
            && (tipo === "consegna" || order.statoPagamento !== "pos")
            ? order.statoPagamento
            : null,
        tavoloOCliente: tipo === "consegna" || tipo === "banco" ? "" : order.tavoloOCliente || "",
        cognomeBanco: tipo === "banco" ? order.cognomeBanco || "" : "",
        numeroPersone: Number.isInteger(order.numeroPersone) ? order.numeroPersone : null,
        indirizzoConsegna: order.indirizzoConsegna || "",
        telefonoConsegna: order.telefonoConsegna || "",
        telefonoRitiro: order.telefonoRitiro || "",
        righe: order.righe,
        totale: order.totale,
        stampaCompletata: order.stampaCompletata === true,
        stampaInCoda: order.stampaInCoda === true,
        messaggioStampa: order.messaggioStampa || "Ordine salvato.",
        note: order.note || ""
    };
}

module.exports = {
    extras,
    filterOrdersByType,
    menu,
    normalizeOrderType,
    prepareOrder,
    preparePaymentUpdate,
    publicOrder
};
