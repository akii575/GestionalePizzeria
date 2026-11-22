const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const firebaseAdminPath = require.resolve("../lib/firebase-admin");
const originalFirebaseAdmin = require(firebaseAdminPath);
let services;
require.cache[firebaseAdminPath].exports = {
    getFirebaseServices() {
        return services || originalFirebaseAdmin.getFirebaseServices();
    }
};
const auth = require("../lib/auth");

test("Vercel functions are configured for the Firestore region", () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
    assert.deepEqual(config.regions, ["cdg1"]);
    assert.equal(Object.keys(config)[0], "regions");
});

function request(cookie) {
    return { headers: { cookie: `__Host-session=${encodeURIComponent(cookie)}` } };
}

test("session verification is cached for five minutes and then repeated", async t => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    let verificationCount = 0;
    services = {
        auth: {
            async verifySessionCookie(cookie, checkRevoked) {
                assert.equal(cookie, "cache-session");
                assert.equal(checkRevoked, true);
                verificationCount++;
                return { uid: "user-1", staff: true, exp: Math.floor((now + 60 * 60 * 1000) / 1000) };
            }
        }
    };
    t.after(() => { services = null; });

    const first = await auth.requireStaffAccess(request("cache-session"));
    const cached = await auth.requireStaffAccess(request("cache-session"));
    assert.deepEqual(cached, first);
    assert.equal(verificationCount, 1);

    now += 5 * 60 * 1000 + 1;
    await auth.requireStaffAccess(request("cache-session"));
    assert.equal(verificationCount, 2);
});

test("session cache never outlives the decoded token expiration", async t => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    let verificationCount = 0;
    services = {
        auth: {
            async verifySessionCookie() {
                verificationCount++;
                return { uid: "short-lived", staff: true, exp: Math.floor((now + 60 * 1000) / 1000) };
            }
        }
    };
    t.after(() => { services = null; });

    await auth.requireStaffAccess(request("short-lived-session"));
    await auth.requireStaffAccess(request("short-lived-session"));
    assert.equal(verificationCount, 1);

    now += 60 * 1000;
    await auth.requireStaffAccess(request("short-lived-session"));
    assert.equal(verificationCount, 2);
});

test("invalid session cookies are not cached", async t => {
    let verificationCount = 0;
    services = {
        auth: {
            async verifySessionCookie() {
                verificationCount++;
                throw new Error("invalid session");
            }
        }
    };
    t.after(() => { services = null; });

    for (let attempt = 0; attempt < 2; attempt++) {
        await assert.rejects(auth.requireStaffAccess(request("invalid-session")), error => {
            assert.equal(error.statusCode, 401);
            assert.equal(error.message, "Sessione non valida o scaduta.");
            return true;
        });
    }
    assert.equal(verificationCount, 2);
});

test("session cache evicts the oldest entry after reaching 200 entries", async t => {
    let verificationCount = 0;
    services = {
        auth: {
            async verifySessionCookie(cookie) {
                verificationCount++;
                return {
                    staff: true,
                    uid: cookie,
                    exp: Math.floor((Date.now() + 60 * 60 * 1000) / 1000)
                };
            }
        }
    };
    t.after(() => { services = null; });

    for (let index = 0; index < 201; index++) {
        await auth.requireStaffAccess(request(`capacity-session-${index}`));
    }
    assert.equal(verificationCount, 201);

    await auth.requireStaffAccess(request("capacity-session-0"));
    assert.equal(verificationCount, 202);
});
