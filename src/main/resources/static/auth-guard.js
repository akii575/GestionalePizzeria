(() => {
    const accountCacheKey = "civico7-account-v1";
    const roleReloadKey = "civico7-account-role-reload";
    const accountCacheLifetime = 12 * 60 * 60 * 1000;
    const pathname = window.location.pathname;
    const isDeliveryPage = pathname === "/consegne.html";
    const nativeFetch = window.fetch.bind(window);

    function normalizeAccount(account) {
        const admin = account.admin === true;
        const staff = !admin && account.staff === true;
        const delivery = !admin && !staff && account.delivery === true;
        return { ...account, admin, staff, delivery };
    }

    function isAccountFresh(account, now = Date.now()) {
        return Boolean(account)
            && typeof account.verificatoAlle === "number"
            && Number.isFinite(account.verificatoAlle)
            && account.verificatoAlle <= now
            && now - account.verificatoAlle < accountCacheLifetime;
    }

    function isAccountAllowedOnPage(account, pagePath) {
        const normalized = normalizeAccount(account);
        if (pagePath === "/menu.html") return normalized.admin;
        return normalized.admin || normalized.staff
            || (normalized.delivery && pagePath === "/consegne.html");
    }

    function isOptimisticAccount(account, pagePath, now = Date.now()) {
        return isAccountFresh(account, now) && isAccountAllowedOnPage(account, pagePath);
    }

    window.civico7AuthRules = Object.freeze({
        isAccountFresh,
        isAccountAllowedOnPage,
        isOptimisticAccount
    });

    function readCachedAccount() {
        try {
            const value = window.localStorage.getItem(accountCacheKey);
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    }

    function writeCachedAccount(account) {
        try {
            window.localStorage.setItem(accountCacheKey, JSON.stringify({
                admin: account.admin,
                staff: account.staff,
                delivery: account.delivery,
                email: typeof account.email === "string" ? account.email : "",
                verificatoAlle: Date.now()
            }));
        } catch {
            return false;
        }
        return true;
    }

    function clearRoleReloadFlag() {
        try {
            window.sessionStorage.removeItem(roleReloadKey);
        } catch {
            return;
        }
    }

    function clearCachedAccount() {
        try {
            window.localStorage.removeItem(accountCacheKey);
        } catch {
            // Storage can be unavailable in private browsing.
        }
        clearRoleReloadFlag();
    }

    function hasRoleReloadFlag() {
        try {
            return window.sessionStorage.getItem(roleReloadKey) === "1";
        } catch {
            return false;
        }
    }

    function setRoleReloadFlag() {
        try {
            window.sessionStorage.setItem(roleReloadKey, "1");
            return true;
        } catch {
            return false;
        }
    }

    const cachedAccount = readCachedAccount();
    const optimistic = isOptimisticAccount(cachedAccount, pathname);
    let activeAccount = optimistic ? normalizeAccount(cachedAccount) : null;
    let domApplyScheduled = false;
    let sessionRejected = false;

    if (!optimistic) document.documentElement.classList.add("auth-loading");
    else applyAccount(activeAccount);

    const verification = verifySession();
    window.authReady = optimistic ? Promise.resolve(true) : verification;

    window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (typeof url === "string" && url.startsWith("/api/") && url !== "/api/auth/verify") {
            if (!optimistic && !await verification) throw new Error("Accesso non autorizzato.");
            const response = await nativeFetch(input, { ...init, credentials: "same-origin" });
            if (optimistic && response.status === 401) {
                rejectSession();
            }
            return response;
        }
        return nativeFetch(input, init);
    };

    async function verifySession() {
        try {
            const response = await nativeFetch("/api/auth/verify", { cache: "no-store", credentials: "same-origin" });
            if (sessionRejected) return false;
            if (response.status === 401) {
                rejectSession();
                return false;
            }
            if (response.status === 403) {
                clearCachedAccount();
                showMessage("Accesso negato", "Questo account non è autorizzato.", true);
                return false;
            }
            if (!response.ok) throw new Error("Servizio di autenticazione non disponibile.");

            const account = normalizeAccount(await response.json());
            const roleChanged = optimistic && !sameRole(cachedAccount, account);
            writeCachedAccount(account);
            if (roleChanged) {
                if (!hasRoleReloadFlag() && setRoleReloadFlag()) {
                    window.location.reload();
                    return true;
                }
                clearRoleReloadFlag();
            } else if (optimistic) {
                clearRoleReloadFlag();
            }

            if (!isAccountAllowedOnPage(account, pathname)) {
                showMessage("Accesso negato", "Questo account non è autorizzato.", true);
                return false;
            }

            applyAccount(account);
            return true;
        } catch {
            if (optimistic) return true;
            showMessage("Servizio non disponibile", "Impossibile verificare i permessi. Riprova più tardi.", false);
            return false;
        }
    }

    function rejectSession() {
        if (sessionRejected) return;
        sessionRejected = true;
        clearCachedAccount();
        window.location.replace("/login.html");
    }

    function sameRole(first, second) {
        return first.admin === second.admin
            && first.staff === second.staff
            && first.delivery === second.delivery;
    }

    function applyAccount(account) {
        activeAccount = normalizeAccount(account);
        window.currentAccount = activeAccount;
        if (!document.body) {
            if (!domApplyScheduled) {
                domApplyScheduled = true;
                document.addEventListener("DOMContentLoaded", () => {
                    domApplyScheduled = false;
                    if (activeAccount) applyAccountToDOM(activeAccount);
                }, { once: true });
            }
            return;
        }
        applyAccountToDOM(activeAccount);
    }

    function applyAccountToDOM(account) {
        document.querySelectorAll("[data-admin-only]").forEach(element => {
            element.hidden = !account.admin && !account.staff;
        });
        document.querySelectorAll("[data-hide-for-staff]").forEach(element => {
            element.hidden = account.staff;
        });
        if (isDeliveryPage) {
            const navigation = document.querySelector(".dashboard-header nav");
            if (navigation && !navigation.querySelector(".auth-logout")) {
                navigation.append(makeLogoutButton());
            }
        }
        document.documentElement.classList.remove("auth-loading");
    }

    function showMessage(title, description, canLogout) {
        const networkBanner = document.querySelector(".civico7-network-banner");
        document.body.replaceChildren();
        if (networkBanner) document.body.append(networkBanner);
        document.documentElement.classList.remove("auth-loading");
        const main = document.createElement("main");
        main.className = "auth-feedback";
        const heading = document.createElement("h1");
        heading.textContent = title;
        const detail = document.createElement("p");
        detail.textContent = description;
        main.append(heading, detail);
        if (canLogout) main.append(makeLogoutButton());
        document.body.append(main);
    }

    function makeLogoutButton() {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "auth-logout";
        button.textContent = "Esci";
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                const response = await nativeFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
                if (!response.ok) throw new Error("Impossibile terminare la sessione.");
                clearCachedAccount();
                await window.civico7ClearOfflineCaches();
                window.location.replace("/login.html");
            } catch (error) {
                console.error("Logout failed:", error);
                button.disabled = false;
                button.textContent = "Esci (errore)";
            }
        });
        return button;
    }

})();
