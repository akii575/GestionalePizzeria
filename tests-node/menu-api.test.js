const test = require("node:test");
const assert = require("node:assert/strict");
const { apiRoute } = require("./api-router-helper");

function createDatabase() {
    const data = {
        metadata: { menuVersion: { versione: 4 } },
        menuCategorie: {
            pizze: { nome: "Pizze", ordine: 0, ammetteExtra: true, archiviata: false }
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
            }
        },
        menuExtra: {
            bocconcino: { nome: "Bocconcino", prezzo: 2, ordine: 0, disponibile: false, archiviato: false },
            archived: { nome: "Archiviato", prezzo: 1, ordine: 1, disponibile: true, archiviato: true }
        }
    };
    return {
        collection(name) {
            return {
                doc(id) {
                    return {
                        async get() {
                            const value = data[name][id];
                            return { exists: value !== undefined, data: () => value };
                        },
                        onSnapshot(next) {
                            next({ exists: true, data: () => data[name][id] });
                            return () => {};
                        }
                    };
                },
                async get() {
                    return {
                        docs: Object.entries(data[name] || {}).map(([id, value]) => ({
                            id,
                            data: () => value
                        }))
                    };
                }
            };
        }
    };
}

const db = createDatabase();
const authPath = require.resolve("../lib/auth");
const firebasePath = require.resolve("../lib/firebase-admin");
require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
        requireStaffAccess: async () => {}
    }
};
require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { getFirebaseServices: () => ({ db }) }
};

const menuHandler = apiRoute("menu");
const extraHandler = apiRoute("extra");

async function invoke(handler) {
    const response = {
        headers: {},
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        }
    };
    await handler({ method: "GET", headers: {}, query: {} }, response);
    return response;
}

test("menu and extra APIs expose Firestore records with availability metadata", async () => {
    const menuResponse = await invoke(menuHandler);
    const extraResponse = await invoke(extraHandler);

    assert.equal(menuResponse.statusCode, 200);
    assert.deepEqual(menuResponse.body, [{
        id: "margherita",
        nome: "Margherita",
        categoria: "pizze",
        categoriaId: "pizze",
        categoriaNome: "Pizze",
        categoriaOrdine: 0,
        ammetteExtra: true,
        contaForno: true,
        convenzione: "pizza",
        componibile: false,
        prezzo: 5,
        ingredienti: ["Pomodoro"],
        ordine: 0,
        disponibile: true
    }]);
    assert.deepEqual(extraResponse.body, [{
        id: "bocconcino",
        nome: "Bocconcino",
        prezzo: 2,
        ordine: 0,
        disponibile: false
    }]);
    assert.equal(menuResponse.headers["Cache-Control"], "no-store");
    assert.equal(extraResponse.headers["Cache-Control"], "no-store");
    assert.equal(menuResponse.headers["X-Menu-Version"], "4");
    assert.equal(extraResponse.headers["X-Menu-Version"], "4");
});
