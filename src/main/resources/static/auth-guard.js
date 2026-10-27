(() => {
    document.documentElement.classList.add("auth-loading");
    const nativeFetch = window.fetch.bind(window);
    const gate = (async () => {
        try {
            const response = await nativeFetch("/api/auth/verify", { cache: "no-store", credentials: "same-origin" });
            if (response.status === 401) {
                window.location.replace("/login.html");
                return false;
            }
            if (response.status === 403) {
                showMessage("Accesso negato", "Questo account non è autorizzato.", true);
                return false;
            }
            if (!response.ok) throw new Error("Servizio di autenticazione non disponibile.");
            const account = await response.json();
            const isHome = window.location.pathname === "/" || window.location.pathname === "/index.html";
            const isDeliveryPage = window.location.pathname === "/consegne.html";
            const isAdmin = account.admin === true;
            const isDelivery = account.delivery === true;
            if (!isAdmin && !(isDelivery && isDeliveryPage)) {
                showMessage("Accesso negato", "Questo account non è autorizzato.", true);
                return false;
            }
            window.currentAccount = { ...account, admin: isAdmin, delivery: isDelivery };
            document.querySelectorAll("[data-admin-only]").forEach(element => {
                element.hidden = !isAdmin;
            });
            if (isAdmin && isHome) {
                showToolbar(account.email);
            }
            if (isDeliveryPage) {
                document.querySelector(".dashboard-header nav").append(makeLogoutButton());
            }
            document.documentElement.classList.remove("auth-loading");
            return true;
        } catch {
            showMessage("Servizio non disponibile", "Impossibile verificare i permessi. Riprova più tardi.", false);
            return false;
        }
    })();
    window.authReady = gate;

    window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/") && url !== "/api/auth/verify") {
            if (!await gate) throw new Error("Accesso non autorizzato.");
            return nativeFetch(input, { ...init, credentials: "same-origin" });
        }
        return nativeFetch(input, init);
    };

    function showMessage(title, description, canLogout) {
        document.body.replaceChildren();
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
            await nativeFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
            window.location.replace("/login.html");
        });
        return button;
    }

    function showToolbar(email) {
        const toolbar = document.createElement("div");
        toolbar.className = "account-toolbar";
        const identity = document.createElement("span");
        identity.className = "account-toolbar__identity";
        identity.textContent = email || "Amministratore";
        const button = makeLogoutButton();
        toolbar.append(identity, button);
        document.body.prepend(toolbar);
    }
})();
