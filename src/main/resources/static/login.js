const form = document.getElementById("login-form");
const button = document.getElementById("login-button");
const status = document.getElementById("login-status");

async function firebaseConfig() {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Configurazione Firebase non disponibile.");
    return response.json();
}

async function checkExistingSession() {
    const response = await fetch("/api/auth/verify", { cache: "no-store", credentials: "same-origin" });
    if (response.ok || response.status === 403) window.location.replace("/");
}

function mostraAccessoNegato() {
    form.hidden = true;
    document.querySelector(".eyebrow").textContent = "Accesso negato";
    document.querySelector("h1").textContent = "Accesso negato";
    status.className = "error";
    status.textContent = "Questo account non è autorizzato.";
    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "Esci";
    logout.addEventListener("click", async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        window.location.replace("/login.html");
    });
    status.after(logout);
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    status.className = "";
    status.textContent = "Accesso in corso...";
    try {
        const config = await firebaseConfig();
        const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: document.getElementById("email").value.trim(),
                password: document.getElementById("password").value,
                returnSecureToken: true
            })
        });
        if (!signIn.ok) throw new Error("Email o password non corretti.");
        const credentials = await signIn.json();
        const session = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ idToken: credentials.idToken })
        });
        if (session.status === 403) {
            mostraAccessoNegato();
            return;
        }
        if (!session.ok) throw new Error("Non è stato possibile avviare la sessione.");
        const verification = await fetch("/api/auth/verify", { cache: "no-store", credentials: "same-origin" });
        if (verification.status === 403) {
            window.location.replace("/");
            return;
        }
        if (!verification.ok) throw new Error("Non è stato possibile verificare i permessi.");
        window.location.replace("/");
    } catch (error) {
        status.className = "error";
        status.textContent = error.message || "Accesso non riuscito.";
        button.disabled = false;
    }
});

checkExistingSession().catch(() => {
    status.className = "error";
    status.textContent = "Impossibile verificare la sessione. Riprova.";
});
