const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../lib/auth");
const firebaseAdmin = require("../lib/firebase-admin");
const { getRomeDayRange } = require("../lib/rome-day-range");

function makeDb(orders, queryLog) {
    return {
        collection(name) {
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

test("Rome day ranges use local midnight and account for daylight-saving changes", () => {
    assert.deepEqual(getRomeDayRange("2025-03-30"), {
        start: "2025-03-29T23:00:00.000Z",
        end: "2025-03-30T22:00:00.000Z"
    });
    assert.deepEqual(getRomeDayRange("2025-10-26"), {
        start: "2025-10-25T22:00:00.000Z",
        end: "2025-10-26T23:00:00.000Z"
    });
    assert.throws(() => getRomeDayRange("2025-02-29"), /data deve essere valida/);
    assert.throws(() => getRomeDayRange(["2025-03-30"]), /data deve essere valida/);
});

test("order and delivery APIs query the selected Rome day and order by number descending", async t => {
    const orders = [
        { numero: 7, tipo: "sala", dataOra: "2026-03-28T23:00:00.000Z" },
        { numero: 8, tipo: "tavolo", dataOra: "2026-03-29T21:59:59.999Z" },
        { numero: 9, tipo: "consegna", dataOra: "2026-03-29T10:00:00.000Z" },
        { numero: 10, tipo: "tavolo", dataOra: "2026-03-29T22:00:00.000Z" },
        { numero: 11, tipo: "consegna", dataOra: "2026-03-29T10:00:00.000Z" }
    ];
    const queryLog = [];
    t.mock.method(auth, "requireStaffAccess", async () => ({}));
    t.mock.method(auth, "requireDeliveryAccess", async () => ({}));
    t.mock.method(firebaseAdmin, "getFirebaseServices", () => ({
        db: makeDb(orders, queryLog)
    }));

    const ordersPath = require.resolve("../api/ordini/index.js");
    const deliveriesPath = require.resolve("../api/consegne/index.js");
    delete require.cache[ordersPath];
    delete require.cache[deliveriesPath];
    const ordersHandler = require(ordersPath);
    const deliveriesHandler = require(deliveriesPath);
    t.after(() => {
        delete require.cache[ordersPath];
        delete require.cache[deliveriesPath];
    });

    const tables = await invoke(ordersHandler, { data: "2026-03-29", tipo: "tavolo" });
    assert.equal(tables.statusCode, 200);
    assert.deepEqual(tables.body.map(order => order.numero), [8, 7]);

    const deliveries = await invoke(deliveriesHandler, { data: "2026-03-29" });
    assert.equal(deliveries.statusCode, 200);
    assert.deepEqual(deliveries.body.map(order => order.numero), [11, 9]);

    const expectedRange = [
        ["dataOra", ">=", "2026-03-28T23:00:00.000Z"],
        ["dataOra", "<", "2026-03-29T22:00:00.000Z"]
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
