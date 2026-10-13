const stato = { ordini: [], menu: [], timer: null, richiestaCaricamento: 0 };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-ordini");
const statoPagina = document.getElementById("stato");
const eliminazioniInCorso = new Set();

function testoSicuro(valore) { const elemento = document.createElement("span"); elemento.textContent = valore == null ? "" : valore; return elemento.innerHTML; }
function mostraStato(testo, classe) { statoPagina.textContent = testo; statoPagina.className = classe || ""; }
function ordiniFiltrati() {
    const testo = document.getElementById("filtro").value.trim().toLowerCase();
    const data = document.getElementById("data").value;
    return stato.ordini.filter(ordine => (!testo || ordine.tavoloOCliente.toLowerCase().includes(testo)) && (!data || ordine.dataOra.substring(0, 10) === data));
}
function render() {
    const ordini = ordiniFiltrati();
    document.getElementById("numero-ordini").textContent = ordini.length;
    document.getElementById("totale-ordini").textContent = euro.format(ordini.reduce((somma, ordine) => somma + Number(ordine.totale), 0));
    lista.innerHTML = "";
    if (!ordini.length) { lista.innerHTML = '<div class="vuoto">Nessun ordine corrisponde ai filtri.</div>'; return; }
    ordini.slice().reverse().forEach((ordine, indice) => {
        const dataOra = new Date(ordine.dataOra);
        const righe = ordine.righe.map(riga => { const extra = riga.extra.length ? `Extra: ${riga.extra.map(elemento => elemento.nome || elemento).join(", ")} (+${euro.format(riga.extra.reduce((totale, elemento) => totale + Number(elemento.prezzo || 1), 0))})` : "Nessun extra"; const prodotto = stato.menu.find(item => item.nome === riga.prodotto); const ingredienti = prodotto?.ingredienti?.length ? `<small class="riga-ingredienti">${testoSicuro(prodotto.ingredienti.join(", "))}</small>` : ""; return `<div class="riga"><div><strong>${testoSicuro(riga.prodotto)}</strong>${ingredienti}<span>${testoSicuro(extra)} | Base: ${euro.format(Number(riga.prezzoBase))}</span></div><div class="riga-prezzo">${euro.format(Number(riga.totale))}</div></div>`; }).join("");
        const note = ordine.note ? `<p class="ordine-note">Note: ${testoSicuro(ordine.note)}</p>` : "";
        lista.insertAdjacentHTML("beforeend", `<article class="ordine ${indice === 0 && !document.getElementById("filtro").value && !document.getElementById("data").value ? "recente" : ""}"><div class="ordine-testa"><div><h2>Ordine #${ordine.numero}</h2><p>${dataOra.toLocaleString("it-IT")} | ${testoSicuro(ordine.tavoloOCliente)}</p></div><div class="ordine-totale">${euro.format(Number(ordine.totale))}</div></div>${note}<div class="ordine-righe">${righe}</div><div class="azioni"><button type="button" data-modifica="${ordine.numero}">Modifica</button><button type="button" data-elimina="${ordine.numero}" class="pericolo">Elimina</button></div></article>`);
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
        const risposte = await Promise.all([fetch("/api/ordini", { cache: "no-store" }), fetch("/api/menu", { cache: "no-store" })]);
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
caricaOrdini(); configuraAggiornamento();