const stato = {
    ordini: [],
    menu: [],
    timer: null,
    versioni: new Map(),
    ultimoCaricamentoCompleto: 0,
    richiestaCaricamento: 0
};
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-consegne");
const statoPagina = document.getElementById("stato");
window.orderCard.bindReprints(lista);
window.orderCard.bindDateFilter(document.getElementById("data"), document.getElementById("apri-data"));

function mostraStato(testo, classe = "") {
    statoPagina.textContent = testo;
    statoPagina.className = classe;
}

function ordiniFiltrati() {
    const testo = document.getElementById("filtro").value.trim().toLocaleLowerCase("it-IT");
    return stato.ordini.filter(ordine => {
        const corrispondeTesto = !testo || [
            ordine.indirizzoConsegna,
            ordine.telefonoConsegna
        ].some(valore => String(valore || "").toLocaleLowerCase("it-IT").includes(testo));
        return corrispondeTesto;
    });
}

function render() {
    const ordini = ordiniFiltrati();
    document.getElementById("numero-consegne").textContent = ordini.length;
    document.getElementById("etichetta-consegne").textContent = ordini.length === 1 ? "consegna" : "consegne";
    document.getElementById("totale-consegne").textContent = euro.format(
        ordini.reduce((somma, ordine) => somma + Number(ordine.totale || 0), 0)
    );
    lista.replaceChildren();
    if (!ordini.length) {
        lista.innerHTML = '<div class="vuoto">Nessuna consegna corrisponde ai filtri.</div>';
        return;
    }

    ordini.forEach(ordine => {
        lista.insertAdjacentHTML("beforeend", window.orderCard.render(ordine, {
            canEdit: window.currentAccount.admin === true || window.currentAccount.staff === true,
            hideTotalForStaff: false,
            menu: stato.menu
        }));
    });

    lista.querySelectorAll("[data-modifica]").forEach(button => {
        button.addEventListener("click", () => {
            window.location.href = `/modifica.html?numero=${encodeURIComponent(button.dataset.modifica)}`;
        });
    });
    lista.querySelectorAll("[data-elimina]").forEach(button => {
        button.addEventListener("click", () => eliminaConsegna(button.dataset.elimina));
    });
}

async function eliminaConsegna(numero) {
    if ((!window.currentAccount.admin && !window.currentAccount.staff) || !window.confirm(`Eliminare la consegna #${numero}?`)) return;
    try {
        const risposta = await fetch(`/api/ordini/${encodeURIComponent(numero)}`, { method: "DELETE" });
        if (!risposta.ok) {
            const risultato = await risposta.json();
            throw new Error(risultato.errore || "Eliminazione non riuscita.");
        }
        stato.ordini = stato.ordini.filter(ordine => String(ordine.numero) !== String(numero));
        render();
        mostraStato(`Consegna #${numero} eliminata.`);
    } catch (errore) {
        mostraStato(errore.message, "errore");
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
    return `${dataSelezionata || oggiRoma}|consegna`;
}

async function aggiornaConsegneAutomaticamente() {
    const completa = Date.now() - stato.ultimoCaricamentoCompleto >= 120_000;
    await caricaConsegne({ completa });
}

async function caricaConsegne({ completa = true } = {}) {
    const richiesta = ++stato.richiestaCaricamento;
    if (completa) mostraStato("Caricamento consegne...", "loading");
    try {
        const data = document.getElementById("data").value;
        const parametri = new URLSearchParams();
        if (data) parametri.set("data", data);
        const chiave = chiaveVersioneOrdini();
        const versione = stato.versioni.get(chiave);
        if (!completa && Number.isSafeInteger(versione)) parametri.set("versione", String(versione));
        const query = parametri.toString();
        const url = `/api/consegne${query ? `?${query}` : ""}`;
        const risposta = await fetch(url, { cache: "no-store" });
        if (richiesta !== stato.richiestaCaricamento) return;
        if (!risposta.ok) throw new Error("Impossibile caricare le consegne.");
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
        mostraStato(errore.message, "errore");
    }
}

async function caricaMenu() {
    const risposta = await fetch("/api/menu", { cache: "no-store" });
    if (!risposta.ok) throw new Error("Impossibile caricare il menu.");
    stato.menu = await risposta.json();
}

function configuraAggiornamento() {
    if (stato.timer) clearInterval(stato.timer);
    stato.timer = null;
    if (document.visibilityState === "visible") {
        stato.timer = setInterval(aggiornaConsegneAutomaticamente, 15_000);
    }
}

async function avvia() {
    if (!await window.authReady) return;
    if (!window.currentAccount) return;
    await caricaConsegne();
    configuraAggiornamento();
    if (window.currentAccount.delivery !== true) {
        try {
            await caricaMenu();
            render();
        } catch (errore) {
            mostraStato(errore.message, "errore");
        }
    }
}

document.getElementById("aggiorna").addEventListener("click", caricaConsegne);
document.getElementById("filtro").addEventListener("input", render);
document.getElementById("data").addEventListener("change", caricaConsegne);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") caricaConsegne({ completa: true });
    configuraAggiornamento();
});
if (window.paymentUI) {
    window.paymentUI.bind(lista, {
        canEdit: () => window.currentAccount?.admin === true || window.currentAccount?.staff === true,
        onUpdated: ordine => {
            const esistente = stato.ordini.find(elemento => String(elemento.numero) === String(ordine.numero));
            if (esistente) esistente.statoPagamento = ordine.statoPagamento;
            render();
            if (window.themeToast) window.themeToast(`Consegna #${ordine.numero}: ${ordine.statoPagamento === "pagato" ? "pagato" : "non pagato"}`);
        },
        onError: errore => mostraStato(errore.message, "errore")
    });
}
avvia();
