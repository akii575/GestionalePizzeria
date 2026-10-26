(() => {
    const statusElement = document.getElementById("printer-status");
    const agentElement = document.getElementById("printer-agent-status");
    const listElement = document.getElementById("printer-list");
    const refreshButton = document.getElementById("printer-refresh");
    const retryButton = document.getElementById("printer-retry");
    if (!statusElement || !agentElement || !listElement || !refreshButton || !retryButton) return;
    const hintElement = document.querySelector(".printer-hint");
    if (hintElement) {
        hintElement.textContent = "Il servizio invia la stessa comanda alle stampanti di cucina e sala. Tieni il PC acceso e connesso a Internet; non serve installare driver Epson.";
    }

    async function refreshStatus() {
        refreshButton.disabled = true;
        statusElement.textContent = "Controllo delle stampanti Epson via Ethernet...";
        listElement.replaceChildren();
        try {
            const response = await fetch("http://127.0.0.1:8765/status", {
                cache: "no-store",
                credentials: "omit",
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) {
                throw new Error("terminal-unavailable");
            }
            const result = await response.json();
            if (result.printers.length === 0) {
                statusElement.textContent = "Configurazione delle stampanti di rete non trovata.";
            } else {
                statusElement.textContent = "Stampanti di rete:";
                for (const printer of result.printers) {
                    const item = document.createElement("li");
                    const state = {
                        ready: "online e pronta",
                        busy: "online, stampa in corso",
                        unavailable: "non raggiungibile sulla rete",
                        unknown: `stato non disponibile (${printer.status})`
                    }[printer.state] || "stato sconosciuto";
                    item.textContent = `${printer.name} — ${state}`;
                    listElement.append(item);
                }
            }

            const agentMessages = {
                ready: "Stampa automatica attiva; controllo ordini ogni 10 secondi.",
                another_terminal_active: "Un altro terminale di stampa è già attivo.",
                printer_unavailable: "Una o più stampanti Epson non sono raggiungibili; le comande restano in coda.",
                cloud_unavailable: "Connessione alla coda online non disponibile; il terminale riproverà.",
                paused: "Coda temporaneamente in pausa per un'operazione di gestione.",
                starting: "Avvio del terminale di stampa..."
            };
            agentElement.textContent = agentMessages[result.agent.workerState] || "Terminale collegato.";
            const queue = result.agent;
            if (queue.queued || queue.printing || queue.failed) {
                agentElement.textContent += ` In coda: ${queue.queued}; in stampa: ${queue.printing}; non riuscite: ${queue.failed}.`;
            }
            retryButton.hidden = queue.failed === 0;
            retryButton.textContent = queue.failed > 0
                ? `Riprova ${queue.failed} comande non stampate`
                : "Riprova comande non stampate";
        } catch (error) {
            statusElement.textContent = "Servizio di stampa locale non raggiungibile. Avvia `installa-stampa-automatica.bat` sul PC della pizzeria.";
            agentElement.textContent = "Il servizio verrà avviato automaticamente all'accesso a Windows dopo l'installazione.";
            retryButton.hidden = true;
        } finally {
            refreshButton.disabled = false;
        }
    }

    refreshButton.addEventListener("click", refreshStatus);
    retryButton.addEventListener("click", async () => {
        retryButton.disabled = true;
        try {
            const response = await fetch("http://127.0.0.1:8765/retry-failed", {
                method: "POST",
                cache: "no-store",
                credentials: "omit",
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) throw new Error("retry_failed");
            await refreshStatus();
        } catch {
            agentElement.textContent = "Impossibile riprovare ora. Verifica che il servizio di stampa sia attivo sul PC.";
        } finally {
            retryButton.disabled = false;
        }
    });
    refreshStatus();
    window.setInterval(() => {
        if (document.visibilityState === "visible") refreshStatus();
    }, 20000);
})();
