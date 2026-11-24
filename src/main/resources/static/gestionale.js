const stato = {
    ordini: [],
    menu: [],
    timer: null,
    richiestaCaricamento: 0,
    versioni: new Map(),
    ultimoCaricamentoCompleto: 0
};
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-ordini");
const statoPagina = document.getElementById("stato");
const riepilogoTavoli = document.getElementById("riepilogo-tavoli");
const eliminazioniInCorso = new Set();
const aggiornamentiTavoloInCorso = new Set();
const tipoServizio = document.body.dataset.serviceType || "";
const statoEspansioneOrdini = window.orderCard.createExpansionState();
window.orderCard.bindReprints(lista, statoEspansioneOrdini);
window.orderCard.bindDateFilter(document.getElementById("data"), document.getElementById("apri-data"));

function mostraStato(testo, classe) { statoPagina.textContent = testo; statoPagina.className = classe || ""; }
function tipoNormalizzato(tipo) { return tipo === "sala" ? "tavolo" : tipo || "tavolo"; }
function ordiniFiltrati() {
    const testo = document.getElementById("filtro").value.trim().toLowerCase();
    return stato.ordini.filter(ordine => (!tipoServizio || tipoNormalizzato(ordine.tipo) === tipoServizio)
        && (!testo || [
            ordine.tavoloOCliente,
            ordine.cognomeBanco,
            ordine.indirizzoConsegna,
            ordine.telefonoConsegna,
            ordine.telefonoRitiro,
            ...(ordine.righe || []).map(riga => riga.prodotto)
        ].some(valore => String(valore || "").toLowerCase().includes(testo))));
}
function render() {
    const ordini = ordiniFiltrati();
    document.getElementById("numero-ordini").textContent = ordini.length;
    const etichettaOrdini = tipoServizio === "ritiro"
        ? (ordini.length === 1 ? "ritiro" : "ritiri")
        : (ordini.length === 1 ? "ordine" : "ordini");
    document.getElementById("etichetta-ordini").textContent = etichettaOrdini;
    if (window.currentAccount?.staff !== true) {
        document.getElementById("totale-ordini").textContent = euro.format(ordini.reduce((somma, ordine) => somma + Number(ordine.totale), 0));
    }
    const paginaTavoli = tipoServizio === "tavolo" && Boolean(riepilogoTavoli);
    const ordiniAperti = paginaTavoli ? ordini.filter(ordine => ordine.tavoloChiuso !== true) : ordini;
    const ordiniPagati = paginaTavoli ? ordini.filter(ordine => ordine.tavoloChiuso === true) : [];
    if (paginaTavoli) {
        document.getElementById("tavoli-aperti").textContent = ordiniAperti.length;
        document.getElementById("tavoli-pagati").textContent = ordiniPagati.length;
        const incasso = ordiniPagati.reduce((somma, ordine) => somma + Number(ordine.totale || 0), 0);
        document.getElementById("incasso-tavoli").textContent = euro.format(incasso);
    }
    const opzioniCard = {
            canEdit: window.currentAccount?.admin === true || window.currentAccount?.staff === true,
            hideTotalForStaff: true,
            showServiceTypeLabel: !tipoServizio,
            menu: stato.menu,
            expansionState: statoEspansioneOrdini
    };
    const cards = elenco => elenco.slice()
        .sort((primo, secondo) => Number(secondo.numero) - Number(primo.numero))
        .map(ordine => window.orderCard.render(ordine, opzioniCard)).join("");
    if (!paginaTavoli) {
        lista.innerHTML = "";
        if (!ordini.length) {
            lista.innerHTML = '<div class="vuoto">Nessun ordine corrisponde ai filtri.</div>';
            return;
        }
        ordini.slice().sort((primo, secondo) => Number(secondo.numero) - Number(primo.numero)).forEach(ordine => {
            lista.insertAdjacentHTML("beforeend", window.orderCard.render(ordine, opzioniCard));
        });
        lista.querySelectorAll("[data-elimina]").forEach(button => button.addEventListener("click", () => eliminaOrdine(button.dataset.elimina)));
        return;
    }
    if (paginaTavoli) {
        lista.innerHTML = `${ordiniAperti.length
            ? cards(ordiniAperti)
            : '<div class="vuoto">Nessun tavolo aperto corrisponde ai filtri.</div>'}
            <details class="tavoli-pagati">
                <summary>Pagati e liberi (${ordiniPagati.length})</summary>
                <div class="tavoli-pagati__lista">${ordiniPagati.length
                    ? cards(ordiniPagati)
                    : '<div class="vuoto">Nessun tavolo pagato corrisponde ai filtri.</div>'}</div>
            </details>`;
    }
    lista.querySelectorAll("[data-elimina]").forEach(button => button.addEventListener("click", () => eliminaOrdine(button.dataset.elimina)));
}
function toastAnnullaChiusura(ordine) {
    document.querySelector(".toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast successo toast-tavolo";
    toast.setAttribute("role", "status");
    const tavoloOrdine = String(ordine.tavoloOCliente || "Tavolo").replace(/^tavolo\s*/i, "Tavolo ");
    const testo = document.createElement("span");
    testo.textContent = `${tavoloOrdine} segnato come pagato ·`;
    const annulla = document.createElement("button");
    annulla.type = "button";
    annulla.textContent = "Annulla";
    annulla.addEventListener("click", () => {
        toast.remove();
        void aggiornaStatoTavolo(ordine.numero, false);
    }, { once: true });
    toast.append(testo, annulla);
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 6000);
}
async function aggiornaStatoTavolo(numero, tavoloChiuso, button = null) {
    const id = String(numero);
    if (aggiornamentiTavoloInCorso.has(id)) return;
    aggiornamentiTavoloInCorso.add(id);
    if (button) button.disabled = true;
    try {
        const risposta = await fetch(`/api/ordini/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tavoloChiuso })
        });
        const risultato = await risposta.json().catch(() => ({}));
        if (!risposta.ok) throw new Error(risultato.errore || "Aggiornamento del tavolo non riuscito.");
        const index = stato.ordini.findIndex(ordine => String(ordine.numero) === id);
        if (index >= 0) stato.ordini[index] = { ...stato.ordini[index], ...risultato };
        render();
        if (tavoloChiuso) {
            const ordine = stato.ordini.find(elemento => String(elemento.numero) === id);
            if (ordine) toastAnnullaChiusura(ordine);
        } else if (window.themeToast) {
            window.themeToast("Tavolo riaperto");
        }
    } catch (errore) {
        mostraStato(errore.message, "errore");
    } finally {
        aggiornamentiTavoloInCorso.delete(id);
        if (button?.isConnected) button.disabled = false;
    }
}
async function eliminaOrdine(numero) {
    const id = String(numero);
    if (eliminazioniInCorso.has(id) || !window.confirm(`Eliminare l'ordine #${numero}?`)) return;
    eliminazioniInCorso.add(id);
    try {
        const risposta = await fetch(`/api/ordini/${id}`, { method: "DELETE" });
        if (!risposta.ok) {
            const risultato = await risposta.json();
            throw new Error(risultato.errore || "Eliminazione non riuscita.");
        }
        stato.ordini = stato.ordini.filter(ordine => String(ordine.numero) !== id);
        render();
        if (window.themeToast) window.themeToast(`Ordine #${numero} eliminato`);
        await caricaOrdini();
    } catch (errore) {
        mostraStato(errore.message, "errore");
    } finally {
        eliminazioniInCorso.delete(id);
    }
}
function chiaveVersioneOrdini() {
    const dataSelezionata = document.getElementById("data").value;
    const oggiRoma = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
    return `${dataSelezionata || oggiRoma}|${tipoServizio || "tutti"}`;
}
async function aggiornaOrdiniAutomaticamente() {
    const completa = Date.now() - stato.ultimoCaricamentoCompleto >= 120_000;
    await caricaOrdini({ completa });
}
async function caricaOrdini({ completa = true } = {}) {
    const richiesta = ++stato.richiestaCaricamento;
    if (completa && lista.childElementCount === 0) mostraStato("Caricamento ordini...", "loading");
    try {
        const parametri = new URLSearchParams();
        const data = document.getElementById("data").value;
        if (data) parametri.set("data", data);
        if (tipoServizio) parametri.set("tipo", tipoServizio);
        const chiave = chiaveVersioneOrdini();
        const versione = stato.versioni.get(chiave);
        if (!completa && Number.isSafeInteger(versione)) parametri.set("versione", String(versione));
        const query = parametri.toString();
        const urlOrdini = `/api/ordini${query ? `?${query}` : ""}`;
        const risposta = await fetch(urlOrdini, { cache: "no-store" });
        if (richiesta !== stato.richiestaCaricamento) return;
        if (!risposta.ok) throw new Error("Impossibile caricare gli ordini.");
        const risultato = await risposta.json();
        if (richiesta !== stato.richiestaCaricamento) return;
        stato.versioni.set(chiave, risultato.versione);
        if (risultato.invariato) {
            document.getElementById("ultimo-aggiornamento").textContent = new Date().toLocaleTimeString("it-IT");
            mostraStato("");
            return;
        }
        stato.ordini = risultato.ordini;
        if (completa) stato.ultimoCaricamentoCompleto = Date.now();
        document.getElementById("ultimo-aggiornamento").textContent = new Date().toLocaleTimeString("it-IT");
        render();
        mostraStato("");
    } catch (errore) {
        if (richiesta !== stato.richiestaCaricamento) return;
        mostraStato(errore.message, "errore");
    }
}
function configuraAggiornamento() {
    if (stato.timer) clearInterval(stato.timer);
    stato.timer = null;
    if (document.visibilityState === "visible") {
        stato.timer = setInterval(aggiornaOrdiniAutomaticamente, 15000);
    }
}
document.getElementById("aggiorna").addEventListener("click", caricaOrdini);
document.getElementById("filtro").addEventListener("input", render);
lista.addEventListener("click", event => {
    const button = event.target.closest("[data-tavolo-chiuso]");
    if (!button || !lista.contains(button)) return;
    void aggiornaStatoTavolo(
        button.dataset.numero,
        button.dataset.tavoloChiuso === "true",
        button
    );
});
document.getElementById("data").addEventListener("change", caricaOrdini);
document.addEventListener("civico7:online", () => {
    void caricaOrdini({ completa: true });
});
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") caricaOrdini({ completa: true });
    configuraAggiornamento();
});
if (window.paymentUI) {
    window.paymentUI.bind(lista, {
        canEdit: () => window.currentAccount?.admin === true || window.currentAccount?.staff === true,
        onUpdated: ordine => {
            const esistente = stato.ordini.find(elemento => String(elemento.numero) === String(ordine.numero));
            if (esistente) esistente.statoPagamento = ordine.statoPagamento;
            render();
            if (window.themeToast) window.themeToast(`Ordine #${ordine.numero}: ${ordine.statoPagamento === "pagato" ? "pagato" : "non pagato"}`);
        },
        onError: errore => mostraStato(errore.message, "errore")
    });
}
document.getElementById("reset-numeri").addEventListener("click", async () => {
    if (!window.confirm("Il reset eliminera' tutti gli ordini presenti e riportera' la numerazione a 1. Continuare?")) return;
    try {
        const risposta = await fetch("/api/reset-numeri", { method: "POST" });
        if (!risposta.ok) throw new Error("Reset non riuscito.");
        if (window.themeToast) window.themeToast("Ordini eliminati e numerazione resettata");
        await caricaOrdini();
    } catch (errore) {
        mostraStato(errore.message, "errore");
    }
});
async function avvia() {
    if (!await window.authReady || !window.currentAccount) return;
    let erroreMenu = null;
    try {
        const risposta = await fetch("/api/menu", { cache: "no-store" });
        if (!risposta.ok) throw new Error("Impossibile caricare il menu.");
        stato.menu = await risposta.json();
    } catch (errore) {
        erroreMenu = errore;
    }
    await caricaOrdini();
    configuraAggiornamento();
    if (erroreMenu) mostraStato(erroreMenu.message, "errore");
}
avvia();