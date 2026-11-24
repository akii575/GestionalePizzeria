const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const { currentServiceDayInRome, getRomeDayRange } = require("../lib/rome-day-range");
const orderCard = require("../src/main/resources/static/order-card");
const { apiRoute } = require("./api-router-helper");

function makeDb(orders, queryLog, { version = 0 } = {}) {
    let orderReads = 0;
    return {
        collection(name) {
            if (name === "metadata") {
                return {
                    doc(id) {
                        assert.equal(id, "ordersVersion");
                        return {
                            async get() {
                                return { exists: version !== null, data: () => ({ versione: version }) };
                            }
                        };
                    }
                };
            }
            assert.equal(name, "orders");
            const filters = [];
            const orderings = [];
            const query = {
                where(field, operator, value) {
                    filters.push([field, operator, value]);
                    return query;
                },
                orderBy(field, direction) {
                    orderings.push([field, direction]);
                    return query;
                },
                async get() {
                    orderReads++;
                    queryLog.push({ filters, orderings });
                    const docs = orders.filter(order => filters.every(([field, operator, value]) => {
                        if (operator === ">=") return order[field] >= value;
                        if (operator === "<") return order[field] < value;
                        if (operator === "==") return order[field] === value;
                        if (operator === "in") return value.includes(order[field]);
                        throw new Error(`Unexpected filter operator: ${operator}`);
                    })).map(order => ({ data: () => order }));
                    return { docs };
                }
            };
            return query;
        },
        get orderReads() {
            return orderReads;
        }
    };
}

function invoke(handler, query = {}) {
    return new Promise(resolve => {
        const response = {
            headers: {},
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                resolve(this);
                return this;
            },
            setHeader(name, value) {
                this.headers[name] = value;
            }
        };
        handler({ method: "GET", headers: {}, query }, response);
    });
}

test("Rome service days start at 05:00 local time and account for daylight-saving changes", () => {
    assert.deepEqual(getRomeDayRange("2025-03-30"), {
        start: "2025-03-30T03:00:00.000Z",
        end: "2025-03-31T03:00:00.000Z"
    });
    assert.deepEqual(getRomeDayRange("2025-03-29"), {
        start: "2025-03-29T04:00:00.000Z",
        end: "2025-03-30T03:00:00.000Z"
    });
    assert.deepEqual(getRomeDayRange("2025-10-26"), {
        start: "2025-10-26T04:00:00.000Z",
        end: "2025-10-27T04:00:00.000Z"
    });
    assert.throws(() => getRomeDayRange("2025-02-29"), /data deve essere valida/);
    assert.throws(() => getRomeDayRange(["2025-03-30"]), /data deve essere valida/);
});

test("orders taken after midnight belong to the previous evening until 05:00", () => {
    const cases = [
        ["2026-11-24T22:30:00.000Z", "2026-11-24"],
        ["2026-11-25T03:59:00.000Z", "2026-11-24"],
        ["2026-11-25T04:00:00.000Z", "2026-11-25"],
        ["2026-07-11T02:59:00.000Z", "2026-07-10"],
        ["2026-03-01T03:00:00.000Z", "2026-02-28"]
    ];
    for (const [instant, expected] of cases) {
        assert.equal(currentServiceDayInRome(new Date(instant)), expected, `server ${instant}`);
        assert.equal(orderCard.currentServiceDate(new Date(instant)), expected, `browser ${instant}`);
    }
    const lateNight = getRomeDayRange(undefined, new Date("2026-11-25T00:30:00.000Z"));
    assert.equal(lateNight.start, "2026-11-24T04:00:00.000Z");
});

test("order and delivery APIs query the selected Rome day and order by number descending", async t => {
    const orders = [
        { numero: 7, tipo: "sala", dataOra: "2026-03-29T03:00:00.000Z" },
        // 04:59 del 30 marzo, ora italiana: appartiene ancora alla serata del 29.
        { numero: 8, tipo: "tavolo", dataOra: "2026-03-30T02:59:59.999Z" },
        { numero: 9, tipo: "consegna", dataOra: "2026-03-29T10:00:00.000Z" },
        { numero: 10, tipo: "tavolo", dataOra: "2026-03-30T03:00:00.000Z" },
        { numero: 11, tipo: "consegna", dataOra: "2026-03-29T10:00:00.000Z" }
    ];
    const queryLog = [];
    const db = makeDb(orders, queryLog);
    t.mock.method(auth, "requireStaffAccess", async () => ({}));
    t.mock.method(auth, "requireDeliveryAccess", async () => ({}));
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({
        db
    }));

    const ordersHandler = apiRoute("ordini");
    const deliveriesHandler = apiRoute("consegne");

    const tables = await invoke(ordersHandler, { data: "2026-03-29", tipo: "tavolo" });
    assert.equal(tables.statusCode, 200);
    assert.deepEqual(tables.body.ordini.map(order => order.numero), [8, 7]);
    assert.equal(tables.body.versione, 0);

    const deliveries = await invoke(deliveriesHandler, { data: "2026-03-29" });
    assert.equal(deliveries.statusCode, 200);
    assert.deepEqual(deliveries.body.ordini.map(order => order.numero), [11, 9]);

    const expectedRange = [
        ["dataOra", ">=", "2026-03-29T03:00:00.000Z"],
        ["dataOra", "<", "2026-03-30T03:00:00.000Z"]
    ];
    assert.deepEqual(queryLog[0].filters.slice(0, 2), expectedRange);
    assert.deepEqual(queryLog[0].filters[2], ["tipo", "in", ["tavolo", "sala"]]);
    assert.deepEqual(queryLog[1].filters, [
        ["tipo", "==", "consegna"],
        ...expectedRange
    ]);
    for (const query of queryLog) {
        assert.deepEqual(query.orderings, [["dataOra", "asc"], ["numero", "desc"]]);
    }

    const invalidDate = await invoke(ordersHandler, { data: "2026-02-30" });
    assert.equal(invalidDate.statusCode, 400);
});

test("orders API returns unchanged without reading orders when the version matches", async t => {
    const queryLog = [];
    const db = makeDb([], queryLog, { version: 12 });
    t.mock.method(auth, "requireStaffAccess", async () => ({}));
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({ db }));

    const ordersHandler = apiRoute("ordini");

    const response = await invoke(ordersHandler, { data: "2026-03-29", versione: "12" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { invariato: true, versione: 12 });
    assert.equal(db.orderReads, 0);
    assert.deepEqual(queryLog, []);
});
