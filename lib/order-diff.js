function rowKey(row) {
    const rowExtras = Array.isArray(row.extra) ? row.extra : [];
    const extras = rowExtras
        .map(extra => typeof extra === "string" ? extra : extra?.nome || "")
        .sort((first, second) => first.localeCompare(second, "it"));
    const basePrice = Number(row.prezzoBase ?? row.prezzo ?? 0);
    const extrasPrice = rowExtras.reduce((sum, extra) => (
        sum + Number(typeof extra === "string" ? 0 : extra?.prezzo || 0)
    ), 0);
    const price = Number(row.totale ?? basePrice + extrasPrice);
    return JSON.stringify([row.prodotto, extras, Number.isFinite(price) ? price : 0]);
}

function diffRighe(vecchie, nuove) {
    const rowsByKey = new Map();
    const matched = new Set();
    for (let index = 0; index < vecchie.length; index++) {
        const key = rowKey(vecchie[index]);
        if (!rowsByKey.has(key)) rowsByKey.set(key, []);
        rowsByKey.get(key).push(index);
    }

    const aggiunte = [];
    for (const row of nuove) {
        const matches = rowsByKey.get(rowKey(row));
        if (matches?.length) {
            matched.add(matches.shift());
        } else {
            aggiunte.push(row);
        }
    }

    const rimosse = vecchie.filter((_, index) => !matched.has(index));
    return { aggiunte, rimosse };
}

module.exports = { diffRighe };
