const stato = { ordini: [], menu: [], timer: null, richiestaCaricamento: 0 };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-ordini");
const statoPagina = document.getElementById("stato");
const eliminazioniInCorso = new Set();
const tipoServizio = document.body.dataset.serviceType || "";
window.orderCard.bindReprints(lista);

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
    if (window.currentAccount?.staff !== true) {
        document.getElementById("totale-ordini").textContent = euro.format(ordini.reduce((somma, ordine) => somma + Number(ordine.totale), 0));
    }
    lista.innerHTML = "";
    if (!ordini.length) { lista.innerHTML = '<div class="vuoto">Nessun ordine corrisponde ai filtri.</div>'; return; }
    ordini.slice().reverse().forEach(ordine => {
        lista.insertAdjacentHTML("beforeend", window.orderCard.render(ordine, {
            canEdit: window.currentAccount?.admin === true || window.currentAccount?.staff === true,
            menu: stato.menu
        }));
    });
    lista.querySelectorAll("[data-modifica]").forEach(button => button.addEventListener("click", () => window.location.href = `/modifica.html?numero=${button.dataset.modifica}`));
    lista.querySelectorAll("[data-elimina]").forEach(button => button.addEventListener("click", () => eliminaOrdine(button.dataset.elimina)));
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
async function caricaOrdini() {
    const richiesta = ++stato.richiestaCaricamento;
    mostraStato("Caricamento ordini...", "loading");
    try {
        const parametri = new URLSearchParams();
        const data = document.getElementById("data").value;
        if (data) parametri.set("data", data);
        if (tipoServizio) parametri.set("tipo", tipoServizio);
        const query = parametri.toString();
        const urlOrdini = `/api/ordini${query ? `?${query}` : ""}`;
        const risposta = await fetch(urlOrdini, { cache: "no-store" });
        if (richiesta !== stato.richiestaCaricamento) return;
        if (!risposta.ok) throw new Error("Impossibile caricare gli ordini.");
        const ordini = await risposta.json();
        if (richiesta !== stato.richiestaCaricamento) return;
        stato.ordini = ordini;
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
    if (document.getElementById("autoAggiorna").checked && document.visibilityState === "visible") {
        stato.timer = setInterval(caricaOrdini, 15000);
    }
}
document.getElementById("aggiorna").addEventListener("click", caricaOrdini);
document.getElementById("filtro").addEventListener("input", render);
document.getElementById("data").addEventListener("change", caricaOrdini);
document.getElementById("autoAggiorna").addEventListener("change", configuraAggiornamento);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && document.getElementById("autoAggiorna").checked) {
        caricaOrdini();
    }
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