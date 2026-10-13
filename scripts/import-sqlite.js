const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");
const { getFirebaseServices } = require("../lib/firebase-admin");
const { extras, menu } = require("../lib/orders");

const extraByName = new Map(extras.map(extra => [extra.nome, extra]));
const productByName = new Map(menu.map(product => [product.nome, product]));
const batchSize = 450;

async function readLocalOrders(filename) {
    const file = path.resolve(filename);
    const bytes = fs.readFileSync(file);
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    const database = new SQL.Database(new Uint8Array(bytes));
    try {
        const columns = database.exec("PRAGMA table_info(ordini)")[0]?.values.map(column => column[1]) || [];
        if (!columns.includes("numero") || !columns.includes("data_ora") ||
            !columns.includes("tavolo_cliente") || !columns.includes("totale")) {
            throw new Error("SQLite database does not contain the expected orders table.");
        }
        const noteField = columns.includes("note") ? "o.note" : "''";
        const query = `SELECT o.numero, o.data_ora, o.tavolo_cliente, ${noteField}, o.totale, `
            + "r.prodotto, r.prezzo_base, r.extra FROM ordini o "
            + "JOIN righe_ordine r ON r.ordine_numero = o.numero ORDER BY o.numero, r.id";
        const rows = database.exec(query)[0]?.values || [];
        const orders = new Map();
        for (const [numero, dataOra, tavolo, note, total, productName, basePrice, extraNames] of rows) {
            let order = orders.get(numero);
            if (!order) {
                order = {
                    numero: Number(numero),
                    dataOra: String(dataOra),
                    tavoloOCliente: String(tavolo),
                    note: note == null ? "" : String(note),
                    totale: Number(total),
                    righe: []
                };
                orders.set(numero, order);
            }
            if (!productByName.has(productName)) {
                throw new Error(`SQLite order ${numero} contains a product absent from the current menu.`);
            }
            const selectedExtras = extraNames
                ? String(extraNames).split("|").filter(Boolean).map(name => {
                    const extra = extraByName.get(name);
                    if (!extra) throw new Error(`SQLite order ${numero} contains an unknown extra.`);
                    return extra;
                })
                : [];
            const price = Number(basePrice);
            const lineTotal = price + selectedExtras.reduce((sum, extra) => sum + extra.prezzo, 0);
            order.righe.push({
                prodotto: productName,
                prezzoBase: price,
                extra: selectedExtras,
                totale: Number(lineTotal.toFixed(2))
            });
        }
        return [...orders.values()];
    } finally {
        database.close();
    }
}

async function importSqlite(filename) {
    const absoluteFile = path.resolve(filename);
    const ordersToImport = await readLocalOrders(absoluteFile);
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(absoluteFile)).digest("hex");
    if (process.argv.includes("--dry-run")) {
        console.log(`SQLite import check complete: ${ordersToImport.length} orders are valid.`);
        return;
    }

    const { db } = getFirebaseServices();
    const collection = db.collection("orders");
    const marker = db.collection("metadata").doc("sqliteImport");
    const markerSnapshot = await marker.get();
    let imported = 0;

    if (markerSnapshot.exists) {
        const state = markerSnapshot.data();
        if (state.status === "complete" && state.sourceHash === sourceHash) {
            console.log(`This SQLite database has already been imported (${state.total} orders).`);
            return;
        }
        if (state.status !== "importing" || state.sourceHash !== sourceHash) {
            throw new Error("A different SQLite import has already started; refusing to overwrite its state.");
        }
        imported = state.imported;
    } else {
        const existing = await collection.limit(1).get();
        if (!existing.empty) {
            throw new Error("Firestore already contains orders; SQLite import requires an empty orders collection.");
        }
        await marker.create({
            status: "importing",
            sourceHash,
            total: ordersToImport.length,
            imported: 0
        });
    }

    while (imported < ordersToImport.length) {
        const end = Math.min(imported + batchSize, ordersToImport.length);
        const batch = db.batch();
        for (const order of ordersToImport.slice(imported, end)) {
            if (!Number.isSafeInteger(order.numero) || order.numero < 1) {
                throw new Error("SQLite database contains an invalid order number.");
            }
            batch.create(collection.doc(String(order.numero)), order);
        }
        batch.update(marker, { imported: end });
        await batch.commit();
        imported = end;
        console.log(`Imported ${imported} of ${ordersToImport.length} orders.`);
    }

    const counter = db.collection("metadata").doc("orderCounter");
    const batch = db.batch();
    batch.set(counter, { value: ordersToImport.reduce((max, order) => Math.max(max, order.numero), 0) });
    batch.update(marker, { status: "complete", imported: ordersToImport.length });
    await batch.commit();
    console.log("SQLite orders imported successfully.");
}

const filename = process.argv.slice(2).find(argument => !argument.startsWith("--"))
    || path.join(__dirname, "..", "data", "pizzeria.db");
importSqlite(filename).catch(error => {
    console.error("SQLite import failed:", error.code || error.message);
    process.exitCode = 1;
});
