document.getElementById("logout").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        if (!response.ok) throw new Error("Impossibile terminare la sessione.");
        window.location.replace("/login.html");
    } catch {
        document.querySelector("main p").textContent = "Impossibile terminare la sessione. Riprova.";
    }
});
