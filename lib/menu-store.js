const { getFirebaseServices } = require("./firebase-admin");
const { compareMenuItemsByName } = require("../src/main/resources/static/html-utils");

const stores = new WeakMap();
const CACHE_MILLISECONDS = 60_000;
const VERSION_CHECK_MILLISECONDS = 30_000;

function sortByOrder(first, second) {
    return Number(first.ordine || 0) - Number(second.ordine || 0)
        || String(first.id).localeCompare(String(second.id));
}

function categoriaContaForno(category) {
    return category.contaForno === undefined
        ? category.ammetteExtra === true
        : category.contaForno === true;
}

const DEFAULT_PRODUCT_CONVENTIONS = new Map([
    ["margherita", "pizza"],
    ["napoletana", "pizza"],
    ["margherita provola e pepe", "pizza"],
    ["coca cola 33cl", "bibita"],
    ["fanta 33cl", "bibita"],
    ["acqua 0,5l", "bibita"]
]);

function productConvention(product) {
    if (product.convenzione === "pizza" || product.convenzione === "bibita" || product.convenzione === "") {
        return product.convenzione;
    }
    if (product.convenzione !== undefined) return "";
    const name = typeof product.nome === "string"
        ? product.nome.trim().toLocaleLowerCase("it-IT")
        : "";
    return DEFAULT_PRODUCT_CONVENTIONS.get(name) || "";
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
    let lastReadVersion = null;
    let expiresAt = 0;
    let lastVersionCheckAt = -Infinity;
    let unsubscribeVersion = null;

    function watchVersion() {
        if (!listenForVersionChanges || unsubscribeVersion || typeof versionRef.onSnapshot !== "function") return;
        unsubscribeVersion = versionRef.onSnapshot(snapshot => {
            const version = snapshot.exists ? Number(snapshot.data()?.versione || 0) : 0;
            if (version !== cachedVersion) {
                cachedData = null;
                expiresAt = 0;
                lastReadVersion = null;
                lastVersionCheckAt = -Infinity;
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
        const currentTime = now();
        let version = lastReadVersion;
        if (cachedData && cachedVersion === lastReadVersion && currentTime >= expiresAt
                && currentTime - lastVersionCheckAt < VERSION_CHECK_MILLISECONDS) {
            expiresAt = currentTime + cacheMilliseconds;
            return cachedData;
        }
        if (lastReadVersion === null
                || currentTime - lastVersionCheckAt >= VERSION_CHECK_MILLISECONDS) {
            const versionSnapshot = await versionRef.get();
            version = versionSnapshot.exists ? Number(versionSnapshot.data()?.versione || 0) : 0;
            lastReadVersion = version;
            lastVersionCheckAt = currentTime;
        }
        if (cachedData && cachedVersion === version) {
            expiresAt = currentTime + cacheMilliseconds;
            return cachedData;
        }

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
                    contaForno: categoriaContaForno(category),
                    convenzione: productConvention(product),
                    componibile: product.componibile === true,
                    prezzo: Number(Number(product.prezzo).toFixed(2)),
                    ingredienti: Array.isArray(product.ingredienti) ? product.ingredienti : [],
                    ordine: Number(product.ordine || 0),
                    disponibile: product.disponibile !== false,
                    archiviato: product.archiviato === true || category.archiviata === true
                };
            })
            .filter(Boolean);
        const categories = allCategories
            .filter(category => category.archiviata !== true)
            .map(category => {
                const stampaCucina = category.stampaCucina !== false;
                return {
                    ...category,
                    contaForno: categoriaContaForno(category),
                    stampaCucina,
                    stampaVariazioni: category.stampaVariazioni === undefined
                        ? stampaCucina
                        : category.stampaVariazioni === true
                };
            });
        const menu = allProducts
            .filter(product => product.archiviato !== true)
            .sort((first, second) => first.categoriaOrdine - second.categoriaOrdine
                || compareMenuItemsByName(first, second))
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
            .sort(compareMenuItemsByName);
        const extras = allExtras
            .filter(extra => extra.archiviato !== true)
            .map(extra => {
                const publicExtra = { ...extra };
                delete publicExtra.archiviato;
                return publicExtra;
            });

        const nextCachedData = { categories, menu, extras, allProducts, allExtras };
        cachedVersion = version;
        cachedData = nextCachedData;
        expiresAt = now() + cacheMilliseconds;
        return cachedData;
    }

    return {
        getMenuData,
        getVersion() {
            return cachedVersion;
        },
        invalidate() {
            cachedData = null;
            expiresAt = 0;
            cachedVersion = null;
            lastReadVersion = null;
            lastVersionCheckAt = -Infinity;
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

function getMenuVersion(db) {
    const firestore = db || getFirebaseServices().db;
    return stores.get(firestore)?.getVersion() ?? null;
}

module.exports = { createMenuStore, getMenuData, getMenuVersion, productConvention };
