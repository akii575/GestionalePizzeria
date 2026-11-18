const { getFirebaseServices } = require("./firebase-admin");

const stores = new WeakMap();
const CACHE_MILLISECONDS = 60_000;

function sortByOrder(first, second) {
    return Number(first.ordine || 0) - Number(second.ordine || 0)
        || String(first.id).localeCompare(String(second.id));
}

function createMenuStore(db, {
    now = Date.now,
    cacheMilliseconds = CACHE_MILLISECONDS,
    onError = console.error,
    listenForVersionChanges = false
} = {}) {
    const versionRef = db.collection("metadata").doc("menuVersion");
    let cachedData = null;
    let cachedVersion = null;
    let expiresAt = 0;
    let unsubscribeVersion = null;

    function watchVersion() {
        if (!listenForVersionChanges || unsubscribeVersion || typeof versionRef.onSnapshot !== "function") return;
        unsubscribeVersion = versionRef.onSnapshot(snapshot => {
            const version = snapshot.exists ? Number(snapshot.data()?.versione || 0) : 0;
            if (version !== cachedVersion) {
                cachedData = null;
                expiresAt = 0;
            }
        }, error => {
            onError("Menu version listener failed:", error.code || error.name || "unknown");
            unsubscribeVersion = null;
        });
    }

    async function readCollection(name) {
        const snapshot = await db.collection(name).get();
        return snapshot.docs.map(document => ({
            ...document.data(),
            id: document.id
        }));
    }

    async function getMenuData() {
        watchVersion();
        const versionSnapshot = await versionRef.get();
        const version = versionSnapshot.exists ? Number(versionSnapshot.data()?.versione || 0) : 0;
        if (cachedData && cachedVersion === version && now() < expiresAt) return cachedData;

        const [categoryDocuments, productDocuments, extraDocuments] = await Promise.all([
            readCollection("menuCategorie"),
            readCollection("menuProdotti"),
            readCollection("menuExtra")
        ]);
        const allCategories = categoryDocuments.sort(sortByOrder);
        const categoriesById = new Map(allCategories.map(category => [category.id, category]));
        const allProducts = productDocuments.map(product => {
                const category = categoriesById.get(product.categoriaId);
                if (!category) return null;
                return {
                    id: product.id,
                    nome: product.nome,
                    categoria: product.categoriaId,
                    categoriaId: product.categoriaId,
                    categoriaNome: category.nome,
                    categoriaOrdine: Number(category.ordine || 0),
                    ammetteExtra: category.ammetteExtra === true,
                    prezzo: Number(Number(product.prezzo).toFixed(2)),
                    ingredienti: Array.isArray(product.ingredienti) ? product.ingredienti : [],
                    ordine: Number(product.ordine || 0),
                    disponibile: product.disponibile !== false,
                    archiviato: product.archiviato === true || category.archiviata === true
                };
            })
            .filter(Boolean);
        const categories = allCategories.filter(category => category.archiviata !== true);
        const menu = allProducts
            .filter(product => product.archiviato !== true)
            .sort((first, second) => first.categoriaOrdine - second.categoriaOrdine
                || first.ordine - second.ordine
                || first.id.localeCompare(second.id))
            .map(product => {
                const publicProduct = { ...product };
                delete publicProduct.archiviato;
                return publicProduct;
            });
        const allExtras = extraDocuments.map(extra => ({
                id: extra.id,
                nome: extra.nome,
                prezzo: Number(Number(extra.prezzo).toFixed(2)),
                ordine: Number(extra.ordine || 0),
                disponibile: extra.disponibile !== false,
                archiviato: extra.archiviato === true
            }))
            .sort(sortByOrder);
        const extras = allExtras
            .filter(extra => extra.archiviato !== true)
            .map(extra => {
                const publicExtra = { ...extra };
                delete publicExtra.archiviato;
                return publicExtra;
            });

        cachedData = { categories, menu, extras, allProducts, allExtras };
        cachedVersion = version;
        expiresAt = now() + cacheMilliseconds;
        return cachedData;
    }

    return {
        getMenuData,
        invalidate() {
            cachedData = null;
            expiresAt = 0;
        },
        stop() {
            unsubscribeVersion?.();
            unsubscribeVersion = null;
        }
    };
}

function getMenuData(db) {
    const firestore = db || getFirebaseServices().db;
    let store = stores.get(firestore);
    if (!store) {
        store = createMenuStore(firestore);
        stores.set(firestore, store);
    }
    return store.getMenuData();
}

module.exports = { createMenuStore, getMenuData };
