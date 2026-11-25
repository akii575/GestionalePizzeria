const { api, methodNotAllowed } = require("../api");
const { httpError, requireAdmin } = require("../auth");
const { getFirebaseServices } = require("../firebase-admin");
const { getRomeDayRange, currentServiceDayInRome } = require("../rome-day-range");
const {
    addOrder,
    emptySummary,
    mergeSummary,
    orderServiceDay
} = require("../serate");

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function dateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = new Date(0);
    date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setUTCHours(0, 0, 0, 0);
    return date;
}

function dateKey(date) {
    return [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

function shiftDate(value, days) {
    const date = dateParts(value);
    date.setUTCDate(date.getUTCDate() + days);
    return dateKey(date);
}

function validatePeriod(startDate, endDate) {
    if (typeof startDate !== "string" || typeof endDate !== "string") {
        throw httpError(400, "Indica entrambe le date nel formato AAAA-MM-GG.");
    }
    getRomeDayRange(startDate);
    getRomeDayRange(endDate);
    const days = (dateParts(endDate).getTime() - dateParts(startDate).getTime()) / DAY_MILLISECONDS + 1;
    if (days < 1 || days > 366) {
        throw httpError(400, "L'intervallo deve essere valido e non superare 366 giorni.");
    }
    return days;
}

function listDates(startDate, days) {
    return Array.from({ length: days }, (_, index) => shiftDate(startDate, index));
}

async function readPeriod(db, startDate, endDate, dates) {
    const serate = db.collection("serate");
    const partialSnapshotsPromise = Promise.all(dates.map(date => serate.doc(date).get()));
    const { start } = getRomeDayRange(startDate);
    const { end } = getRomeDayRange(endDate);
    const ordersPromise = db.collection("orders")
        .where("dataOra", ">=", start)
        .where("dataOra", "<", end)
        .get();
    const [partialSnapshots, orderSnapshot] = await Promise.all([
        partialSnapshotsPromise,
        ordersPromise
    ]);

    const summaries = new Map(dates.map(date => [date, emptySummary()]));
    partialSnapshots.forEach((snapshot, index) => {
        const partials = snapshot.data()?.parziali || {};
        for (const partial of Object.values(partials)) {
            mergeSummary(summaries.get(dates[index]), partial);
        }
    });
    for (const document of orderSnapshot.docs) {
        const order = document.data();
        const date = orderServiceDay(order);
        if (summaries.has(date)) addOrder(summaries.get(date), order);
    }

    return summaries;
}

function hasSummaryData(summary) {
    return summary.comande > 0 || summary.incasso !== 0 || summary.coperti > 0;
}

function totalFor(summaries) {
    const total = emptySummary();
    for (const summary of summaries.values()) mergeSummary(total, summary);
    return total;
}

module.exports = api(async (req, res) => {
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    await requireAdmin(req);
    res.setHeader("Cache-Control", "no-store");

    const query = req.query || {};
    const days = validatePeriod(query.da, query.a);
    const previousStart = shiftDate(query.da, -days);
    const previousEnd = shiftDate(query.da, -1);
    const { db } = getFirebaseServices();
    const [summaries, previousSummaries] = await Promise.all([
        readPeriod(db, query.da, query.a, listDates(query.da, days)),
        readPeriod(
            db,
            previousStart,
            previousEnd,
            listDates(previousStart, days)
        )
    ]);
    const currentDay = currentServiceDayInRome();
    const serate = [...summaries.entries()]
        .filter(([, summary]) => hasSummaryData(summary))
        .map(([data, summary]) => ({
            data,
            incasso: summary.incasso,
            comande: summary.comande,
            coperti: summary.coperti,
            perTipo: summary.perTipo,
            inCorso: data === currentDay
        }));
    const total = totalFor(summaries);
    const previousTotal = totalFor(previousSummaries);

    return res.status(200).json({
        serate,
        totali: {
            incasso: total.incasso,
            comande: total.comande,
            coperti: total.coperti,
            scontrinoMedio: total.comande
                ? Math.round((total.incasso / total.comande + Number.EPSILON) * 100) / 100
                : 0
        },
        periodoPrecedente: {
            incasso: previousTotal.incasso,
            comande: previousTotal.comande
        }
    });
});
