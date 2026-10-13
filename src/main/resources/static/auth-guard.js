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
            if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
                showToolbar(account.email);
            }
            document.documentElement.classList.remove("auth-loading");
            return true;
        } catch {
            showMessage("Servizio non disponibile", "Impossibile verificare i permessi. Riprova più tardi.", false);
            return false;
        }
    })();

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
        main.setAttribute("style", "min-height:100vh;display:grid;place-content:center;text-align:center;gap:1rem;font-family:system-ui,sans-serif;background:#f4f1eb;color:#27231f");
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
        button.textContent = "Esci";
        button.setAttribute("style", "padding:.7rem 1rem;border:0;border-radius:.4rem;background:#9a3d21;color:white;cursor:pointer;font:inherit");
        button.addEventListener("click", async () => {
            await nativeFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
            window.location.replace("/login.html");
        });
        return button;
    }

    function showToolbar(email) {
        const toolbar = document.createElement("div");
        toolbar.setAttribute("style", "position:fixed;z-index:9999;right:1rem;top:1rem;display:flex;gap:.6rem;align-items:center;padding:.45rem .7rem;background:#fff;border:1px solid #ddd;border-radius:.5rem;box-shadow:0 2px 8px #0002;font:12px system-ui,sans-serif");
        const identity = document.createElement("span");
        identity.textContent = email || "Amministratore";
        const button = makeLogoutButton();
        button.setAttribute("style", "padding:.35rem .7rem;border:0;border-radius:.35rem;background:#9a3d21;color:white;cursor:pointer;font:inherit");
        toolbar.append(identity, button);
        document.body.append(toolbar);
    }
})();
