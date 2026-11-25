const CONSEGNE_INIZIO_SERA = "16:00";
const { fasciaCorrente, totaliFascia, preparaSezioniFascia } = window.consegneUI;
const stato = {
    ordini: [],
    menu: [],
    aperturaFasce: new Map(),
    dataAperturaFasce: "",
    timer: null,
    versioni: new Map(),
    ultimoCaricamentoCompleto: 0,
    richiestaCaricamento: 0
};
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-consegne");
const statoPagina = document.getElementById("stato");
const aggiornamentiStatoInCorso = new Set();
const dettagliOrdine = window.orderCard.bindReprints(lista);
window.orderCard.bindDateFilter(document.getElementById("data"), document.getElementById("apri-data"));

function statoConsegna(ordine) {
    return ["da_consegnare", "in_consegna", "consegnata"].includes(ordine.statoConsegna)
        ? ordine.statoConsegna
        : "da_consegnare";
}

function confrontaPerNumero(primo, secondo) {
    return Number(primo.numero) - Number(secondo.numero);
}

function confrontaConsegneAttive(primo, secondo) {
    const primoOrario = typeof primo.orario === "string" ? primo.orario : "";
    const secondoOrario = typeof secondo.orario === "string" ? secondo.orario : "";
    if (primoOrario && !secondoOrario) return -1;
    if (!primoOrario && secondoOrario) return 1;
    if (primoOrario && secondoOrario && primoOrario !== secondoOrario) {
        return primoOrario.localeCompare(secondoOrario);
    }
    return confrontaPerNumero(primo, secondo);
}

function confrontaConsegneCompletate(primo, secondo) {
    const primoOrario = Date.parse(primo.consegnataAlle);
    const secondoOrario = Date.parse(secondo.consegnataAlle);
    if (Number.isFinite(primoOrario) && Number.isFinite(secondoOrario) && primoOrario !== secondoOrario) {
        return secondoOrario - primoOrario;
    }
    if (Number.isFinite(primoOrario) && !Number.isFinite(secondoOrario)) return -1;
    if (!Number.isFinite(primoOrario) && Number.isFinite(secondoOrario)) return 1;
    return confrontaPerNumero(secondo, primo);
}

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
    const dataCorrente = window.orderCard.currentServiceDate();
    const dataSelezionata = document.getElementById("data").value || dataCorrente;
    if (stato.dataAperturaFasce !== dataSelezionata) {
        stato.dataAperturaFasce = dataSelezionata;
        stato.aperturaFasce.clear();
    } else {
        lista.querySelectorAll("details.consegne-fascia").forEach(sezione => {
            stato.aperturaFasce.set(sezione.dataset.fascia, sezione.open);
        });
    }
    document.getElementById("numero-consegne").textContent = ordini.length;
    document.getElementById("etichetta-consegne").textContent = ordini.length === 1 ? "consegna" : "consegne";
    document.getElementById("totale-consegne").textContent = euro.format(
        ordini.reduce((somma, ordine) => somma + Number(ordine.totale || 0), 0)
    );
    const conteggi = { da_consegnare: 0, in_consegna: 0, consegnata: 0 };
    ordini.forEach(ordine => { conteggi[statoConsegna(ordine)]++; });
    document.getElementById("riepilogo-stati-consegna").textContent =
        `${conteggi.da_consegnare} da consegnare · ${conteggi.in_consegna} in consegna · ${conteggi.consegnata} consegnate`;

    lista.replaceChildren();
    if (!ordini.length) {
        lista.innerHTML = '<div class="vuoto">Nessuna consegna corrisponde ai filtri.</div>';
        dettagliOrdine.refresh();
        return;
    }

    const totali = totaliFascia(ordini, CONSEGNE_INIZIO_SERA);
    const sezioni = preparaSezioniFascia(ordini, stato.aperturaFasce, {
        dataSelezionata,
        dataCorrente,
        fasciaCorrente: fasciaCorrente(new Date(), CONSEGNE_INIZIO_SERA),
        inizioSera: CONSEGNE_INIZIO_SERA
    });
    const isRider = window.currentAccount.delivery === true
        && window.currentAccount.admin !== true
        && window.currentAccount.staff !== true;
    const cardMarkup = ordine => window.orderCard.render(ordine, {
            canEdit: window.currentAccount.admin === true || window.currentAccount.staff === true,
            hideTotalForStaff: false,
            deliveryMode: true,
            isRider,
            menu: stato.menu
        });
    const sezioniMarkup = sezioni.map(sezione => {
        const ordiniFascia = sezione.ordini;
        const attive = ordiniFascia.filter(ordine => statoConsegna(ordine) !== "consegnata")
            .sort(confrontaConsegneAttive);
        const completate = ordiniFascia.filter(ordine => statoConsegna(ordine) === "consegnata")
            .sort(confrontaConsegneCompletate);
        const fasciaTotale = totali[sezione.fascia];
        const pagamenti = [
            ["POS", fasciaTotale.pos, ""],
            ["Pagato", fasciaTotale.pagato, ""],
            ["Non pagato · contanti", fasciaTotale.nonPagato, " consegne-fascia__totale--contanti"]
        ];
        if (fasciaTotale.daVerificare.consegne > 0) {
            pagamenti.push(["Da verificare", fasciaTotale.daVerificare, ""]);
        }
        const pagamentiMarkup = pagamenti.map(([label, pagamento, classe]) => (
            `<span class="consegne-fascia__totale${classe}"><span>${label}</span><strong>${euro.format(pagamento.totaleCentesimi / 100)}</strong><small>${pagamento.consegne} ${pagamento.consegne === 1 ? "consegna" : "consegne"}</small></span>`
        )).join("");
        const attiveMarkup = attive.length
            ? `<div class="consegne-fascia__attive">${attive.map(cardMarkup).join("")}</div>`
            : "";
        const completateMarkup = completate.length
            ? `<details class="consegne-completate"><summary>Consegnate (${completate.length})</summary><div class="consegne-completate__lista">${completate.map(cardMarkup).join("")}</div></details>`
            : "";
        const titolo = sezione.fascia === "mattina" ? "Mattina" : "Sera";
        const totaleConsegne = fasciaTotale.consegne;
        return `<details class="consegne-fascia" data-fascia="${sezione.fascia}"${sezione.open ? " open" : ""}><summary class="consegne-fascia__summary"><span class="consegne-fascia__titolo">${titolo}</span><span class="consegne-fascia__conteggio">${totaleConsegne} ${totaleConsegne === 1 ? "consegna" : "consegne"}</span><strong class="consegne-fascia__importo">${euro.format(fasciaTotale.totaleCentesimi / 100)}</strong><span class="consegne-fascia__pagamenti">${pagamentiMarkup}</span></summary>${attiveMarkup}${completateMarkup}</details>`;
    }).join("");
    lista.innerHTML = sezioniMarkup;
    lista.querySelectorAll("details.consegne-fascia").forEach(sezione => {
        sezione.addEventListener("toggle", () => {
            stato.aperturaFasce.set(sezione.dataset.fascia, sezione.open);
        });
    });

    dettagliOrdine.refresh();
}

async function aggiornaStatoConsegna(numero, nuovoStato) {
    const id = String(numero);
    if (aggiornamentiStatoInCorso.has(id)) return;
    const ordine = stato.ordini.find(elemento => String(elemento.numero) === id);
    if (!ordine) return;

    aggiornamentiStatoInCorso.add(id);
    const statoPrecedente = ordine.statoConsegna;
    const consegnataAllePrecedente = ordine.consegnataAlle;
    ordine.statoConsegna = nuovoStato;
    if (nuovoStato === "consegnata") ordine.consegnataAlle = new Date().toISOString();
    else delete ordine.consegnataAlle;
    render();

    try {
        const risposta = await fetch(`/api/ordini/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statoConsegna: nuovoStato })
        });
        const risultato = await risposta.json();
        if (!risposta.ok) throw new Error(risultato.errore || "Aggiornamento dello stato consegna non riuscito.");
        ordine.statoConsegna = risultato.statoConsegna || nuovoStato;
        if (risultato.consegnataAlle) ordine.consegnataAlle = risultato.consegnataAlle;
        else delete ordine.consegnataAlle;
        mostraStato("");
        render();
    } catch (errore) {
        if (statoPrecedente === undefined) delete ordine.statoConsegna;
        else ordine.statoConsegna = statoPrecedente;
        if (consegnataAllePrecedente === undefined) delete ordine.consegnataAlle;
        else ordine.consegnataAlle = consegnataAllePrecedente;
        render();
        mostraStato(errore.message || "Aggiornamento dello stato consegna non riuscito.", "errore");
    } finally {
        aggiornamentiStatoInCorso.delete(id);
    }
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
    const oggiRoma = window.orderCard.currentServiceDate();
    return `${dataSelezionata || oggiRoma}|consegna`;
}

async function aggiornaConsegneAutomaticamente() {
    const completa = Date.now() - stato.ultimoCaricamentoCompleto >= 120_000;
    await caricaConsegne({ completa });
}

async function caricaConsegne({ completa = true } = {}) {
    const richiesta = ++stato.richiestaCaricamento;
    if (completa && lista.childElementCount === 0) mostraStato("Caricamento consegne...", "loading");
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
document.body.addEventListener("click", event => {
    const statusButton = event.target.closest("[data-stato-consegna]");
    if (statusButton && (lista.contains(statusButton) || dettagliOrdine.dialog.contains(statusButton))) {
        void aggiornaStatoConsegna(statusButton.dataset.numero, statusButton.dataset.statoConsegna);
        return;
    }
    const deleteButton = event.target.closest("[data-elimina]");
    if (deleteButton && (lista.contains(deleteButton) || dettagliOrdine.dialog.contains(deleteButton))) {
        void eliminaConsegna(deleteButton.dataset.elimina);
    }
});
document.getElementById("data").addEventListener("change", () => {
    stato.aperturaFasce.clear();
    stato.dataAperturaFasce = "";
    void caricaConsegne();
});
document.addEventListener("civico7:online", () => {
    void caricaConsegne({ completa: true });
});
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") caricaConsegne({ completa: true });
    configuraAggiornamento();
});
if (window.paymentUI) {
    window.paymentUI.bind(document.body, {
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
