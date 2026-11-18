const { api, methodNotAllowed } = require("../lib/api");
const { httpError, requireAdmin, requireSameOrigin } = require("../lib/auth");
const { getFirebaseServices } = require("../lib/firebase-admin");

const RESOURCES = Object.freeze({
    categorie: "menuCategorie",
    prodotti: "menuProdotti",
    extra: "menuExtra"
});

function resourceName(value) {
    if (!Object.prototype.hasOwnProperty.call(RESOURCES, value)) {
        throw httpError(400, "Risorsa del menu non valida.");
    }
    return value;
}

function requiredName(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
        throw httpError(400, "Il nome e' obbligatorio e non puo' superare 80 caratteri.");
    }
    return value.trim();
}

function normalizedName(value) {
    return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it-IT").trim();
}

function requiredPrice(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0
            || Math.round(value * 100) / 100 !== value) {
        throw httpError(400, "Il prezzo deve essere un numero non negativo con massimo due decimali.");
    }
    return value;
}

function requiredBoolean(value, message) {
    if (typeof value !== "boolean") throw httpError(400, message);
    return value;
}

function requiredIngredients(value) {
    if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
        throw httpError(400, "Gli ingredienti devono essere una lista di testi.");
    }
    return value.map(item => item.trim()).filter(Boolean);
}

function records(snapshot) {
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
}

function ensureUniqueName(documents, name, exceptId, matchesScope) {
    const normalized = normalizedName(name);
    if (documents.some(document => (
        document.id !== exceptId
        && matchesScope(document)
        && normalizedName(document.data().nome || "") === normalized
    ))) {
        throw httpError(409, "Esiste gia' un elemento del menu con questo nome.");
    }
}

function nextOrder(documents, matchesScope = () => true) {
    return documents.reduce((maximum, document) => (
        matchesScope(document) ? Math.max(maximum, Number(document.data().ordine) || 0) : maximum
    ), -1) + 1;
}

async function getMenu(db) {
    const [categorie, prodotti, extra, version] = await Promise.all([
        db.collection(RESOURCES.categorie).get(),
        db.collection(RESOURCES.prodotti).get(),
        db.collection(RESOURCES.extra).get(),
        db.collection("metadata").doc("menuVersion").get()
    ]);
    return {
        categorie: records(categorie),
        prodotti: records(prodotti),
        extra: records(extra),
        versione: version.exists ? Number(version.data()?.versione || 0) : 0
    };
}

function validateProductCategory(categoryId, categoryDocuments) {
    if (typeof categoryId !== "string" || !categoryId.trim()) {
        throw httpError(400, "Seleziona una categoria valida.");
    }
    const category = categoryDocuments.find(document => document.id === categoryId);
    if (!category || category.data().archiviata === true) {
        throw httpError(400, "La categoria selezionata non esiste o e' archiviata.");
    }
}

function makeFields(resource, body, existing, categories) {
    const nome = requiredName(body.nome);
    if (resource === "categorie") {
        return {
            nome,
            ammetteExtra: requiredBoolean(body.ammetteExtra, "Indica se la categoria ammette extra.")
        };
    }
    if (resource === "prodotti") {
        validateProductCategory(body.categoriaId, categories);
        const fields = {
            nome,
            categoriaId: body.categoriaId,
            prezzo: requiredPrice(body.prezzo),
            ingredienti: requiredIngredients(body.ingredienti),
            aggiornatoIl: new Date().toISOString()
        };
        if (existing) return fields;
        return {
            ...fields,
            disponibile: body.disponibile === undefined
                ? true
                : requiredBoolean(body.disponibile, "Indica se il prodotto e' disponibile."),
            archiviato: false
        };
    }
    const fields = { nome, prezzo: requiredPrice(body.prezzo) };
    if (existing) return fields;
    return {
        ...fields,
        disponibile: body.disponibile === undefined
            ? true
            : requiredBoolean(body.disponibile, "Indica se l'extra e' disponibile."),
        archiviato: false
    };
}

function validateOrderIds(ids, documents) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")
            || new Set(ids).size !== ids.length) {
        throw httpError(400, "La lista di riordino non e' valida.");
    }
    const availableIds = new Set(documents.map(document => document.id));
    if (ids.length !== availableIds.size || ids.some(id => !availableIds.has(id))) {
        throw httpError(400, "La lista deve contenere tutti gli elementi attivi nell'ordine richiesto.");
    }
}

async function mutateMenu(db, method, body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw httpError(400, "La richiesta del menu non e' valida.");
    }
    const resource = resourceName(body.risorsa);
    const collection = db.collection(RESOURCES[resource]);
    const versionRef = db.collection("metadata").doc("menuVersion");
    const isOrdering = method === "PUT" && body.azione === "ordine";
    if (method === "PUT" && !isOrdering && (typeof body.id !== "string" || !body.id)) {
        throw httpError(400, "Identificativo del menu non valido.");
    }
    if (method === "PATCH" && (typeof body.id !== "string" || !body.id)) {
        throw httpError(400, "Identificativo del menu non valido.");
    }
    const newRef = method === "POST" ? collection.doc() : null;

    return db.runTransaction(async transaction => {
        const [versionSnapshot, collectionSnapshot, categoriesSnapshot] = await Promise.all([
            transaction.get(versionRef),
            transaction.get(collection),
            resource === "prodotti" || isOrdering && body.risorsa === "prodotti"
                ? transaction.get(db.collection(RESOURCES.categorie))
                : Promise.resolve(null)
        ]);
        const documents = collectionSnapshot.docs;
        const categories = categoriesSnapshot ? categoriesSnapshot.docs : [];
        const currentVersion = versionSnapshot.exists ? Number(versionSnapshot.data()?.versione || 0) : 0;
        if (!Number.isSafeInteger(currentVersion) || currentVersion < 0 || currentVersion === Number.MAX_SAFE_INTEGER) {
            throw httpError(409, "La versione del menu non e' valida.");
        }
        let result;

        if (isOrdering) {
            let orderedDocuments = documents;
            if (resource === "prodotti") {
                if (typeof body.categoriaId !== "string") {
                    throw httpError(400, "Seleziona una categoria valida per il riordino.");
                }
                validateProductCategory(body.categoriaId, categories);
                const archivedCategories = new Set(
                    categories.filter(category => category.data().archiviata === true).map(category => category.id)
                );
                orderedDocuments = documents.filter(document => (
                    document.data().categoriaId === body.categoriaId
                    && document.data().archiviato !== true
                    && !archivedCategories.has(body.categoriaId)
                ));
            } else if (resource === "categorie" || resource === "extra") {
                orderedDocuments = documents.filter(document => document.data().archiviata !== true);
            }
            validateOrderIds(body.ids, orderedDocuments);
            const byId = new Map(orderedDocuments.map(document => [document.id, document.ref]));
            body.ids.forEach((id, ordine) => transaction.update(byId.get(id), { ordine }));
            result = { ok: true };
        } else if (method === "PATCH") {
            const document = documents.find(entry => entry.id === body.id);
            if (!document) throw httpError(404, "Elemento del menu non trovato.");
            let update;
            const archiveField = resource === "categorie" ? "archiviata" : "archiviato";
            if (Object.prototype.hasOwnProperty.call(body, archiveField)) {
                update = {
                    [archiveField]: requiredBoolean(body[archiveField], "Stato di archivio non valido.")
                };
            } else if (resource !== "categorie" && Object.prototype.hasOwnProperty.call(body, "disponibile")) {
                update = { disponibile: requiredBoolean(body.disponibile, "Stato di disponibilita' non valido.") };
            } else {
                throw httpError(400, "Modifica del menu non valida.");
            }
            transaction.update(document.ref, update);
            result = { ok: true, id: body.id };
        } else {
            const existing = method === "PUT" ? documents.find(document => document.id === body.id) : null;
            if (method === "PUT" && !existing) throw httpError(404, "Elemento del menu non trovato.");
            const fields = makeFields(resource, body, existing, categories);
            if (resource === "categorie") {
                ensureUniqueName(documents, fields.nome, existing?.id, () => true);
            } else if (resource === "prodotti") {
                ensureUniqueName(
                    documents,
                    fields.nome,
                    existing?.id,
                    document => document.data().categoriaId === fields.categoriaId
                );
            } else {
                ensureUniqueName(documents, fields.nome, existing?.id, () => true);
            }
            if (existing) {
                transaction.update(existing.ref, fields);
                result = { ok: true, id: existing.id };
            } else {
                fields.ordine = nextOrder(documents, document => (
                    resource !== "prodotti" || document.data().categoriaId === fields.categoriaId
                ));
                transaction.set(newRef, fields);
                result = { ok: true, id: newRef.id };
            }
        }

        transaction.set(versionRef, { versione: currentVersion + 1 });
        return { ...result, versione: currentVersion + 1 };
    });
}

module.exports = api(async (req, res) => {
    if (!["GET", "POST", "PUT", "PATCH"].includes(req.method)) {
        return methodNotAllowed(res, ["GET", "POST", "PUT", "PATCH"]);
    }
    res.setHeader("Cache-Control", "no-store");
    await requireAdmin(req);
    const { db } = getFirebaseServices();
    if (req.method === "GET") return res.status(200).json(await getMenu(db));
    requireSameOrigin(req);
    return res.status(req.method === "POST" ? 201 : 200).json(
        await mutateMenu(db, req.method, req.body)
    );
});
