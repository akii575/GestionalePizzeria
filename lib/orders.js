const { httpError } = require("./auth");
const { getMenuData, productConvention } = require("./menu-store");
const { NOTE_RIGA } = require("./note-riga");
const orderDiscountRules = require("../src/main/resources/static/order-discounts");

const serviceTypes = new Set(["tavolo", "banco", "ritiro", "consegna"]);
const paymentTypes = new Set(["ritiro", "consegna"]);
const deliveryStatuses = new Set(["da_consegnare", "in_consegna", "consegnata"]);
const CONVENZIONE_PERCENTUALE = orderDiscountRules.CONVENZIONE_PERCENTUALE;
const CONVENZIONE_PREZZO_MENU = orderDiscountRules.CONVENZIONE_PREZZO_MENU;

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

function roundToCents(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value) {
    return orderDiscountRules.toCents(value);
}

function fromCents(value) {
    return value / 100;
}

function requiredDiscountReason(value) {
    if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 80) {
        throw httpError(400, "Il motivo dello sconto deve contenere da 2 a 80 caratteri.");
    }
    return value.trim();
}

function normalizeRowDiscount(input, grossCents) {
    if (input === undefined || input === null) return null;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "Lo sconto della riga non e' valido.");
    }
    const motivo = requiredDiscountReason(input.motivo);
    if (input.tipo === "omaggio") {
        return {
            tipo: "omaggio",
            valore: 100,
            motivo,
            importo: fromCents(orderDiscountRules.rowDiscountCents({ tipo: "omaggio" }, grossCents))
        };
    }
    if (input.tipo !== "percentuale" && input.tipo !== "importo") {
        throw httpError(400, "Tipo di sconto della riga non valido.");
    }
    if (typeof input.valore !== "number" || !Number.isFinite(input.valore)) {
        throw httpError(400, "Il valore dello sconto della riga non e' valido.");
    }
    if (input.tipo === "percentuale") {
        if (input.valore < 1 || input.valore > 100) {
            throw httpError(400, "Lo sconto percentuale deve essere compreso tra 1 e 100.");
        }
        const importo = orderDiscountRules.rowDiscountCents(input, grossCents);
        return { tipo: input.tipo, valore: input.valore, motivo, importo: fromCents(importo) };
    }
    const importo = toCents(input.valore);
    if (importo <= 0 || importo > grossCents) {
        throw httpError(400, "Lo sconto della riga deve essere positivo e non superare il totale.");
    }
    return { tipo: input.tipo, valore: fromCents(importo), motivo, importo: fromCents(importo) };
}

function normalizeOrderDiscount(input) {
    if (input === undefined || input === null) return null;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "Lo sconto sul totale non e' valido.");
    }
    const motivo = requiredDiscountReason(input.motivo);
    if (input.tipo !== "percentuale" && input.tipo !== "importo") {
        throw httpError(400, "Tipo di sconto sul totale non valido.");
    }
    if (typeof input.valore !== "number" || !Number.isFinite(input.valore)) {
        throw httpError(400, "Il valore dello sconto sul totale non e' valido.");
    }
    if (input.tipo === "percentuale" && (input.valore < 1 || input.valore > 100)) {
        throw httpError(400, "Lo sconto percentuale deve essere compreso tra 1 e 100.");
    }
    if (input.tipo === "importo" && input.valore <= 0) {
        throw httpError(400, "Lo sconto sul totale deve essere positivo.");
    }
    return { tipo: input.tipo, valore: input.valore, motivo };
}

function normalizeConvention(input) {
    if (input === undefined || input === null) return null;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "La convenzione universitaria non e' valida.");
    }
    const hasPercentChoice = Object.prototype.hasOwnProperty.call(input, "percentuale");
    const hasMenuChoice = Object.prototype.hasOwnProperty.call(input, "menu");
    if ((hasPercentChoice && hasMenuChoice)
            || (hasPercentChoice && input.tipo !== "percentuale")
            || (hasMenuChoice && input.tipo !== "menu")) {
        throw httpError(400, "Scegli una sola opzione di convenzione universitaria.");
    }
    if (input.tipo !== "percentuale" && input.tipo !== "menu") {
        throw httpError(400, "Tipo di convenzione universitaria non valido.");
    }
    return { tipo: input.tipo };
}

function filterOrdersByType(orders, tipo) {
    if (!serviceTypes.has(tipo)) {
        throw httpError(400, "Tipo servizio non valido.");
    }
    return orders.filter(order => normalizeOrderType(order.tipo || "tavolo") === tipo);
}

function prepareOrder(input, catalog = null, { existingRows = [], existingOrder = null } = {}) {
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
    const costoConsegna = input.costoConsegna === undefined ? 0 : Number(input.costoConsegna);
    if (!Number.isFinite(costoConsegna) || ![0, 2].includes(costoConsegna)) {
        throw httpError(400, "Il supplemento di consegna deve essere di 0 o 2 euro.");
    }
    if (tipo !== "consegna" && costoConsegna !== 0) {
        throw httpError(400, "Il supplemento e' consentito solo per gli ordini di consegna.");
    }
    if (!Array.isArray(input.righe) || input.righe.length === 0 || input.righe.length > 100) {
        throw httpError(400, "Seleziona da 1 a 100 prodotti.");
    }
    const requestedOrderDiscount = normalizeOrderDiscount(input.sconto);
    const requestedConvention = normalizeConvention(input.convenzione);
    if (requestedOrderDiscount && requestedConvention) {
        throw httpError(400, "La convenzione non si somma ad altri sconti sul totale.");
    }

    if (!catalog) return getMenuData().then(data => prepareOrder(input, data, { existingRows, existingOrder }));
    const data = catalog;
    const products = data.allProducts || data.menu;
    const availableExtras = data.allExtras || data.extras;
    const copertoProduct = products.find(product =>
        typeof product.nome === "string"
        && product.nome.trim().toLocaleLowerCase("it-IT") === "coperto"
    );
    const copertoProductAvailable = copertoProduct
        && copertoProduct.archiviato !== true
        && copertoProduct.disponibile !== false;
    const menuCopertoPrice = copertoProductAvailable ? Number(copertoProduct.prezzo) : 0;
    const unchangedTableCover = Boolean(existingOrder)
        && normalizeOrderType(existingOrder.tipo || "tavolo") === tipo
        && tipo === "tavolo"
        && Number(existingOrder.numeroPersone) === Number(input.numeroPersone === undefined ? 1 : input.numeroPersone);
    const numeroCoperti = tipo === "tavolo"
        ? Number(input.numeroPersone === undefined ? 1 : input.numeroPersone)
        : 0;
    const legacyCoverRows = (existingOrder?.righe || []).filter(row =>
        typeof row?.prodotto === "string"
        && row.prodotto.trim().toLocaleLowerCase("it-IT") === "coperto"
    );
    const legacyCoverTotal = legacyCoverRows.reduce((sum, row) => {
        const rowTotal = Number(row.totale ?? row.prezzoBase ?? 0);
        return sum + (Number.isFinite(rowTotal) ? rowTotal : 0);
    }, 0);
    const originalCoverPrice = Number(existingOrder?.coperto?.prezzoUnitario) > 0
        ? Number(existingOrder.coperto.prezzoUnitario)
        : legacyCoverTotal > 0 && Number(existingOrder?.numeroPersone) > 0
            ? roundToCents(legacyCoverTotal / Number(existingOrder.numeroPersone))
            : 0;
    const prezzoCoperto = tipo === "tavolo" && unchangedTableCover && originalCoverPrice > 0
        ? originalCoverPrice
        : tipo === "tavolo" && copertoProductAvailable && menuCopertoPrice > 0
            ? menuCopertoPrice
            : 0;
    const coperto = prezzoCoperto > 0
        ? {
            persone: numeroCoperti,
            prezzoUnitario: prezzoCoperto,
            totale: roundToCents(numeroCoperti * prezzoCoperto)
        }
        : null;
    const menuByName = new Map(products.map(product => [product.nome, product]));
    const extraById = new Map(availableExtras.map(extra => [extra.id, extra]));
    const existingRowsByProduct = new Map();
    const existingSenzaByProduct = new Map();
    const conventionItems = [];
    for (const row of existingRows) {
        if (typeof row?.prodotto === "string") {
            if (!existingRowsByProduct.has(row.prodotto)) existingRowsByProduct.set(row.prodotto, []);
            existingRowsByProduct.get(row.prodotto).push(row);
            if (Array.isArray(row.senza)) {
                if (!existingSenzaByProduct.has(row.prodotto)) {
                    existingSenzaByProduct.set(row.prodotto, new Map());
                }
                for (const ingredient of row.senza) {
                    if (typeof ingredient !== "string" || !ingredient.trim()) continue;
                    const normalized = ingredient.trim().toLocaleLowerCase("it-IT");
                    if (!existingSenzaByProduct.get(row.prodotto).has(normalized)) {
                        existingSenzaByProduct.get(row.prodotto).set(normalized, ingredient.trim());
                    }
                }
            }
        }
    }
    const rows = input.righe.map(row => {
        if (!row || typeof row.prodotto !== "string") {
            throw httpError(400, "Una riga dell'ordine non e' valida.");
        }
        if (row.prodotto.trim().toLocaleLowerCase("it-IT") === "coperto") {
            throw httpError(400, "Il coperto viene aggiunto automaticamente.");
        }
        const product = menuByName.get(row.prodotto);
        if (!product) throw httpError(400, `Prodotto non presente nel menu: ${row.prodotto}`);
        const existingRow = existingRowsByProduct.get(product.nome)?.shift();
        const preservedExistingProduct = Boolean(existingRow);
        if (product.archiviato && !preservedExistingProduct) {
            throw httpError(400, `Il prodotto ${row.prodotto} e' archiviato.`);
        }
        if (!product.disponibile && !preservedExistingProduct) {
            throw httpError(400, `Il prodotto ${row.prodotto} e' esaurito.`);
        }
        if (typeof row.extra !== "undefined" && !Array.isArray(row.extra)) {
            throw httpError(400, "Gli extra dell'ordine non sono validi.");
        }
        const selectedExtras = (row.extra || []).map(reference => {
            const id = typeof reference === "string"
                ? (extraById.has(reference) ? reference : availableExtras.find(extra => extra.nome === reference)?.id)
                : reference && (
                    reference.id
                    || availableExtras.find(extra => extra.nome === reference.nome)?.id
                );
            const extra = id && extraById.get(id);
            if (!extra) throw httpError(400, "Extra non ammesso.");
            if (extra.archiviato) throw httpError(400, "L'extra selezionato e' archiviato.");
            if (!extra.disponibile) throw httpError(400, `L'extra ${extra.nome} non e' disponibile.`);
            return { id: extra.id, nome: extra.nome, prezzo: extra.prezzo };
        });
        if (selectedExtras.length && product.ammetteExtra !== true) {
            throw httpError(400, "Questo prodotto non consente extra.");
        }
        const ingredients = Array.isArray(product.ingredienti) ? product.ingredienti : [];
        const ingredientByName = new Map(existingSenzaByProduct.get(product.nome) || []);
        for (const ingredient of ingredients) {
            if (typeof ingredient === "string" && ingredient.trim()) {
                ingredientByName.set(ingredient.trim().toLocaleLowerCase("it-IT"), ingredient);
            }
        }
        const requested = row.senza === undefined ? [] : row.senza;
        if (!Array.isArray(requested) || requested.length > 10) {
            throw httpError(400, "Ingrediente non valido");
        }
        const selectedNames = new Set();
        const senza = requested.map(ingredient => {
            if (typeof ingredient !== "string") throw httpError(400, "Ingrediente non valido");
            const normalized = ingredient.trim().toLocaleLowerCase("it-IT");
            const canonical = ingredientByName.get(normalized);
            if (!canonical || selectedNames.has(normalized)) {
                throw httpError(400, "Ingrediente non valido");
            }
            selectedNames.add(normalized);
            return canonical;
        });
        const requestedNotes = row.note === undefined ? [] : row.note;
        if (!Array.isArray(requestedNotes) || requestedNotes.length > NOTE_RIGA.length) {
            throw httpError(400, "Nota pizza non valida");
        }
        const selectedNotes = new Set();
        const note = requestedNotes.map(value => {
            if (typeof value !== "string") throw httpError(400, "Nota pizza non valida");
            const normalized = value.trim().toLocaleLowerCase("it-IT");
            const canonical = NOTE_RIGA.find(item => item.toLocaleLowerCase("it-IT") === normalized);
            if (!canonical || selectedNotes.has(normalized)) {
                throw httpError(400, "Nota pizza non valida");
            }
            selectedNotes.add(normalized);
            return canonical;
        });
        const grossCents = toCents(product.prezzo)
            + selectedExtras.reduce((sum, extra) => sum + toCents(extra.prezzo), 0);
        const rowDiscount = normalizeRowDiscount(row.sconto, grossCents);
        conventionItems.push({
            tipo: productConvention(product),
            prezzoCentesimi: grossCents,
            scontata: Boolean(rowDiscount)
        });
        const netCents = grossCents - (rowDiscount ? toCents(rowDiscount.importo) : 0);
        return {
            prodotto: product.nome,
            categoria: product.categoria,
            ingredienti: ingredients,
            senza,
            note,
            prezzoBase: product.prezzo,
            extra: selectedExtras,
            totaleLordo: fromCents(grossCents),
            ...(rowDiscount ? { sconto: rowDiscount } : {}),
            totale: fromCents(netCents)
        };
    });
    const rowsNetCents = rows.reduce((sum, row) => sum + toCents(row.totale), 0);
    const rowsGrossCents = rows.reduce((sum, row) => sum + toCents(row.totaleLordo), 0);
    const coverCents = toCents(coperto?.totale || 0);
    const deliveryCents = toCents(tipo === "consegna" ? costoConsegna : 0);
    const discountableCents = rowsNetCents + coverCents;
    let orderDiscount = null;
    let convention = null;
    let orderDiscountCents = 0;
    let conventionCents = 0;
    if (requestedOrderDiscount) {
        const valueCents = requestedOrderDiscount.tipo === "importo"
            ? toCents(requestedOrderDiscount.valore)
            : orderDiscountRules.percentageDiscountCents(
                discountableCents,
                requestedOrderDiscount.valore
            );
        if (valueCents <= 0 || valueCents > discountableCents) {
            throw httpError(400, "Lo sconto sul totale supera l'importo scontabile.");
        }
        orderDiscountCents = valueCents;
        orderDiscount = {
            ...requestedOrderDiscount,
            ...(requestedOrderDiscount.tipo === "importo"
                ? { valore: fromCents(toCents(requestedOrderDiscount.valore)) }
                : {}),
            importo: fromCents(valueCents)
        };
    } else if (requestedConvention?.tipo === "percentuale") {
        conventionCents = orderDiscountRules.percentageDiscountCents(
            discountableCents,
            CONVENZIONE_PERCENTUALE
        );
        convention = {
            tipo: "percentuale",
            importo: fromCents(conventionCents)
        };
    } else if (requestedConvention?.tipo === "menu") {
        const result = orderDiscountRules.calculateMenuConvention(conventionItems);
        if (!result.menu) {
            throw httpError(400, "Per il menu convenzione servono una pizza e una bibita idonee.");
        }
        conventionCents = result.importo;
        convention = {
            tipo: "menu",
            importo: fromCents(conventionCents),
            menu: result.menu
        };
    }
    const totalGrossCents = rowsGrossCents + coverCents + deliveryCents;
    const totalCents = Math.max(
        0,
        discountableCents - orderDiscountCents - conventionCents + deliveryCents
    );
    return {
        tipo,
        costoConsegna: tipo === "consegna" ? costoConsegna : 0,
        orario,
        statoPagamento,
        tavoloOCliente: richiedeDestinazione ? tavoloOCliente : "",
        cognomeBanco,
        numeroPersone: tipo === "tavolo"
            ? Number(input.numeroPersone === undefined ? 1 : input.numeroPersone)
            : null,
        coperto,
        indirizzoConsegna,
        telefonoConsegna,
        telefonoRitiro,
        note: typeof input.note === "string" ? input.note.trim() : "",
        righe: rows,
        totaleLordo: fromCents(totalGrossCents),
        ...(orderDiscount ? { sconto: orderDiscount } : {}),
        ...(convention ? { convenzione: convention } : {}),
        totale: fromCents(totalCents)
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

function prepareDeliveryStatusUpdate(order, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw httpError(400, "La richiesta dello stato consegna non e' valida.");
    }
    if (normalizeOrderType(order.tipo || "tavolo") !== "consegna") {
        throw httpError(400, "Lo stato consegna puo' essere aggiornato solo per consegne.");
    }
    if (!deliveryStatuses.has(input.statoConsegna)) {
        throw httpError(400, "Stato consegna non valido.");
    }
    return { statoConsegna: input.statoConsegna };
}

function publicOrder(order) {
    const tipo = normalizeOrderType(order.tipo || "tavolo");
    const statoConsegna = deliveryStatuses.has(order.statoConsegna)
        ? order.statoConsegna
        : "da_consegnare";
    const tavoloChiuso = tipo === "tavolo" && order.tavoloChiuso === true;
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
        tavoloChiuso,
        chiusoAlle: tavoloChiuso ? order.chiusoAlle || null : null,
        tavoloOCliente: tipo === "consegna" || tipo === "banco" ? "" : order.tavoloOCliente || "",
        cognomeBanco: tipo === "banco" ? order.cognomeBanco || "" : "",
        numeroPersone: Number.isInteger(order.numeroPersone) ? order.numeroPersone : null,
        indirizzoConsegna: order.indirizzoConsegna || "",
        telefonoConsegna: order.telefonoConsegna || "",
        telefonoRitiro: order.telefonoRitiro || "",
        coperto: order.coperto || null,
        righe: (order.righe || []).map(row => ({
            ...row,
            note: Array.isArray(row.note) ? row.note : []
        })),
        totaleLordo: order.totaleLordo,
        ...(order.sconto ? { sconto: order.sconto } : {}),
        ...(order.convenzione ? { convenzione: order.convenzione } : {}),
        totale: order.totale,
        costoConsegna: tipo === "consegna" ? Number(order.costoConsegna || 0) : 0,
        ...(tipo === "consegna" ? {
            statoConsegna,
            ...(statoConsegna === "consegnata" && order.consegnataAlle
                ? { consegnataAlle: order.consegnataAlle }
                : {})
        } : {}),
        stampaCompletata: order.stampaCompletata === true,
        stampaInCoda: order.stampaInCoda === true,
        messaggioStampa: order.messaggioStampa || "Ordine salvato.",
        note: order.note || ""
    };
}

module.exports = {
    CONVENZIONE_PERCENTUALE,
    CONVENZIONE_PREZZO_MENU,
    filterOrdersByType,
    normalizeOrderType,
    prepareOrder,
    prepareDeliveryStatusUpdate,
    preparePaymentUpdate,
    publicOrder
};
