(() => {
    const statusElement = document.getElementById("printer-status");
    const queueElement = document.getElementById("printer-queue");
    const warningElement = document.getElementById("printer-warning");
    const agentElement = document.getElementById("printer-agent-status");
    const listElement = document.getElementById("printer-list");
    const retryButton = document.getElementById("printer-retry");
    const summaryElements = {
        tavoli: {
            value: document.getElementById("tavoli-value"),
            label: document.getElementById("tavoli-label")
        },
        consegne: {
            value: document.getElementById("consegne-value"),
            label: document.getElementById("consegne-label")
        },
        ritiri: {
            value: document.getElementById("ritiri-value"),
            label: document.getElementById("ritiri-label")
        },
        banco: {
            value: document.getElementById("banco-value"),
            label: document.getElementById("banco-label")
        },
        incasso: {
            value: document.getElementById("incasso-value"),
            label: document.getElementById("incasso-label")
        }
    };
    if (Object.values(summaryElements).some(summary => !summary.value || !summary.label)
        || !statusElement || !queueElement || !warningElement || !agentElement || !listElement || !retryButton) {
        return;
    }

    let version;
    let today;
    let refreshing = false;
    let refreshRequested = false;
    const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
    const clock = new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });

    function updateSummary(today) {
        summaryElements.tavoli.value.textContent = today.tavoli;
        summaryElements.tavoli.label.textContent = `Tavoli · ${today.coperti} coperti`;
        summaryElements.consegne.value.textContent = today.consegneDaFare;
        summaryElements.consegne.label.textContent = `Consegne da fare · ${today.consegneInCorso} in giro`;
        summaryElements.ritiri.value.textContent = today.ritiri;
        summaryElements.ritiri.label.textContent = "Ritiri";
        summaryElements.banco.value.textContent = today.banco;
        summaryElements.banco.label.textContent = "Banco";
        summaryElements.incasso.value.textContent = euro.format(today.totale);
        summaryElements.incasso.label.textContent = `Incasso · ${today.ordini} ordini`;
    }

    function updatePrinter(stampa, oggi) {
        statusElement.classList.toggle("is-active", stampa.attiva);
        statusElement.classList.toggle("is-inactive", !stampa.attiva);
        statusElement.textContent = stampa.attiva
            ? `Stampa attiva (ultimo contatto ${clock.format(new Date(stampa.ultimoContatto))})`
            : "PC della stampa spento o non collegato: le comande restano in coda e usciranno appena si riaccende";
        queueElement.textContent =
            `In coda ${stampa.inCoda} · In stampa ${stampa.inStampa} · Non riuscite ${stampa.nonRiuscite}`;
        retryButton.hidden = stampa.nonRiuscite === 0;
        retryButton.textContent = `Riprova ${stampa.nonRiuscite} comande`;
        warningElement.hidden = oggi.nonStampati === 0 || stampa.attiva;
        warningElement.textContent = `Attenzione: ${oggi.nonStampati} comande non sono state stampate.`;
    }

    async function refreshLocalPrinters() {
        try {
            const response = await fetch("http://127.0.0.1:8765/status", {
                cache: "no-store",
                credentials: "omit",
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) return;
            const result = await response.json();
            if (!Array.isArray(result.printers)) return;

            listElement.replaceChildren();
            for (const printer of result.printers) {
                const item = document.createElement("li");
                const state = {
                    ready: "online e pronta",
                    busy: "online, stampa in corso",
                    unavailable: "non raggiungibile sulla rete"
                }[printer.state] || `stato non disponibile (${printer.status})`;
                item.textContent = `${printer.name} — ${state}`;
                listElement.append(item);
            }
            listElement.hidden = result.printers.length === 0;
            agentElement.textContent = result.agent?.workerState === "ready"
                ? "Stampa automatica attiva (istantanea)."
                : "";
            agentElement.hidden = !agentElement.textContent;
        } catch {
            listElement.replaceChildren();
            listElement.hidden = true;
            agentElement.textContent = "";
            agentElement.hidden = true;
        }
    }

    async function refreshStatus() {
        if (refreshing) {
            refreshRequested = true;
            return;
        }
        if (document.visibilityState !== "visible") return;
        refreshRequested = false;
        refreshing = true;
        try {
            const query = typeof version === "undefined" ? "" : `?versione=${encodeURIComponent(version)}`;
            const response = await fetch(`/api/stato-serata${query}`, {
                cache: "no-store",
                credentials: "same-origin"
            });
            if (!response.ok) throw new Error("evening_status_unavailable");
            const result = await response.json();
            if (!result.invariato) {
                today = result.oggi;
                updateSummary(today);
                version = result.versione;
                updatePrinter(result.stampa, today);
            } else {
                updatePrinter(result.stampa, today);
            }
            void refreshLocalPrinters();
        } catch {
            statusElement.classList.remove("is-active", "is-inactive");
            statusElement.textContent = "Impossibile aggiornare il riepilogo della serata.";
        } finally {
            refreshing = false;
            if (refreshRequested) {
                refreshRequested = false;
                if (document.visibilityState === "visible") void refreshStatus();
            }
        }
    }

    retryButton.addEventListener("click", async () => {
        retryButton.disabled = true;
        try {
            const response = await fetch("/api/stato-serata?azione=riprova", {
                method: "POST",
                cache: "no-store",
                credentials: "same-origin"
            });
            if (!response.ok) throw new Error("retry_failed");
            await refreshStatus();
        } catch {
            statusElement.classList.remove("is-active", "is-inactive");
            statusElement.textContent = "Impossibile riprovare ora. Riprova tra poco.";
        } finally {
            retryButton.disabled = false;
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void refreshStatus();
    });
    document.addEventListener("civico7:online", () => {
        void refreshStatus();
    });
    void refreshStatus();
    window.setInterval(() => {
        if (document.visibilityState === "visible") void refreshStatus();
    }, 15000);
})();
