const test = require("node:test");
const assert = require("node:assert/strict");

function createDatabase(seed) {
    const data = Object.fromEntries(
        Object.entries(seed).map(([name, documents]) => [name, new Map(Object.entries(documents))])
    );
    let nextId = 0;
    const refs = new Map();

    function collection(name) {
        if (!refs.has(name)) {
            refs.set(name, {
                kind: "collection",
                name,
                doc(id) {
                    const ref = {
                        kind: "document",
                        collection: name,
                        id: id || `created-${++nextId}`
                    };
                    ref.get = async () => {
                        const value = data[name]?.get(ref.id);
                        return { exists: value !== undefined, data: () => value };
                    };
                    return ref;
                },
                async get() {
                    const documents = data[name] || new Map();
                    return {
                        docs: [...documents].map(([id, value]) => ({
                            id,
                            ref: collection(name).doc(id),
                            data: () => value
                        }))
                    };
                }
            });
        }
        return refs.get(name);
    }

    return {
        collection,
        async runTransaction(callback) {
            return callback({
                async get(reference) {
                    const documents = data[reference.name || reference.collection] || new Map();
                    if (reference.kind === "collection") {
                        return {
                            docs: [...documents].map(([id, value]) => ({
                                id,
                                ref: collection(reference.name).doc(id),
                                data: () => value
                            }))
                        };
                    }
                    const value = documents.get(reference.id);
                    return {
                        id: reference.id,
                        ref: reference,
                        exists: value !== undefined,
                        data: () => value
                    };
                },
                set(reference, value) {
                    if (!data[reference.collection]) data[reference.collection] = new Map();
                    data[reference.collection].set(reference.id, { ...value });
                },
                update(reference, value) {
                    const current = data[reference.collection]?.get(reference.id);
                    if (!current) throw new Error("Missing document");
                    data[reference.collection].set(reference.id, { ...current, ...value });
                },
                delete(reference) {
                    data[reference.collection]?.delete(reference.id);
                }
            });
        },
        get(name, id) {
            return data[name]?.get(id);
        }
    };
}

function createSeed() {
    return {
        metadata: { menuVersion: { versione: 3 } },
        orders: { "000000000001": { numero: "000000000001", righe: ["Margherita"] } },
        menuCategorie: {
            pizze: { nome: "Pizze", ordine: 0, ammetteExtra: true, archiviata: false },
            dolci: { nome: "Dolci", ordine: 1, ammetteExtra: false, archiviata: false },
            hidden: { nome: "Archivio", ordine: 2, ammetteExtra: false, archiviata: true }
        },
        menuProdotti: {
            margherita: {
                nome: "Margherita",
                categoriaId: "pizze",
                prezzo: 5,
                ingredienti: ["Pomodoro"],
                ordine: 0,
                disponibile: true,
                archiviato: false
            },
            marinara: {
                nome: "Marinara",
                categoriaId: "pizze",
                prezzo: 4.5,
                ingredienti: [],
                ordine: 1,
                disponibile: true,
                archiviato: false
            }
        },
        menuExtra: {
            bocconcino: { nome: "Bocconcino", prezzo: 2, ordine: 0, disponibile: true, archiviato: false },
            hidden: { nome: "Extra vecchio", prezzo: 1, ordine: 1, disponibile: true, archiviato: true }
        }
    };
}

let services;
const firebasePath = require.resolve("../lib/firebase-admin");
require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { getFirebaseServices: () => services }
};
const handler = require("../api/menu-admin");

function invoke(method = "GET", { token, body, origin = "https://example.test" } = {}) {
    return new Promise(resolve => {
        const response = {
            headers: {},
            status(statusCode) {
                this.statusCode = statusCode;
                return this;
            },
            json(value) {
                this.body = value;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        void handler({
            method,
            body,
            headers: {
                host: "example.test",
                ...(origin ? { origin } : {}),
                ...(token ? { cookie: `__Host-session=${token}` } : {})
            }
        }, response);
    });
}

function useDatabase(seed = createSeed()) {
    const db = createDatabase(seed);
    services = {
        db,
        auth: {
            async verifySessionCookie(token) {
                if (token === "admin") return { admin: true };
                if (token === "staff") return { staff: true };
                if (token === "delivery") return { delivery: true };
                return {};
            }
        }
    };
    return db;
}

test("menu admin API allows only admins and returns archived records", async () => {
    useDatabase();
    const adminResponse = await invoke("GET", { token: "admin" });
    assert.equal(adminResponse.statusCode, 200);
    assert.equal(adminResponse.body.categorie.length, 3);
    assert.equal(adminResponse.body.prodotti.length, 2);
    assert.equal(adminResponse.body.extra.length, 2);
    assert.equal(adminResponse.body.versione, 3);
    assert.equal(adminResponse.headers["Cache-Control"], "no-store");

    for (const token of ["staff", "delivery"]) {
        const denied = await invoke("GET", { token });
        assert.equal(denied.statusCode, 403);
        assert.equal(denied.body.errore, "Accesso negato.");
    }
    const unauthenticated = await invoke("GET");
    assert.equal(unauthenticated.statusCode, 401);
});

test("menu admin API validates names, prices, ingredients, categories and uniqueness", async () => {
    useDatabase();
    const invalidName = await invoke("POST", {
        token: "admin",
        body: { risorsa: "categorie", nome: "   ", ammetteExtra: false }
    });
    assert.equal(invalidName.statusCode, 400);
    const tooLongName = await invoke("POST", {
        token: "admin",
        body: { risorsa: "categorie", nome: "x".repeat(81), ammetteExtra: false }
    });
    assert.equal(tooLongName.statusCode, 400);

    const tooManyDecimals = await invoke("POST", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            nome: "Pizza nuova",
            categoriaId: "pizze",
            prezzo: 1.234,
            ingredienti: []
        }
    });
    assert.equal(tooManyDecimals.statusCode, 400);

    const invalidIngredients = await invoke("POST", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            nome: "Pizza nuova",
            categoriaId: "pizze",
            prezzo: 1.23,
            ingredienti: ["pomodoro", 2]
        }
    });
    assert.equal(invalidIngredients.statusCode, 400);

    const archivedCategory = await invoke("POST", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            nome: "Pizza nuova",
            categoriaId: "hidden",
            prezzo: 1,
            ingredienti: []
        }
    });
    assert.equal(archivedCategory.statusCode, 400);

    const duplicateCategory = await invoke("POST", {
        token: "admin",
        body: { risorsa: "categorie", nome: " pizze ", ammetteExtra: false }
    });
    assert.equal(duplicateCategory.statusCode, 409);

    const duplicateProduct = await invoke("POST", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            nome: " margherita ",
            categoriaId: "pizze",
            prezzo: 1,
            ingredienti: []
        }
    });
    assert.equal(duplicateProduct.statusCode, 409);

    const duplicateExtra = await invoke("POST", {
        token: "admin",
        body: { risorsa: "extra", nome: " bocconcino ", prezzo: 1 }
    });
    assert.equal(duplicateExtra.statusCode, 409);
});

test("menu admin API creates and updates records while incrementing the menu version", async () => {
    const db = useDatabase();
    const createdCategory = await invoke("POST", {
        token: "admin",
        body: { risorsa: "categorie", nome: "Bevande", ammetteExtra: false }
    });
    assert.equal(createdCategory.statusCode, 201);
    assert.equal(createdCategory.body.versione, 4);
    const categoryId = createdCategory.body.id;
    assert.equal(db.get("menuCategorie", categoryId).ordine, 3);

    const createdProduct = await invoke("POST", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            nome: "Acqua",
            categoriaId: categoryId,
            prezzo: 1.2,
            ingredienti: ["Fredda"],
            disponibile: false
        }
    });
    assert.equal(createdProduct.body.versione, 5);
    assert.equal(db.get("menuProdotti", createdProduct.body.id).disponibile, false);

    const updatedProduct = await invoke("PUT", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            id: createdProduct.body.id,
            nome: "Acqua frizzante",
            categoriaId: categoryId,
            prezzo: 1.5,
            ingredienti: []
        }
    });
    assert.equal(updatedProduct.body.versione, 6);
    assert.equal(db.get("menuProdotti", createdProduct.body.id).prezzo, 1.5);
    assert.equal(db.get("menuProdotti", createdProduct.body.id).disponibile, false);
});

test("menu admin API toggles availability, archives and restores records", async () => {
    const db = useDatabase();
    const soldOut = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "prodotti", id: "margherita", disponibile: false }
    });
    assert.equal(soldOut.body.versione, 4);
    assert.equal(db.get("menuProdotti", "margherita").disponibile, false);

    const archived = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "extra", id: "bocconcino", archiviato: true }
    });
    assert.equal(archived.body.versione, 5);
    assert.equal(db.get("menuExtra", "bocconcino").archiviato, true);

    const restored = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "extra", id: "bocconcino", archiviato: false }
    });
    assert.equal(restored.body.versione, 6);
    assert.equal(db.get("menuExtra", "bocconcino").archiviato, false);

    const archivedProduct = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "prodotti", id: "margherita", archiviato: true }
    });
    assert.equal(archivedProduct.body.versione, 7);
    assert.equal(db.get("menuProdotti", "margherita").archiviato, true);

    const restoredProduct = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "prodotti", id: "margherita", archiviato: false }
    });
    assert.equal(restoredProduct.body.versione, 8);

    const archivedCategory = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "categorie", id: "dolci", archiviata: true }
    });
    assert.equal(archivedCategory.body.versione, 9);
    assert.equal(db.get("menuCategorie", "dolci").archiviata, true);

    const restoredCategory = await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "categorie", id: "dolci", archiviata: false }
    });
    assert.equal(restoredCategory.body.versione, 10);
    assert.equal(db.get("menuCategorie", "dolci").archiviata, false);
});

test("menu admin API reorders categories and products transactionally", async () => {
    const db = useDatabase();
    const products = await invoke("PUT", {
        token: "admin",
        body: {
            risorsa: "prodotti",
            azione: "ordine",
            categoriaId: "pizze",
            ids: ["marinara", "margherita"]
        }
    });
    assert.equal(products.body.versione, 4);
    assert.equal(db.get("menuProdotti", "marinara").ordine, 0);
    assert.equal(db.get("menuProdotti", "margherita").ordine, 1);

    const categories = await invoke("PUT", {
        token: "admin",
        body: { risorsa: "categorie", azione: "ordine", ids: ["dolci", "pizze"] }
    });
    assert.equal(categories.body.versione, 5);
    assert.equal(db.get("menuCategorie", "dolci").ordine, 0);
    assert.equal(db.get("menuCategorie", "pizze").ordine, 1);

    const invalidOrder = await invoke("PUT", {
        token: "admin",
        body: { risorsa: "categorie", azione: "ordine", ids: ["pizze", "pizze"] }
    });
    assert.equal(invalidOrder.statusCode, 400);
});

test("menu admin API rejects mutations from unauthenticated or cross-origin requests", async () => {
    useDatabase();
    const unauthenticated = await invoke("POST", {
        body: { risorsa: "categorie", nome: "Nuova", ammetteExtra: false }
    });
    assert.equal(unauthenticated.statusCode, 401);
    const crossOrigin = await invoke("POST", {
        token: "admin",
        origin: "https://untrusted.example",
        body: { risorsa: "categorie", nome: "Nuova", ammetteExtra: false }
    });
    assert.equal(crossOrigin.statusCode, 403);
});

test("menu admin API permanently deletes only archived records and increments the version", async () => {
    const db = useDatabase();
    const savedOrder = db.get("orders", "000000000001");

    for (const token of ["staff", "delivery"]) {
        const denied = await invoke("DELETE", {
            token,
            body: { risorsa: "extra", id: "hidden" }
        });
        assert.equal(denied.statusCode, 403);
    }
    const unauthenticated = await invoke("DELETE", {
        body: { risorsa: "extra", id: "hidden" }
    });
    assert.equal(unauthenticated.statusCode, 401);
    const crossOrigin = await invoke("DELETE", {
        token: "admin",
        origin: "https://untrusted.example",
        body: { risorsa: "extra", id: "hidden" }
    });
    assert.equal(crossOrigin.statusCode, 403);

    const activeItem = await invoke("DELETE", {
        token: "admin",
        body: { risorsa: "extra", id: "bocconcino" }
    });
    assert.equal(activeItem.statusCode, 409);
    assert.equal(db.get("metadata", "menuVersion").versione, 3);

    await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "prodotti", id: "marinara", archiviato: true }
    });
    await invoke("PATCH", {
        token: "admin",
        body: { risorsa: "categorie", id: "pizze", archiviata: true }
    });
    const categoryWithArchivedProduct = await invoke("DELETE", {
        token: "admin",
        body: { risorsa: "categorie", id: "pizze" }
    });
    assert.equal(categoryWithArchivedProduct.statusCode, 409);
    assert.match(categoryWithArchivedProduct.body.errore, /anche archiviati/);
    assert.equal(db.get("metadata", "menuVersion").versione, 5);

    const archivedProduct = await invoke("DELETE", {
        token: "admin",
        body: { risorsa: "prodotti", id: "marinara" }
    });
    assert.equal(archivedProduct.statusCode, 200);
    assert.equal(archivedProduct.body.versione, 6);
    assert.equal(db.get("menuProdotti", "marinara"), undefined);

    const emptyArchivedCategory = await invoke("DELETE", {
        token: "admin",
        body: { risorsa: "categorie", id: "hidden" }
    });
    assert.equal(emptyArchivedCategory.statusCode, 200);
    assert.equal(emptyArchivedCategory.body.versione, 7);
    assert.equal(db.get("menuCategorie", "hidden"), undefined);
    assert.deepEqual(db.get("orders", "000000000001"), savedOrder);
});
