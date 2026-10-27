const stato = { ordini: [], menu: [], timer: null, richiestaCaricamento: 0 };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-ordini");
const statoPagina = document.getElementById("stato");
const eliminazioniInCorso = new Set();
const tipoServizio = document.body.dataset.serviceType || "";

function mostraStato(testo, classe) { statoPagina.textContent = testo; statoPagina.className = classe || ""; }
function tipoNormalizzato(tipo) { return tipo === "sala" ? "tavolo" : tipo || "tavolo"; }
function ordiniFiltrati() {
    const testo = document.getElementById("filtro").value.trim().toLowerCase();
    const data = document.getElementById("data").value;
    return stato.ordini.filter(ordine => (!tipoServizio || tipoNormalizzato(ordine.tipo) === tipoServizio)
        && (!testo || [
            ordine.tavoloOCliente,
            ordine.cognomeBanco,
            ordine.indirizzoConsegna,
            ordine.telefonoConsegna,
            ordine.telefonoRitiro,
            ...(ordine.righe || []).map(riga => riga.prodotto)
        ].some(valore => String(valore || "").toLowerCase().includes(testo)))
        && (!data || ordine.dataOra.substring(0, 10) === data));
}
function render() {
    const ordini = ordiniFiltrati();
    document.getElementById("numero-ordini").textContent = ordini.length;
    document.getElementById("totale-ordini").textContent = euro.format(ordini.reduce((somma, ordine) => somma + Number(ordine.totale), 0));
    lista.innerHTML = "";
    if (!ordini.length) { lista.innerHTML = '<div class="vuoto">Nessun ordine corrisponde ai filtri.</div>'; return; }
    ordini.slice().reverse().forEach(ordine => {
        lista.insertAdjacentHTML("beforeend", window.orderCard.render(ordine, {
            canEdit: window.currentAccount?.admin === true,
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
        if (!risposta.ok) throw new Error("Eliminazione non riuscita.");
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
        const urlOrdini = tipoServizio ? `/api/ordini?tipo=${encodeURIComponent(tipoServizio)}` : "/api/ordini";
        const risposte = await Promise.all([fetch(urlOrdini, { cache: "no-store" }), fetch("/api/menu", { cache: "no-store" })]);
        if (richiesta !== stato.richiestaCaricamento) return;
        if (!risposte[0].ok || !risposte[1].ok) throw new Error("Impossibile caricare gli ordini.");
        const [ordini, menu] = await Promise.all([risposte[0].json(), risposte[1].json()]);
        if (richiesta !== stato.richiestaCaricamento) return;
        stato.ordini = ordini;
        stato.menu = menu;
        document.getElementById("ultimo-aggiornamento").textContent = new Date().toLocaleTimeString("it-IT");
        render();
        mostraStato("");
    } catch (errore) {
        if (richiesta !== stato.richiestaCaricamento) return;
        mostraStato(errore.message, "errore");
    }
}
function configuraAggiornamento() { if (stato.timer) clearInterval(stato.timer); if (document.getElementById("autoAggiorna").checked) stato.timer = setInterval(caricaOrdini, 15000); }
document.getElementById("aggiorna").addEventListener("click", caricaOrdini);
document.getElementById("filtro").addEventListener("input", render);
document.getElementById("data").addEventListener("change", render);
document.getElementById("autoAggiorna").addEventListener("change", configuraAggiornamento);
if (window.paymentUI) {
    window.paymentUI.bind(lista, {
        canEdit: () => window.currentAccount?.admin === true,
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
    if (!window.confirm("Sei sicuro di voler eliminare tutti gli ordini?")) return;
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
    await caricaOrdini();
    configuraAggiornamento();
}
avvia();