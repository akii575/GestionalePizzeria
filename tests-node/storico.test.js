const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { apiRoute } = require("./api-router-helper");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const { finalizeSummary, groupOrdersByServiceDay } = require("../lib/serate");
const { prepareChartData, shouldShowTotals } = require("../src/main/resources/static/storico.js");

function createDatabase(seed = {}, { failSummarySave = false, beforeOrderDelete } = {}) {
    const collections = new Map(
        Object.entries(seed).map(([name, documents]) => [name, new Map(Object.entries(documents))])
    );
    const documents = name => {
        if (!collections.has(name)) collections.set(name, new Map());
        return collections.get(name);
    };
    const reference = (name, id) => ({
        collectionName: name,
        id: String(id),
        async get() {
            const value = documents(name).get(String(id));
            return { exists: value !== undefined, data: () => value };
        },
        async set(value, options = {}) {
            const current = documents(name).get(String(id)) || {};
            documents(name).set(String(id), options.merge ? { ...current, ...value } : value);
        },
        async update(value) {
            await this.set(value, { merge: true });
        },
        async delete() {
            documents(name).delete(String(id));
        }
    });
    const snapshot = (name, entries) => ({
        empty: entries.length === 0,
        docs: entries.map(([id, value]) => ({
            id,
            ref: reference(name, id),
            data: () => value
        }))
    });
    function query(name, conditions = [], maximum = Infinity) {
        return {
            where(field, operator, value) {
                return query(name, [...conditions, [field, operator, value]], maximum);
            },
            orderBy() {
                return this;
            },
            limit(size) {
                return query(name, conditions, size);
            },
            async get() {
                const entries = [...documents(name).entries()]
                    .filter(([, data]) => conditions.every(([field, operator, value]) => {
                        if (operator === "==") return data[field] === value;
                        if (operator === ">=") return data[field] >= value;
                        if (operator === "<") return data[field] < value;
                        throw new Error(`Unsupported query operator: ${operator}`);
                    }))
                    .slice(0, maximum);
                return snapshot(name, entries);
            }
        };
    }
    const collection = name => ({
        doc: id => reference(name, id),
        get: () => query(name).get(),
        limit: size => query(name).limit(size),
        where: (field, operator, value) => query(name, [[field, operator, value]])
    });
    return {
        collection,
        documents,
        async runTransaction(callback) {
            return callback({
                get: document => document.get(),
                set: (document, value, options) => {
                    if (failSummarySave && document.collectionName === "serate") {
                        throw new Error("Firestore write failed");
                    }
                    return document.set(value, options);
                },
                update: (document, value) => document.update(value)
            });
        },
        batch() {
            const operations = [];
            return {
                delete(document) {
                    operations.push(async () => {
                        if (document.collectionName === "orders" && beforeOrderDelete) {
                            await beforeOrderDelete();
                        }
                        await document.delete();
                    });
                    return this;
                },
                set(document, value, options) {
                    operations.push(() => document.set(value, options));
                    return this;
                },
                async commit() {
                    for (const operation of operations) await operation();
                }
            };
        }
    };
}

function mockAdmin(t) {
    t.mock.method(auth, "requireAdmin", async request => {
        if (request.headers?.["x-test-role"] !== "admin") {
            const error = new Error("Accesso negato.");
            error.statusCode = 403;
            throw error;
        }
        return { admin: true };
    });
}

function invoke(handler, { method = "GET", headers = {}, query = {} } = {}) {
    const response = {
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        redirect(code, location) {
            this.statusCode = code;
            this.location = location;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        }
    };
    return Promise.resolve(handler({ method, headers, query }, response)).then(() => response);
}

function order(number, dataOra, tipo, totale, extra = {}) {
    return {
        numero: number,
        dataOra,
        tipo,
        totale,
        numeroPersone: tipo === "tavolo" || tipo === "sala" ? 2 : null,
        righe: [{ prodotto: "Margherita", quantita: 1, totale }],
        ...extra
    };
}

test("saved product summaries are capped at 300 names", () => {
    const products = Array.from({ length: 305 }, (_, index) => ({
        prodotto: `Prodotto ${index}`,
        totale: index,
        quantita: 1
    }));
    const summary = groupOrdersByServiceDay([
        order(1, "2026-05-10T12:00:00.000Z", "tavolo", 100, { righe: products })
    ]).get("2026-05-10");

    assert.equal(Object.keys(summary.prodotti).length, 305);
    const saved = finalizeSummary(summary);
    assert.equal(Object.keys(saved.prodotti).length, 300);
    assert.equal(saved.prodotti["Prodotto 304"].incasso, 304);
});

test("chart preparation fills all selected days with zeros and marks the current day", () => {
    const days = prepareChartData([
        {
            data: "2026-03-01",
            incasso: 24,
            comande: 2,
            coperti: 3,
            perTipo: { tavolo: { incasso: 24, comande: 2 } }
        },
        {
            data: "2026-03-07",
            incasso: 8,
            comande: 1,
            coperti: 0,
            perTipo: { banco: { incasso: 8, comande: 1 } }
        }
    ], "2026-03-01", "2026-03-07", "2026-03-04");

    assert.equal(days.length, 7);
    assert.deepEqual(days.map(day => day.data), [
        "2026-03-01",
        "2026-03-02",
        "2026-03-03",
        "2026-03-04",
        "2026-03-05",
        "2026-03-06",
        "2026-03-07"
    ]);
    assert.equal(days[0].incasso, 24);
    assert.equal(days[6].perTipo.banco.incasso, 8);
    for (const index of [1, 2, 3, 4, 5]) {
        assert.equal(days[index].incasso, 0);
        assert.equal(days[index].comande, 0);
        assert.ok(Object.values(days[index].perTipo).every(
            summary => summary.incasso === 0 && summary.comande === 0
        ));
    }
    assert.equal(days[3].inCorso, true);
    assert.equal(days.filter(day => day.inCorso).length, 1);
});

test("chart totals are shown only when there is enough width per day", () => {
    assert.equal(shouldShowTotals(330, 30), false);
    assert.equal(shouldShowTotals(330, 7), true);
    assert.equal(shouldShowTotals(1200, 30), true);
});

test("history dashboard prevents grid children from widening the page", () => {
    const styles = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/storico.css"),
        "utf8"
    );
    assert.match(styles, /\.storico-dashboard,\s*\.storico-dashboard \*,\s*\.storico-dashboard \*::before,\s*\.storico-dashboard \*::after,\s*\.storico-dialog,\s*\.storico-dialog \*\s*\{\s*box-sizing:\s*border-box;/);
    assert.match(styles, /\.storico-dashboard > \*\s*\{[^}]*min-width:\s*0;/);
    assert.match(styles, /\.storico-panel\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
});

test("reset stores per-service-day summaries before deleting orders", async t => {
    mockAdmin(t);
    t.mock.method(auth, "requireSameOrigin", () => {});
    let summariesWrittenBeforeDelete = false;
    const db = createDatabase({
        orders: {
            first: order(1, "2026-05-10T02:30:00.000Z", "sala", 20.25, { numeroPersone: 3 }),
            delivery: order(2, "2026-05-10T03:00:00.000Z", "consegna", 17.5, { costoConsegna: 2 }),
            pickup: order(3, "2026-05-10T04:00:00.000Z", "ritiro", 10),
            counter: order(4, "2026-05-10T05:00:00.000Z", "banco", 5)
        }
    }, {
        beforeOrderDelete() {
            summariesWrittenBeforeDelete = db.documents("serate").size === 2;
        }
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    const response = await invoke(apiRoute("reset-numeri"), {
        method: "POST",
        headers: { "x-test-role": "admin" }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(summariesWrittenBeforeDelete, true);
    assert.equal(db.documents("orders").size, 0);
    const firstNight = db.documents("serate").get("2026-05-09").parziali;
    const secondNight = db.documents("serate").get("2026-05-10").parziali;
    const firstPartial = Object.values(firstNight)[0];
    const secondPartial = Object.values(secondNight)[0];
    assert.deepEqual(firstPartial.perTipo.tavolo, { comande: 1, incasso: 20.25 });
    assert.equal(firstPartial.coperti, 3);
    assert.deepEqual(firstPartial.prodotti.Margherita, { quantita: 1, incasso: 20.25 });
    assert.deepEqual(firstPartial.ore, { "04": 1 });
    assert.deepEqual(secondPartial.perTipo, {
        tavolo: { comande: 0, incasso: 0 },
        banco: { comande: 1, incasso: 5 },
        ritiro: { comande: 1, incasso: 10 },
        consegna: { comande: 1, incasso: 17.5 }
    });
    assert.equal(secondPartial.comande, 3);
    assert.deepEqual(secondPartial.ore, { "05": 1, "06": 1, "07": 1 });
});

test("repeated resets store additive partials without replacing earlier summaries", async t => {
    mockAdmin(t);
    t.mock.method(auth, "requireSameOrigin", () => {});
    const db = createDatabase({
        orders: { first: order(1, "2026-05-10T12:00:00.000Z", "tavolo", 12) }
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    const handler = apiRoute("reset-numeri");
    const options = { method: "POST", headers: { "x-test-role": "admin" } };
    assert.equal((await invoke(handler, options)).statusCode, 200);
    db.documents("orders").set("second", order(2, "2026-05-10T13:00:00.000Z", "banco", 8));
    assert.equal((await invoke(handler, options)).statusCode, 200);

    const partials = db.documents("serate").get("2026-05-10").parziali;
    assert.equal(Object.keys(partials).length, 2);
    assert.equal(Object.values(partials).reduce((sum, partial) => sum + partial.incasso, 0), 20);
    assert.equal(Object.values(partials).reduce((sum, partial) => sum + partial.comande, 0), 2);
});

test("failed summary persistence aborts reset and leaves every order in place", async t => {
    mockAdmin(t);
    t.mock.method(auth, "requireSameOrigin", () => {});
    t.mock.method(console, "error", () => {});
    const db = createDatabase({
        orders: { first: order(1, "2026-05-10T12:00:00.000Z", "tavolo", 12) }
    }, { failSummarySave: true });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));

    const response = await invoke(apiRoute("reset-numeri"), {
        method: "POST",
        headers: { "x-test-role": "admin" }
    });
    assert.equal(response.statusCode, 500);
    assert.match(response.body.errore, /Gli ordini non sono stati cancellati/);
    assert.equal(db.documents("orders").size, 1);
});

test("history combines saved partials and live orders and computes the preceding period", async t => {
    mockAdmin(t);
    const db = createDatabase({
        serate: {
            "2026-03-10": {
                parziali: {
                    morning: {
                        incasso: 25.25,
                        comande: 2,
                        coperti: 3,
                        perTipo: {
                            tavolo: { comande: 1, incasso: 20.25 },
                            banco: { comande: 1, incasso: 5 },
                            ritiro: { comande: 0, incasso: 0 },
                            consegna: { comande: 0, incasso: 0 }
                        }
                    }
                }
            },
            "2026-03-08": {
                parziali: {
                    archived: {
                        incasso: 12,
                        comande: 1,
                        coperti: 1,
                        perTipo: { tavolo: { comande: 1, incasso: 12 } }
                    }
                }
            }
        },
        orders: {
            current: order(7, "2026-03-10T12:00:00.000Z", "tavolo", 10, { numeroPersone: 2 }),
            previous: order(8, "2026-03-09T12:00:00.000Z", "consegna", 8)
        }
    });
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    const response = await invoke(apiRoute("storico"), {
        query: { da: "2026-03-10", a: "2026-03-11" },
        headers: { "x-test-role": "admin" }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.serate.map(evening => evening.data), ["2026-03-10"]);
    assert.equal(response.body.serate[0].incasso, 35.25);
    assert.equal(response.body.serate[0].comande, 3);
    assert.equal(response.body.serate[0].coperti, 5);
    assert.deepEqual(response.body.totali, {
        incasso: 35.25,
        comande: 3,
        coperti: 5,
        scontrinoMedio: 11.75
    });
    assert.deepEqual(response.body.periodoPrecedente, { incasso: 20, comande: 2 });
});

test("history rejects staff and delivery accounts and validates its date range", async t => {
    mockAdmin(t);
    const db = createDatabase();
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));
    const handler = apiRoute("storico");

    for (const role of ["staff", "delivery"]) {
        const denied = await invoke(handler, {
            headers: { "x-test-role": role },
            query: { da: "2026-03-01", a: "2026-03-02" }
        });
        assert.equal(denied.statusCode, 403, role);
    }
    const tooLong = await invoke(handler, {
        headers: { "x-test-role": "admin" },
        query: { da: "2025-01-01", a: "2026-01-02" }
    });
    assert.equal(tooLong.statusCode, 400);
});

test("the historical page is admin-only and is served through the protected page router", async t => {
    mockAdmin(t);
    const handler = apiRoute("pages/storico.html");
    const staff = await invoke(handler, {
        headers: { "x-test-role": "staff" },
        query: { page: "storico.html" }
    });
    assert.equal(staff.statusCode, 403);

    const admin = await invoke(handler, {
        headers: { "x-test-role": "admin" },
        query: { page: "storico.html" }
    });
    assert.equal(admin.statusCode, 200);
    assert.match(admin.body, /<title>Storico \| CIVICO7<\/title>/);
    assert.doesNotMatch(admin.body, /<script(?![^>]*\bsrc=)/);
    assert.match(admin.body, /src="\/vendor\/chart\.umd\.js"/);

    const pageSource = fs.readFileSync(
        path.join(__dirname, "../src/main/resources/static/storico.html"),
        "utf8"
    );
    assert.match(pageSource, /src="\/vendor\/chart\.umd\.js"/);
    assert.match(pageSource, /<h1>Storico delle giornate<\/h1>/);
    assert.match(pageSource, /<h2>Incasso per giornata<\/h2>/);
    assert.match(pageSource, /Ogni giornata comprende pranzo e cena, dalle 05:00 alle 05:00\./);
    assert.match(pageSource, /Nessuna giornata nel periodo scelto\. Lo storico si riempie dalle prossime chiusure\./);
    assert.match(pageSource, /<h2 id="storico-dettaglio-titolo">Dettaglio giornata<\/h2>/);
    const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
    assert.doesNotMatch(readme, /serat[ae]/i);
});
