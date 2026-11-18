const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Timestamp } = require("firebase-admin/firestore");
const { getFirebaseServices } = require("../lib/firebase-admin");

const root = path.join(__dirname, "..");
const CATEGORIE_CON_EXTRA_LEGACY = new Set(["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"]);
const menu = JSON.parse(fs.readFileSync(path.join(root, "lib", "menu.json"), "utf8"));
const extras = JSON.parse(fs.readFileSync(path.join(root, "lib", "extras.json"), "utf8"));
const orderPage = fs.readFileSync(path.join(root, "src", "main", "resources", "static", "ordini.html"), "utf8");
const labels = new Map(
    [...orderPage.matchAll(/<button[^>]*data-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g)]
        .map(([, category, label]) => [category, label.trim()])
);

function roundedPrice(value) {
    return Number(Number(value).toFixed(2));
}

function productId(name) {
    const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const suffix = crypto.createHash("sha256").update(name).digest("hex").slice(0, 8);
    return `${slug || "prodotto"}-${suffix}`;
}

function buildSeedData() {
    const categoryNames = [...new Set(menu.map(product => product.categoria))];
    const sourceOrder = new Map(categoryNames.map((category, index) => [category, index]));
    const categoryOrder = [...categoryNames].sort((first, second) => {
        const firstRank = [...labels.keys()].indexOf(first);
        const secondRank = [...labels.keys()].indexOf(second);
        if (firstRank < 0 && secondRank < 0) return sourceOrder.get(first) - sourceOrder.get(second);
        if (firstRank < 0) return 1;
        if (secondRank < 0) return -1;
        return firstRank - secondRank;
    });
    const categories = categoryOrder.map((id, ordine) => ({
        id,
        data: {
            nome: labels.get(id) || id.replace(/\b\w/g, character => character.toLocaleUpperCase("it-IT")),
            ordine,
            ammetteExtra: CATEGORIE_CON_EXTRA_LEGACY.has(id),
            archiviata: false
        }
    }));
    const grouped = new Map(categoryOrder.map(category => [category, []]));
    for (const product of menu) grouped.get(product.categoria).push(product);
    const products = [];
    for (const category of categoryOrder) {
        grouped.get(category)
            .sort((first, second) => first.nome.localeCompare(second.nome, "it", { sensitivity: "base" }))
            .forEach((product, ordine) => products.push({
                id: productId(product.nome),
                data: {
                    nome: product.nome,
                    categoriaId: category,
                    prezzo: roundedPrice(product.prezzo),
                    ingredienti: Array.isArray(product.ingredienti) ? product.ingredienti : [],
                    ordine,
                    disponibile: true,
                    archiviato: false
                }
            }));
    }
    return {
        categories,
        products,
        extras: extras.map((extra, ordine) => ({
            id: extra.id,
            data: {
                nome: extra.nome,
                prezzo: roundedPrice(extra.prezzo),
                ordine,
                disponibile: true,
                archiviato: false
            }
        }))
    };
}

function valuesMatch(current, expected) {
    return Object.entries(expected).every(([key, value]) => JSON.stringify(current?.[key]) === JSON.stringify(value));
}

async function seedMenu({ dryRun = false, db = null, log = console.log } = {}) {
    const seed = buildSeedData();
    const counts = {
        menuCategorie: seed.categories.length,
        menuProdotti: seed.products.length,
        menuExtra: seed.extras.length
    };
    if (dryRun) {
        log(`Dry run: ${counts.menuCategorie} categorie, ${counts.menuProdotti} prodotti, ${counts.menuExtra} extra.`);
        return { ...counts, writes: 0 };
    }

    const firestore = db || getFirebaseServices().db;
    const collections = [
        ["menuCategorie", seed.categories],
        ["menuProdotti", seed.products],
        ["menuExtra", seed.extras]
    ];
    const snapshots = await Promise.all(collections.map(([name]) => firestore.collection(name).get()));
    const batch = firestore.batch();
    let writes = 0;
    for (let index = 0; index < collections.length; index++) {
        const [name, records] = collections[index];
        const existing = new Map(snapshots[index].docs.map(document => [document.id, document.data()]));
        const expectedIds = new Set(records.map(record => record.id));
        for (const record of records) {
            const current = existing.get(record.id);
            if (valuesMatch(current, record.data)
                    && (name !== "menuProdotti" || current.aggiornatoIl)) continue;
            const data = { ...record.data };
            if (name === "menuProdotti") data.aggiornatoIl = Timestamp.now();
            batch.set(firestore.collection(name).doc(record.id), data);
            writes++;
        }
        for (const document of snapshots[index].docs) {
            if (expectedIds.has(document.id) || document.data().archiviato === true
                    || document.data().archiviata === true) continue;
            const archiveField = name === "menuCategorie" ? "archiviata" : "archiviato";
            batch.update(document.ref, { [archiveField]: true });
            writes++;
        }
    }
    if (writes) {
        const versionRef = firestore.collection("metadata").doc("menuVersion");
        const versionSnapshot = await versionRef.get();
        const versione = Number(versionSnapshot.data()?.versione || 0) + 1;
        batch.set(versionRef, { versione, aggiornatoIl: Timestamp.now() });
        await batch.commit();
    }
    log(`Menu importato: ${counts.menuCategorie} categorie, ${counts.menuProdotti} prodotti, ${counts.menuExtra} extra; ${writes} modifiche.`);
    return { ...counts, writes };
}

if (require.main === module) {
    seedMenu({ dryRun: process.argv.includes("--dry-run") })
        .catch(error => {
            console.error("Import menu non riuscito:", error.code || error.name || "unknown");
            process.exitCode = 1;
        });
}

module.exports = { buildSeedData, seedMenu };
