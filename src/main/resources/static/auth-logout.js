async function clearOfflineCaches() {
    if (!("caches" in window)) return;
    const names = await window.caches.keys();
    await Promise.all(names
        .filter(name => name.startsWith("civico7-"))
        .map(name => window.caches.delete(name)));
}

document.getElementById("logout").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        if (!response.ok) throw new Error("Impossibile terminare la sessione.");
        await clearOfflineCaches();
        window.location.replace("/login.html");
    } catch {
        document.querySelector("main p").textContent = "Impossibile terminare la sessione. Riprova.";
    }
});
