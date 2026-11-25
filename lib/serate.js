const { currentServiceDayInRome } = require("./rome-day-range");

const TYPES = ["tavolo", "banco", "ritiro", "consegna"];
const MAX_PRODUCTS = 300;
const romeHourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hourCycle: "h23"
});

function roundToCents(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptySummary() {
    return {
        incasso: 0,
        comande: 0,
        coperti: 0,
        perTipo: Object.fromEntries(TYPES.map(type => [type, { comande: 0, incasso: 0 }])),
        prodotti: {},
        ore: {}
    };
}

function orderServiceDay(order) {
    const date = new Date(order.dataOra);
    if (Number.isNaN(date.valueOf())) {
        throw new Error("Un ordine contiene una data non valida e non può essere archiviato.");
    }
    return currentServiceDayInRome(date);
}

function orderType(order) {
    const type = order.tipo === "sala" ? "tavolo" : order.tipo || "tavolo";
    return TYPES.includes(type) ? type : "tavolo";
}

function amount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundToCents(parsed) : 0;
}

function addOrder(summary, order) {
    const type = orderType(order);
    const total = amount(order.totale);
    summary.comande++;
    summary.incasso = roundToCents(summary.incasso + total);
    summary.perTipo[type].comande++;
    summary.perTipo[type].incasso = roundToCents(summary.perTipo[type].incasso + total);
    if (type === "tavolo" && Number.isInteger(order.numeroPersone) && order.numeroPersone > 0) {
        summary.coperti += order.numeroPersone;
    }

    for (const row of Array.isArray(order.righe) ? order.righe : []) {
        if (typeof row?.prodotto !== "string" || !row.prodotto.trim()) continue;
        const quantity = Number(row.quantita);
        const count = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        const product = summary.prodotti[row.prodotto] || { quantita: 0, incasso: 0 };
        product.quantita += count;
        product.incasso = roundToCents(product.incasso + amount(row.totale));
        summary.prodotti[row.prodotto] = product;
    }

    const hour = romeHourFormatter.formatToParts(new Date(order.dataOra))
        .find(part => part.type === "hour")?.value;
    if (hour) summary.ore[hour] = (summary.ore[hour] || 0) + 1;
}

function groupOrdersByServiceDay(orders) {
    const summaries = new Map();
    for (const order of orders) {
        const date = orderServiceDay(order);
        if (!summaries.has(date)) summaries.set(date, emptySummary());
        addOrder(summaries.get(date), order);
    }
    return summaries;
}

function limitedProducts(products) {
    return Object.fromEntries(Object.entries(products)
        .sort((first, second) =>
            second[1].incasso - first[1].incasso
            || second[1].quantita - first[1].quantita
            || first[0].localeCompare(second[0], "it"))
        .slice(0, MAX_PRODUCTS));
}

function finalizeSummary(summary) {
    return {
        incasso: amount(summary.incasso),
        comande: Number(summary.comande) || 0,
        coperti: Number(summary.coperti) || 0,
        perTipo: Object.fromEntries(TYPES.map(type => [type, {
            comande: Number(summary.perTipo?.[type]?.comande) || 0,
            incasso: amount(summary.perTipo?.[type]?.incasso)
        }])),
        prodotti: Object.fromEntries(Object.entries(limitedProducts(summary.prodotti || {}))
            .map(([name, product]) => [name, {
                quantita: Number(product.quantita) || 0,
                incasso: amount(product.incasso)
            }])),
        ore: summary.ore && typeof summary.ore === "object" ? summary.ore : {}
    };
}

function mergeSummary(target, source) {
    target.incasso = roundToCents(target.incasso + amount(source?.incasso));
    target.comande += Number(source?.comande) || 0;
    target.coperti += Number(source?.coperti) || 0;
    for (const type of TYPES) {
        target.perTipo[type].comande += Number(source?.perTipo?.[type]?.comande) || 0;
        target.perTipo[type].incasso = roundToCents(
            target.perTipo[type].incasso + amount(source?.perTipo?.[type]?.incasso)
        );
    }
    for (const [name, product] of Object.entries(source?.prodotti || {})) {
        const existing = target.prodotti[name] || { quantita: 0, incasso: 0 };
        existing.quantita += Number(product?.quantita) || 0;
        existing.incasso = roundToCents(existing.incasso + amount(product?.incasso));
        target.prodotti[name] = existing;
    }
    for (const [hour, count] of Object.entries(source?.ore || {})) {
        target.ore[hour] = (target.ore[hour] || 0) + (Number(count) || 0);
    }
}

async function saveNightSummaries(db, resetId, orders) {
    const summaries = groupOrdersByServiceDay(orders);
    if (!summaries.size) return;
    if (summaries.size > 500) {
        throw new Error("Gli ordini coprono troppe giornate per salvare i riepiloghi in modo atomico.");
    }

    const serate = db.collection("serate");
    const entries = [...summaries.entries()].sort(([first], [second]) => first.localeCompare(second));
    const references = entries.map(([date]) => serate.doc(date));
    await db.runTransaction(async transaction => {
        const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
        entries.forEach(([, summary], index) => {
            const previousPartials = snapshots[index].data()?.parziali || {};
            transaction.set(references[index], {
                parziali: {
                    ...previousPartials,
                    [resetId]: finalizeSummary(summary)
                }
            }, { merge: true });
        });
    });
}

module.exports = {
    TYPES,
    addOrder,
    emptySummary,
    finalizeSummary,
    groupOrdersByServiceDay,
    mergeSummary,
    orderServiceDay,
    saveNightSummaries
};
