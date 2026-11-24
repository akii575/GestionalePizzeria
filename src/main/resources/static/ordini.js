const stato = { categoria: "pizze", menu: [], extra: [], righe: [], rigaAttiva: null };
const statoTavoliOccupati = {
    ordini: new Map(),
    versione: null,
    data: "",
    caricato: false,
    richiesta: 0,
    timer: null
};
const parametriUrl = new URLSearchParams(window.location.search);
const numeroModificaParametro = parametriUrl.get("modifica") || "";
const numeroModifica = /^\d+$/.test(numeroModificaParametro)
    && Number.isSafeInteger(Number(numeroModificaParametro))
    && Number(numeroModificaParametro) > 0
    ? Number(numeroModificaParametro)
    : null;
const originiModifica = new Set(["gestionale", "consegne", "tavoli", "ritiri", "banco"]);
const paginaRitornoModifica = originiModifica.has(parametriUrl.get("da"))
    ? `/${parametriUrl.get("da")}.html`
    : "/gestionale.html";
let payloadOriginaleModifica = null;
let caricamentoModificaInCorso = false;
let erroreCaricamentoModifica = false;
let tipoOrdineOriginale = null;
let numeroPersoneOriginale = null;
let copertoOrdine = null;
let pagamentoModifica = "";
const prodotti = document.getElementById("prodotti");
const riepilogo = document.getElementById("riepilogo-items");
const riepilogoConteggio = document.getElementById("riepilogo-conteggio");
const barraTotale = document.getElementById("barra-totale");
const barraConteggio = document.getElementById("barra-conteggio");
const riepilogoSheetBackdrop = document.getElementById("riepilogo-sheet-backdrop");
const riepilogoSheet = document.getElementById("riepilogo-sheet");
const riepilogoSheetHeader = document.querySelector(".riepilogo-sheet-header");
const riepilogoSheetChiudi = document.getElementById("riepilogo-sheet-chiudi");
const riepilogoSheetLista = document.getElementById("riepilogo-sheet-items");
const mediaRiepilogoSheet = window.matchMedia("(max-width: 1023px) and (orientation: portrait)");
const barraConto = document.querySelector(".barra-conto");
const riepilogoSheetApri = document.querySelector(".barra-conto-dettagli");
let riepilogoSheetAperto = false;
let trascinamentoRiepilogo = null;
let trascinamentoChiusuraSheet = null;
let timerNascondiRiepilogoSheet = 0;
let overflowRadicePrecedente = null;
const messaggio = document.getElementById("messaggio");
const riprovaModifica = document.getElementById("riprova-modifica");
const invia = document.getElementById("btn-invia");
const sezioneExtra = document.getElementById("extra-section");
const extraLista = document.getElementById("extra-lista");
const extraIntestazione = document.getElementById("extra-intestazione");
const extraProdotto = document.getElementById("extra-prodotto");
const extraSenzaConteggio = document.getElementById("extra-senza-conteggio");
const extraConteggio = document.getElementById("extra-conteggio");
const extraRicerca = document.getElementById("extra-ricerca");
const extraRicercaVuota = document.getElementById("extra-ricerca-vuota");
const noteRigaConteggio = document.getElementById("note-riga-conteggio");
const extraFreccia = document.getElementById("extra-freccia");
const extraDettagli = document.getElementById("extra-dettagli");
const senzaIngredienti = document.getElementById("senza-ingredienti");
const senzaIngredientiLista = document.getElementById("senza-ingredienti-lista");
const noteRiga = document.getElementById("note-riga");
const noteRigaLista = document.getElementById("note-riga-lista");
const mediaGrigliaExtra = window.matchMedia("(max-width: 699px)");
const mediaPannelloExtra = window.matchMedia("(min-width: 800px)");
const prodottiWrapper = document.querySelector(".prodotti-wrapper");
const prodottiIndicatore = document.getElementById("prodotti-indicatore");
const extraFatto = document.getElementById("extra-fatto");
let extraAperto = false;
let prodottoCoperto = null;
const tipoOrdine = document.getElementById("tipo-ordine");
const campoTavolo = document.getElementById("campo-tavolo");
const tavolo = document.getElementById("tavolo");
const tavoloPersonalizzato = document.getElementById("tavolo-personalizzato");
const numeroTavoloPersonalizzato = document.getElementById("numero-tavolo-personalizzato");
const numeroPersone = document.getElementById("numero-persone");
const selettoreTipoOrdine = document.getElementById("selettore-tipo-ordine");
const tavoliGriglia = document.getElementById("tavoli-griglia");
const personeSelettore = document.getElementById("persone-selettore");
const personePersonalizzate = document.getElementById("persone-personalizzate");
const sezioneTavoli = document.getElementById("sezione-tavoli");
const statoTavoliOccupatiElement = document.getElementById("stato-tavoli-occupati");
const sezionePersone = document.getElementById("sezione-persone");
const intestazione = document.querySelector(".composer-main > .tavolo-input");
const intestazioneCompatta = document.getElementById("intestazione-compatta");
const intestazioneCompattaTesto = document.getElementById("intestazione-compatta-testo");
const noteToggle = document.getElementById("note-toggle");
const noteRapide = document.getElementById("note-rapide");
const noteEditor = document.getElementById("note-editor");
const note = document.getElementById("note");
const composerMain = document.querySelector(".composer-main");
let noteAperta = false;
const campoRitiro = document.getElementById("campo-ritiro");
const campiConsegna = document.getElementById("campi-consegna");
const inputIndirizzoConsegna = document.getElementById("indirizzo-consegna");
const inputTelefonoConsegna = document.getElementById("telefono-consegna");
const clientiIndirizzoRisultati = document.getElementById("clienti-indirizzo-risultati");
const clientiIndirizzoLista = document.getElementById("clienti-indirizzo-lista");
const campoOrario = document.getElementById("campo-orario");
const orario = document.getElementById("orario");
const campoPagamentoRitiro = document.getElementById("campo-pagamento-ritiro");
const campoPagamentoConsegna = document.getElementById("campo-pagamento-consegna");
const pagamentoRitiro = document.getElementById("pagamento-ritiro");
const pagamentoConsegna = document.getElementById("pagamento-consegna");
const confermaModale = document.getElementById("conferma-modale");
const annullaModificaModale = document.getElementById("annulla-modifica-modale");
const confermaIntestazione = document.getElementById("conferma-intestazione");
const confermaRighe = document.getElementById("conferma-righe");
const confermaTotale = document.getElementById("conferma-totale");
const bottoneCostoConsegna = document.getElementById("btn-costo-consegna");
const bottoneRicerca = document.getElementById("btn-ricerca");
const bottoneIngredienti = document.getElementById("btn-ingredienti");
const ricercaModale = document.getElementById("ricerca-modale");
const ricercaInput = document.getElementById("ricerca-input");
const ricercaRisultati = document.getElementById("ricerca-risultati");
const ricercaWrapper = ricercaRisultati.parentElement;
const ricercaPagine = document.getElementById("ricerca-pagine");
const ricercaTasti = document.getElementById("ricerca-tasti");
const ricercaMoltiplicatore = document.getElementById("ricerca-moltiplicatore");
const ricercaMessaggio = document.getElementById("ricerca-messaggio");
const paginaPrincipale = document.querySelector("main");
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const { escapeHtml } = window.htmlUtils;
const {
    NOTE_RIGA,
    filtraProdotti,
    filtraExtra,
    trovaComponibileSenzaIngredienti,
    isCoperto,
    calcolaCoperto,
    preparaRigheModifica,
    creaPayloadComanda,
    puoSalvareModifica,
    aggiungiProdotti,
    quantitaProdotto,
    preparaRipetizione,
    impostaRigaAttiva,
    raggruppaRigheConferma,
    rimuoviProdotto,
    toggleExtra,
    toggleSenza,
    toggleNotaRiga,
    normalizzaNoteRiga,
    creaStatoMoltiplicatore,
    premiTastoMoltiplicatore,
    quantitaDaApplicare,
    testoMoltiplicatore,
    aggiornaConteggioProdotti,
    controllaLimiteRighe,
    impostaValoreControllo,
    nomeTavoloDaNumero,
    numeroTavoloDaNome,
    calcolaTavoliOccupati,
    datiObbligatoriMancanti,
    datiOrdineCompleti,
    deveChiudereIntestazione,
    riepilogoIntestazione,
    anteprimaNota,
    aggiungiNotaRapida,
    togliNotaRapida,
    notaContiene
} = window.prodottiUI;
const clientiAbituali = window.prodottiUI.creaGestoreSuggerimentiClienti();
const gestioneTavoli = window.prodottiUI.creaGestoreTavoli();
let etichetteCategorie = Object.fromEntries(
    [...document.querySelectorAll(".tab[data-tab]")].map(tab => [tab.dataset.tab, tab.textContent.trim()])
);
const tabsCategorie = document.querySelector(".tab-container");
let costoConsegna = 0;
const chiaveIngredientiVisibili = "civico7-ordini-ingredienti-visibili";
let ingredientiVisibili = leggiIngredientiVisibili();
let statoMoltiplicatore = creaStatoMoltiplicatore();
let trascinamentoExtra = null;
let ignoraClickDopoTrascinamentoExtra = false;
const cacheClienti = new Map();
let timerRicercaCliente = 0;
let tokenRicercaCliente = 0;
const cacheRicercaClientiIndirizzo = new Map();
let timerRicercaClientiIndirizzo = 0;
let tokenRicercaClientiIndirizzo = 0;
let tipoOrdineCorrente = tipoOrdine.value;
const iconeCliente = {
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    stella: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9L12 3Z" fill="currentColor" stroke="none"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    orologio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/>',
    chiudi: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>'
};

function normalizzaTelefonoCliente(valore) {
    if (typeof valore !== "string") return null;
    const cifre = valore.trim().replace(/^(?:\+39|0039)/, "").replace(/\D/g, "");
    return cifre.length >= 9 ? cifre : null;
}

function creaIconaCliente(nome, dimensione = 18) {
    const icona = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icona.setAttribute("viewBox", "0 0 24 24");
    icona.setAttribute("width", String(dimensione));
    icona.setAttribute("height", String(dimensione));
    icona.setAttribute("aria-hidden", "true");
    icona.setAttribute("focusable", "false");
    icona.setAttribute("fill", "none");
    icona.setAttribute("stroke", "currentColor");
    icona.setAttribute("stroke-width", "1.8");
    icona.setAttribute("stroke-linecap", "round");
    icona.setAttribute("stroke-linejoin", "round");
    icona.innerHTML = iconeCliente[nome];
    return icona;
}

function datiUltimoOrdine(ultimoOrdine) {
    if (!ultimoOrdine || !Array.isArray(ultimoOrdine.righe)) return null;
    const data = new Date(ultimoOrdine.data);
    const dataBreve = Number.isNaN(data.getTime())
        ? ""
        : new Intl.DateTimeFormat("it-IT", {
            day: "2-digit",
            month: "2-digit",
            timeZone: "Europe/Rome"
        }).format(data);
    const righe = ultimoOrdine.righe.map(riga => {
        const extra = Array.isArray(riga.extra) && riga.extra.length
            ? ` + ${riga.extra.join(", ")}`
            : "";
        return `${riga.quantita}× ${riga.prodotto}${extra}`;
    });
    return { dataBreve, righe };
}

function mostraClienteAbituale(container, cliente, tipo, numero, forzaVisibilita = false) {
    container.replaceChildren();
    container.hidden = !cliente?.trovato
        || (!forzaVisibilita && !clientiAbituali.visibile(numero, cliente?.trovato));
    if (container.hidden) return;

    const intestazione = document.createElement("div");
    intestazione.className = "cliente-abituale-intestazione";
    const distintivo = document.createElement("span");
    distintivo.className = "cliente-abituale-distintivo";
    distintivo.appendChild(creaIconaCliente("stella"));
    intestazione.appendChild(distintivo);

    const titolo = document.createElement("strong");
    titolo.className = "cliente-abituale-titolo";
    titolo.textContent = "Cliente abituale";
    intestazione.appendChild(titolo);

    const conteggio = document.createElement("span");
    conteggio.className = "cliente-abituale-conteggio";
    conteggio.textContent = window.prodottiUI.etichettaOrdiniCliente(cliente.ordiniTotali);
    intestazione.appendChild(conteggio);
    container.appendChild(intestazione);

    const chiudi = document.createElement("button");
    chiudi.type = "button";
    chiudi.className = "cliente-abituale-chiudi";
    chiudi.setAttribute("aria-label", "Chiudi suggerimento cliente");
    chiudi.appendChild(creaIconaCliente("chiudi"));
    chiudi.addEventListener("click", () => clientiAbituali.chiudi(container, numero));
    container.appendChild(chiudi);

    const valore = tipo === "consegna" ? cliente.indirizzo : cliente.nome;
    const campo = document.getElementById(tipo === "consegna" ? "indirizzo-consegna" : "cliente-ritiro");
    if (valore) {
        const dettaglio = document.createElement("div");
        dettaglio.className = "cliente-abituale-dettaglio";
        const testo = document.createElement("span");
        testo.className = "cliente-abituale-valore";
        testo.appendChild(creaIconaCliente("pin"));
        const testoValore = document.createElement("span");
        testoValore.textContent = valore;
        testo.appendChild(testoValore);
        dettaglio.appendChild(testo);
        if (!campo.value.trim()) {
            campo.value = valore;
        }
        if (campo.value.trim() === valore.trim()) {
            const statoInserimento = document.createElement("span");
            statoInserimento.className = "cliente-abituale-stato";
            statoInserimento.appendChild(creaIconaCliente("check", 16));
            statoInserimento.append("Inserito");
            dettaglio.appendChild(statoInserimento);
        } else {
            const usa = document.createElement("button");
            usa.type = "button";
            usa.className = "cliente-abituale-usa";
            usa.textContent = tipo === "consegna" ? "Usa indirizzo" : "Usa nome";
            usa.addEventListener("click", () => {
                campo.value = valore;
                const statoInserimento = document.createElement("span");
                statoInserimento.className = "cliente-abituale-stato";
                statoInserimento.appendChild(creaIconaCliente("check", 16));
                statoInserimento.append("Inserito");
                usa.replaceWith(statoInserimento);
            });
            dettaglio.appendChild(usa);
        }
        container.appendChild(dettaglio);
    }

    const ultimoOrdine = datiUltimoOrdine(cliente.ultimoOrdine);
    if (!ultimoOrdine || !ultimoOrdine.righe.length) return;
    const riepilogoOrdine = document.createElement("div");
    riepilogoOrdine.className = "cliente-abituale-ultimo-ordine";
    const intestazioneOrdine = document.createElement("div");
    intestazioneOrdine.className = "cliente-abituale-ultimo-titolo";
    intestazioneOrdine.appendChild(creaIconaCliente("orologio", 16));
    intestazioneOrdine.append(
        `Ultimo ordine${ultimoOrdine.dataBreve ? ` · ${ultimoOrdine.dataBreve}` : ""}`
    );
    riepilogoOrdine.appendChild(intestazioneOrdine);
    const righeOrdine = document.createElement("div");
    righeOrdine.className = "cliente-abituale-righe";
    for (const riga of ultimoOrdine.righe) {
        const chip = document.createElement("span");
        chip.className = "cliente-abituale-riga";
        chip.textContent = riga;
        righeOrdine.appendChild(chip);
    }
    riepilogoOrdine.appendChild(righeOrdine);
    container.appendChild(riepilogoOrdine);
    const ripeti = document.createElement("button");
    ripeti.type = "button";
    ripeti.className = "cliente-abituale-ripeti";
    ripeti.appendChild(creaIconaCliente("refresh"));
    ripeti.append("Ripeti ultimo ordine");
    ripeti.addEventListener("click", () => ripetiUltimoOrdine(cliente.ultimoOrdine));
    container.appendChild(ripeti);
}

function chiudiRisultatiClientiIndirizzo() {
    window.clearTimeout(timerRicercaClientiIndirizzo);
    tokenRicercaClientiIndirizzo++;
    clientiIndirizzoRisultati.hidden = true;
    clientiIndirizzoLista.replaceChildren();
}

function aggiungiIndirizzoEvidenziato(elemento, indirizzo) {
    const query = window.prodottiUI.normalizza(inputIndirizzoConsegna.value);
    if (!query || !window.prodottiUI.normalizza(indirizzo).startsWith(query)) {
        elemento.textContent = indirizzo;
        return;
    }

    let fine = 0;
    for (let indice = 0; indice < indirizzo.length;) {
        indice += String.fromCodePoint(indirizzo.codePointAt(indice)).length;
        const prefisso = window.prodottiUI.normalizza(indirizzo.slice(0, indice));
        if (prefisso === query) {
            fine = indice;
            break;
        }
        if (!query.startsWith(prefisso)) break;
    }
    if (!fine) {
        elemento.textContent = indirizzo;
        return;
    }

    const evidenziato = document.createElement("strong");
    evidenziato.textContent = indirizzo.slice(0, fine);
    elemento.append(evidenziato, document.createTextNode(indirizzo.slice(fine)));
}

function formattaTelefonoCliente(telefono) {
    const cifre = String(telefono || "").replace(/\D/g, "");
    if (cifre.length === 10) return `${cifre.slice(0, 3)} ${cifre.slice(3, 6)} ${cifre.slice(6)}`;
    return cifre.replace(/(\d{3})(?=\d)/g, "$1 ");
}

function mostraRisultatiClientiIndirizzo(clienti) {
    clientiIndirizzoLista.replaceChildren();
    for (const cliente of clienti.slice(0, 5)) {
        const risultato = document.createElement("button");
        risultato.type = "button";
        risultato.setAttribute("role", "option");
        risultato.className = "clienti-indirizzo-risultato";
        const iconaIndirizzo = document.createElement("span");
        iconaIndirizzo.className = "clienti-indirizzo-pin";
        iconaIndirizzo.appendChild(creaIconaCliente("pin"));
        risultato.appendChild(iconaIndirizzo);

        const testo = document.createElement("span");
        testo.className = "clienti-indirizzo-testo";
        const indirizzo = document.createElement("span");
        indirizzo.className = "clienti-indirizzo-via";
        aggiungiIndirizzoEvidenziato(indirizzo, cliente.indirizzo);
        testo.appendChild(indirizzo);
        const dettagli = document.createElement("span");
        dettagli.className = "clienti-indirizzo-dettagli";
        dettagli.textContent = `${formattaTelefonoCliente(cliente.telefono)} · ${window.prodottiUI.etichettaOrdiniCliente(cliente.ordiniTotali)}`;
        testo.appendChild(dettagli);
        risultato.appendChild(testo);

        const chevron = document.createElement("span");
        chevron.className = "clienti-indirizzo-chevron";
        chevron.appendChild(creaIconaCliente("chevron"));
        risultato.appendChild(chevron);
        risultato.addEventListener("pointerdown", evento => evento.preventDefault());
        risultato.addEventListener("click", () => selezionaClienteDaIndirizzo(cliente));
        clientiIndirizzoLista.appendChild(risultato);
    }
    clientiIndirizzoRisultati.hidden = clientiIndirizzoLista.childElementCount === 0;
}

function selezionaClienteDaIndirizzo(cliente) {
    chiudiRisultatiClientiIndirizzo();
    if (tipoOrdine.value !== "consegna") return;

    const telefono = String(cliente.telefono || "");
    if (!telefono) return;
    const clienteTrovato = { ...cliente, trovato: true };
    window.clearTimeout(timerRicercaCliente);
    tokenRicercaCliente++;
    cacheClienti.set(telefono, Promise.resolve(clienteTrovato));
    window.prodottiUI.applicaClienteIndirizzo(
        clienteTrovato,
        { telefono: inputTelefonoConsegna, indirizzo: inputIndirizzoConsegna },
        dati => mostraClienteAbituale(
            document.getElementById("cliente-abituale-consegna"),
            dati,
            "consegna",
            telefono,
            true
        )
    );
}

async function cercaClientiPerIndirizzo(indirizzo, token) {
    let richiesta = cacheRicercaClientiIndirizzo.get(indirizzo);
    if (!richiesta) {
        richiesta = fetch(`/api/clienti?indirizzo=${encodeURIComponent(indirizzo)}`)
            .then(async risposta => {
                const dati = await risposta.json();
                if (!risposta.ok) throw new Error(dati.errore || "Ricerca cliente non riuscita.");
                return Array.isArray(dati.risultati) ? dati.risultati : [];
            })
            .catch(errore => {
                cacheRicercaClientiIndirizzo.delete(indirizzo);
                throw errore;
            });
        cacheRicercaClientiIndirizzo.set(indirizzo, richiesta);
    }
    try {
        const clienti = await richiesta;
        if (token !== tokenRicercaClientiIndirizzo
                || tipoOrdine.value !== "consegna"
                || window.prodottiUI.normalizza(inputIndirizzoConsegna.value) !== indirizzo) return;
        mostraRisultatiClientiIndirizzo(clienti);
    } catch {
        // La ricerca dell'indirizzo non deve interrompere l'inserimento dell'ordine.
    }
}

function aggiornaRicercaClientiIndirizzo() {
    chiudiRisultatiClientiIndirizzo();
    if (tipoOrdine.value !== "consegna") return;
    const indirizzo = window.prodottiUI.normalizza(inputIndirizzoConsegna.value);
    if (indirizzo.length < 3) return;
    const token = tokenRicercaClientiIndirizzo;
    timerRicercaClientiIndirizzo = window.setTimeout(
        () => cercaClientiPerIndirizzo(indirizzo, token),
        300
    );
}

async function cercaClienteAbituale(tipo, numero, token) {
    if (!clientiAbituali.visibile(numero, true)) return;
    let richiesta = cacheClienti.get(numero);
    if (!richiesta) {
        richiesta = fetch(`/api/clienti?telefono=${encodeURIComponent(numero)}`)
            .then(async risposta => {
                const dati = await risposta.json();
                if (!risposta.ok) throw new Error(dati.errore || "Ricerca cliente non riuscita.");
                return dati;
            })
            .catch(errore => {
                cacheClienti.delete(numero);
                throw errore;
            });
        cacheClienti.set(numero, richiesta);
    }
    try {
        const cliente = await richiesta;
        const input = document.getElementById(tipo === "consegna" ? "telefono-consegna" : "telefono-ritiro");
        if (token !== tokenRicercaCliente
                || tipoOrdine.value !== tipo
                || normalizzaTelefonoCliente(input.value) !== numero) return;
        mostraClienteAbituale(
            document.getElementById(tipo === "consegna" ? "cliente-abituale-consegna" : "cliente-abituale-ritiro"),
            cliente,
            tipo,
            numero
        );
    } catch {
        // La ricerca del cliente non deve interrompere l'inserimento dell'ordine.
    }
}

async function aggiornaCacheClienteDopoInvio(ordine, rispostaOrdine) {
    const tipo = ordine.tipo;
    const telefono = normalizzaTelefonoCliente(
        tipo === "consegna" ? ordine.telefonoConsegna : ordine.telefonoRitiro
    );
    if (!telefono || !cacheClienti.has(telefono)) return;
    try {
        const precedente = await cacheClienti.get(telefono);
        const raggruppate = new Map();
        for (const riga of ordine.righe) {
            const extra = nomiExtra(riga.extra);
            const senza = Array.isArray(riga.senza) ? riga.senza : [];
            const note = Array.isArray(riga.note) ? riga.note : [];
            const chiave = JSON.stringify([
                riga.prodotto,
                [...extra].sort((a, b) => a.localeCompare(b, "it-IT")),
                [...senza].sort((a, b) => a.localeCompare(b, "it-IT")),
                [...note].sort((a, b) => a.localeCompare(b, "it-IT"))
            ]);
            const corrente = raggruppate.get(chiave);
            if (corrente) corrente.quantita++;
            else if (raggruppate.size < 30) {
                raggruppate.set(chiave, { prodotto: riga.prodotto, quantita: 1, extra, senza, note });
            }
        }
        cacheClienti.set(telefono, Promise.resolve({
            trovato: true,
            indirizzo: tipo === "consegna" ? ordine.indirizzoConsegna : precedente.indirizzo || "",
            nome: tipo === "ritiro" ? ordine.tavoloOCliente : precedente.nome || "",
            ultimoOrdine: {
                data: rispostaOrdine.dataOra,
                tipo,
                righe: [...raggruppate.values()]
            },
            ordiniTotali: precedente.trovato
                ? (Number.isSafeInteger(precedente.ordiniTotali) ? precedente.ordiniTotali : 0) + 1
                : 1
        }));
    } catch {
        cacheClienti.delete(telefono);
    }
}

function aggiornaRicercaClienteAbituale() {
    window.clearTimeout(timerRicercaCliente);
    for (const id of ["cliente-abituale-consegna", "cliente-abituale-ritiro"]) {
        const container = document.getElementById(id);
        container.hidden = true;
        container.replaceChildren();
    }
    tokenRicercaCliente++;
    const tipo = tipoOrdine.value;
    if (numeroModifica) return;
    if (!["consegna", "ritiro"].includes(tipo)) return;
    const input = document.getElementById(tipo === "consegna" ? "telefono-consegna" : "telefono-ritiro");
    const numero = normalizzaTelefonoCliente(input.value);
    if (!numero || !clientiAbituali.visibile(numero, true)) return;
    const token = tokenRicercaCliente;
    timerRicercaCliente = window.setTimeout(() => cercaClienteAbituale(tipo, numero, token), 400);
}

function ripetiUltimoOrdine(ultimoOrdine) {
    const risultato = preparaRipetizione(
        ultimoOrdine,
        stato.menu,
        stato.extra,
        Math.max(0, 100 - stato.righe.length)
    );
    for (const voce of risultato.righe) {
        const aggiunta = aggiungiProdotti(stato.righe, stato.rigaAttiva, voce.prodotto);
        stato.righe = aggiunta.righe;
        stato.rigaAttiva = aggiunta.rigaAttiva;
        stato.righe[stato.righe.length - 1].extra = voce.extra;
        stato.righe[stato.righe.length - 1].senza = voce.senza;
        stato.righe[stato.righe.length - 1].note = voce.note;
    }
    renderRiepilogo();
    const messaggi = [];
    if (risultato.nonDisponibili.length) {
        messaggi.push(`Non disponibili: ${risultato.nonDisponibili.join(", ")}`);
    }
    if (risultato.limiteRaggiunto) messaggi.push("Limite di 100 prodotti raggiunto.");
    if (messaggi.length) mostraMessaggio(messaggi.join(" · "), "errore");
    else if (risultato.righe.length) mostraMessaggio("Ultimo ordine aggiunto al riepilogo.", "successo");
}

function mostraMessaggio(testo, classe) {
    messaggio.textContent = testo;
    messaggio.className = classe;
}
function oraLocale() {
    const adesso = new Date();
    return `${String(adesso.getHours()).padStart(2, "0")}:${String(adesso.getMinutes()).padStart(2, "0")}`;
}
function aggiornaSelettoreTipoOrdine() {
    selettoreTipoOrdine.querySelectorAll("[data-tipo-ordine]").forEach(bottone => {
        const selezionato = bottone.dataset.tipoOrdine === tipoOrdine.value;
        bottone.classList.toggle("selezionato", selezionato);
        bottone.setAttribute("aria-checked", String(selezionato));
        bottone.tabIndex = selezionato ? 0 : -1;
    });
}
function aggiornaSelettoreTavoli() {
    const selezione = gestioneTavoli.stato();
    if (selezione.tavolo && !Array.from(tavolo.options).some(opzione => opzione.value === selezione.tavolo)) {
        const opzione = document.createElement("option");
        opzione.value = selezione.tavolo;
        opzione.textContent = selezione.tavolo;
        tavolo.add(opzione);
    }
    if (tavolo.value !== selezione.tavolo) {
        impostaValoreControllo(tavolo, selezione.tavolo, "change");
    }
    tavoliGriglia.querySelectorAll("[data-tavolo]").forEach(bottone => {
        const selezionato = bottone.dataset.tavolo === tavolo.value;
        const numeroTavolo = numeroTavoloDaNome(bottone.dataset.tavolo);
        const occupazione = statoTavoliOccupati.ordini.get(numeroTavolo);
        const occupato = Boolean(occupazione);
        bottone.classList.toggle("selezionato", selezionato);
        bottone.classList.toggle("occupato", occupato);
        bottone.setAttribute("aria-pressed", String(selezionato));
        bottone.setAttribute("aria-label", occupato
            ? `${bottone.dataset.tavolo}, occupato`
            : bottone.dataset.tavolo);
        bottone.title = occupato ? `Occupato · ordine #${occupazione.ordine.numero}` : "";
    });
    const bottonePersonalizzato = tavoliGriglia.querySelector("[data-tavolo-personalizzato]");
    bottonePersonalizzato.textContent = selezione.numeroPersonalizzato || "+";
    bottonePersonalizzato.classList.toggle("selezionato", Boolean(selezione.numeroPersonalizzato));
    bottonePersonalizzato.setAttribute("aria-pressed", String(Boolean(selezione.numeroPersonalizzato)));
    tavoloPersonalizzato.hidden = !selezione.aperto;
    numeroTavoloPersonalizzato.value = selezione.numero;
    sezioneTavoli.classList.toggle("errore", Boolean(selezione.errore));
    if (selezione.errore) {
        mostraMessaggio(selezione.errore, "errore");
    } else if (messaggio.textContent === "Numero tavolo da 1 a 99" || messaggio.textContent === "Scegli il tavolo") {
        mostraMessaggio("", "");
    }
}
function dataOdiernaRoma() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}
async function aggiornaTavoliOccupati() {
    if (numeroModifica) return;
    const data = dataOdiernaRoma();
    const completa = !statoTavoliOccupati.caricato || statoTavoliOccupati.data !== data;
    const richiesta = ++statoTavoliOccupati.richiesta;
    const parametri = new URLSearchParams({ data, tipo: "tavolo" });
    if (!completa && Number.isSafeInteger(statoTavoliOccupati.versione)) {
        parametri.set("versione", String(statoTavoliOccupati.versione));
    }
    try {
        const risposta = await fetch(`/api/ordini?${parametri}`, { cache: "no-store" });
        if (richiesta !== statoTavoliOccupati.richiesta) return;
        const risultato = await risposta.json();
        if (!risposta.ok) throw new Error(risultato.errore || "Impossibile verificare i tavoli occupati.");
        if (risultato.invariato) return;
        if (!Array.isArray(risultato.ordini)) {
            throw new Error("La risposta degli ordini dei tavoli non e' valida.");
        }
        statoTavoliOccupati.ordini = calcolaTavoliOccupati(risultato.ordini);
        statoTavoliOccupati.versione = risultato.versione;
        statoTavoliOccupati.data = data;
        statoTavoliOccupati.caricato = true;
        aggiornaSelettoreTavoli();
        statoTavoliOccupatiElement.hidden = true;
        statoTavoliOccupatiElement.classList.remove("errore");
        statoTavoliOccupatiElement.textContent = "";
    } catch (errore) {
        if (richiesta !== statoTavoliOccupati.richiesta) return;
        statoTavoliOccupatiElement.textContent = errore.message;
        statoTavoliOccupatiElement.hidden = false;
        statoTavoliOccupatiElement.classList.add("errore");
    }
}
function configuraAggiornamentoTavoliOccupati() {
    if (statoTavoliOccupati.timer) clearInterval(statoTavoliOccupati.timer);
    statoTavoliOccupati.timer = null;
    if (!numeroModifica && document.visibilityState === "visible") {
        statoTavoliOccupati.timer = setInterval(() => void aggiornaTavoliOccupati(), 15000);
    }
}
function chiudiDialogoTavoloOccupato(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
}
function mostraDialogoTavoloOccupato(numeroTavolo, occupazione) {
    let dialog = document.getElementById("tavolo-occupato-dialog");
    if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "tavolo-occupato-dialog";
        dialog.className = "app-mappe-dialog tavolo-occupato-dialog";
        dialog.setAttribute("aria-labelledby", "tavolo-occupato-titolo");
        dialog.innerHTML = `
            <h2 id="tavolo-occupato-titolo"></h2>
            <p class="tavolo-occupato-dialog__multipli"></p>
            <div class="tavolo-occupato-dialog__azioni">
                <button type="button" data-azione-tavolo="modifica">Aggiungi all'ordine</button>
                <button type="button" data-azione-tavolo="nuovo">Nuovo ordine sullo stesso tavolo</button>
                <button type="button" data-azione-tavolo="annulla">Annulla</button>
            </div>
        `;
        dialog.querySelector('[data-azione-tavolo="modifica"]').addEventListener("click", () => {
            window.location.href = `/ordini.html?modifica=${encodeURIComponent(dialog.dataset.ordine)}&da=tavoli`;
        });
        dialog.querySelector('[data-azione-tavolo="nuovo"]').addEventListener("click", () => {
            const numero = dialog.dataset.tavolo;
            chiudiDialogoTavoloOccupato(dialog);
            gestioneTavoli.scegli(numero);
            aggiornaSelettoreTavoli();
        });
        dialog.querySelector('[data-azione-tavolo="annulla"]').addEventListener("click", () => {
            chiudiDialogoTavoloOccupato(dialog);
        });
        document.body.append(dialog);
    }
    const ordine = occupazione.ordine;
    const persone = Number(ordine.numeroPersone);
    const labelPersone = Number.isInteger(persone) && persone > 0
        ? `${persone} ${persone === 1 ? "persona" : "persone"}`
        : "persone non indicate";
    dialog.dataset.ordine = String(ordine.numero);
    dialog.dataset.tavolo = String(numeroTavolo);
    dialog.querySelector("#tavolo-occupato-titolo").textContent =
        `Tavolo ${numeroTavolo} è occupato (ordine #${ordine.numero}, ${labelPersone})`;
    dialog.querySelector(".tavolo-occupato-dialog__multipli").textContent =
        occupazione.numeroOrdini > 1
            ? `Ci sono ${occupazione.numeroOrdini} ordini aperti: viene proposto il più recente.`
            : "";
    dialog.querySelector('[data-azione-tavolo="modifica"]').textContent =
        `Aggiungi all'ordine #${ordine.numero}`;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}
function aggiornaSelettorePersone() {
    const valore = Number(numeroPersone.value);
    personeSelettore.querySelectorAll("[data-numero-persone]").forEach(bottone => {
        const selezionato = Number(bottone.dataset.numeroPersone) === valore && !personePersonalizzateAperte();
        bottone.classList.toggle("selezionato", selezionato);
        bottone.setAttribute("aria-pressed", String(selezionato));
    });
    const aggiunta = personeSelettore.querySelector("[data-persone-custom]");
    const customSelezionato = personePersonalizzateAperte() || (Number.isInteger(valore) && valore > 8);
    aggiunta.classList.toggle("selezionato", customSelezionato);
    aggiunta.setAttribute("aria-pressed", String(customSelezionato));
}
function personePersonalizzateAperte() {
    return !personePersonalizzate.classList.contains("visually-hidden");
}
function impostaPersonePersonalizzate(aperta) {
    personePersonalizzate.classList.toggle("visually-hidden", !aperta);
    numeroPersone.classList.toggle("visually-hidden", !aperta);
    numeroPersone.min = aperta ? "9" : "1";
}
function creaSelettoriOrdine() {
    for (let numero = 1; numero <= 15; numero++) {
        const bottone = document.createElement("button");
        const valore = nomeTavoloDaNumero(numero);
        bottone.type = "button";
        bottone.className = "opzione-tavolo";
        bottone.dataset.tavolo = valore;
        bottone.textContent = String(numero);
        bottone.setAttribute("aria-label", valore);
        bottone.setAttribute("aria-pressed", "false");
        bottone.addEventListener("click", () => {
            const occupazione = statoTavoliOccupati.ordini.get(numeroTavoloDaNome(valore));
            if (occupazione && !numeroModifica) {
                mostraDialogoTavoloOccupato(numero, occupazione);
                return;
            }
            gestioneTavoli.scegli(numero);
            aggiornaSelettoreTavoli();
        });
        tavoliGriglia.appendChild(bottone);
    }

    const bottoneTavoloPersonalizzato = document.createElement("button");
    bottoneTavoloPersonalizzato.type = "button";
    bottoneTavoloPersonalizzato.className = "opzione-tavolo";
    bottoneTavoloPersonalizzato.dataset.tavoloPersonalizzato = "";
    bottoneTavoloPersonalizzato.textContent = "+";
    bottoneTavoloPersonalizzato.setAttribute("aria-label", "Altro tavolo");
    bottoneTavoloPersonalizzato.setAttribute("aria-pressed", "false");
    bottoneTavoloPersonalizzato.addEventListener("click", () => {
        const selezione = gestioneTavoli.togglePersonalizzato();
        aggiornaSelettoreTavoli();
        if (selezione.aperto) numeroTavoloPersonalizzato.focus();
    });
    tavoliGriglia.appendChild(bottoneTavoloPersonalizzato);

    for (let persone = 1; persone <= 8; persone++) {
        const bottone = document.createElement("button");
        bottone.type = "button";
        bottone.className = "opzione-persone";
        bottone.dataset.numeroPersone = String(persone);
        bottone.textContent = String(persone);
        bottone.setAttribute("aria-pressed", "false");
        bottone.addEventListener("click", () => {
            impostaPersonePersonalizzate(false);
            impostaValoreControllo(numeroPersone, String(persone), "input");
        });
        personeSelettore.appendChild(bottone);
    }
    const bottonePersonePersonalizzate = document.createElement("button");
    bottonePersonePersonalizzate.type = "button";
    bottonePersonePersonalizzate.className = "opzione-persone";
    bottonePersonePersonalizzate.dataset.personeCustom = "";
    bottonePersonePersonalizzate.textContent = "+";
    bottonePersonePersonalizzate.setAttribute("aria-label", "Altre persone");
    bottonePersonePersonalizzate.setAttribute("aria-pressed", "false");
    bottonePersonePersonalizzate.addEventListener("click", () => {
        const aperta = !personePersonalizzateAperte();
        impostaPersonePersonalizzate(aperta);
        aggiornaSelettorePersone();
        if (personePersonalizzateAperte()) {
            if (Number(numeroPersone.value) < 9) impostaValoreControllo(numeroPersone, "", "input");
            numeroPersone.focus();
        }
    });
    personeSelettore.appendChild(bottonePersonePersonalizzate);

    selettoreTipoOrdine.querySelectorAll("[data-tipo-ordine]").forEach((bottone, indice, bottoni) => {
        bottone.addEventListener("click", () => {
            impostaValoreControllo(tipoOrdine, bottone.dataset.tipoOrdine, "change");
        });
        bottone.addEventListener("keydown", evento => {
            if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
            evento.preventDefault();
            const direzione = evento.key === "ArrowRight" ? 1 : -1;
            const prossimoIndice = (indice + direzione + bottoni.length) % bottoni.length;
            const prossimo = bottoni[prossimoIndice];
            prossimo.focus();
            impostaValoreControllo(tipoOrdine, prossimo.dataset.tipoOrdine, "change");
        });
    });
}
function datiIntestazioneCorrenti() {
    return {
        tavolo: tavolo.value,
        numeroPersone: numeroPersone.value,
        cognome: document.getElementById("cognome-banco").value,
        nome: document.getElementById("cliente-ritiro").value,
        telefono: tipoOrdine.value === "consegna" ? inputTelefonoConsegna.value : document.getElementById("telefono-ritiro").value,
        telefonoValido: tipoOrdine.value === "consegna" ? inputTelefonoConsegna.checkValidity() : document.getElementById("telefono-ritiro").checkValidity(),
        indirizzo: inputIndirizzoConsegna.value,
        orario: orario.value
    };
}
function apriIntestazione() {
    intestazione.classList.remove("visually-hidden");
    composerMain.classList.remove("intestazione-chiusa");
    intestazioneCompatta.hidden = true;
}
function chiudiIntestazione() {
    intestazioneCompattaTesto.textContent = riepilogoIntestazione(tipoOrdine.value, datiIntestazioneCorrenti());
    intestazione.classList.add("visually-hidden");
    composerMain.classList.add("intestazione-chiusa");
    intestazioneCompatta.hidden = false;
}
function aggiornaStatoIntestazione(motivo = "cambio") {
    const inputAttivo = document.activeElement?.matches("input, textarea, select") === true;
    if (deveChiudereIntestazione(tipoOrdine.value, datiIntestazioneCorrenti(), { inputAttivo, motivo })) {
        chiudiIntestazione();
    }
}
intestazione.addEventListener("focusout", () => {
    window.setTimeout(() => aggiornaStatoIntestazione("sfocatura"), 0);
});
function aggiornaPulsanteNote() {
    const anteprima = anteprimaNota(note.value);
    noteToggle.textContent = noteAperta ? "− Chiudi nota" : anteprima ? `Nota: ${anteprima}` : "+ Nota";
    noteToggle.setAttribute("aria-expanded", String(noteAperta));
    noteEditor.classList.toggle("visually-hidden", !noteAperta);
    noteRapide.querySelectorAll("[data-note-rapida]").forEach(bottone => {
        const selezionato = notaContiene(note.value, bottone.dataset.noteRapida);
        bottone.classList.toggle("selezionato", selezionato);
        bottone.setAttribute("aria-pressed", String(selezionato));
    });
}
function ripristinaIntestazioneComanda() {
    apriIntestazione();
    noteAperta = false;
    note.value = "";
    aggiornaPulsanteNote();
    impostaPersonePersonalizzate(false);
    gestioneTavoli.reset();
    aggiornaSelettoreTavoli();
    impostaValoreControllo(numeroPersone, "", "input");
    sezioneTavoli.classList.remove("errore");
    sezionePersone.classList.remove("errore");
}
function aggiornaBottoneCostoConsegna() {
    const attivo = costoConsegna === 2;
    bottoneCostoConsegna.setAttribute("aria-pressed", String(attivo));
    bottoneCostoConsegna.textContent = attivo ? "Rimuovi costo consegna (2,00 €)" : "Aggiungi costo consegna (+2,00 €)";
}
function aggiornaTipoOrdine() {
    const consegna = tipoOrdine.value === "consegna";
    const ritiro = tipoOrdine.value === "ritiro";
    const banco = tipoOrdine.value === "banco";
    const tavolo = tipoOrdine.value === "tavolo";
    campoTavolo.hidden = !tavolo;
    campoRitiro.hidden = !ritiro;
    document.getElementById("campo-banco").hidden = !banco;
    campiConsegna.hidden = !consegna;
    campoOrario.hidden = tavolo;
    campoPagamentoRitiro.hidden = !ritiro;
    campoPagamentoConsegna.hidden = !consegna;
    orario.required = !tavolo;
    document.getElementById("tavolo").required = tavolo;
    numeroPersone.required = tavolo;
    document.getElementById("cliente-ritiro").required = ritiro;
    document.getElementById("telefono-ritiro").required = ritiro;
    document.getElementById("cognome-banco").required = banco;
    for (const id of ["indirizzo-consegna", "telefono-consegna"]) {
        document.getElementById(id).required = consegna;
    }
    aggiornaSelettoreTipoOrdine();
    aggiornaSelettoreTavoli();
    aggiornaSelettorePersone();
    aggiornaBottoneCostoConsegna();
    noteRapide.querySelectorAll("[data-note-rapida-consegna]").forEach(bottone => {
        bottone.hidden = !consegna;
    });
}
function nomiExtra(extra) {
    return (extra || []).map(elemento => (typeof elemento === "string" ? elemento : elemento.nome));
}
function prezzoRiga(riga) {
    return (
        Number(riga.prezzo || 0) +
        nomiExtra(riga.extra).reduce(
            (somma, nome) => somma + Number(stato.extra.find(extra => extra.nome === nome)?.prezzo || 0),
            0
        )
    );
}
function totaleOrdine() {
    return stato.righe.reduce((totale, riga) => totale + prezzoRiga(riga), 0)
        + costoConsegna
        + (copertoCorrente()?.totale || 0);
}
function copertoCorrente() {
    const persone = Number(numeroPersone.value);
    if (numeroModifica
            && tipoOrdine.value === tipoOrdineOriginale
            && persone === numeroPersoneOriginale
            && Number(copertoOrdine?.prezzoUnitario) > 0) {
        return calcolaCoperto(tipoOrdine.value, persone, copertoOrdine.prezzoUnitario);
    }
    return calcolaCoperto(
        tipoOrdine.value,
        persone,
        prodottoCoperto?.disponibile === false || prodottoCoperto?.archiviato === true
            ? 0
            : prodottoCoperto?.prezzo
    );
}
function testoCoperto(coperto) {
    return `Coperto ${coperto.persone} × ${euro.format(coperto.prezzoUnitario)} = ${euro.format(coperto.totale)}`;
}
function extraSelezionato(extra, riga) {
    return riga?.extra.some(elemento =>
        (elemento.id || elemento.nome) === (extra.id || extra.nome)
    ) || false;
}
function renderGrigliaExtra() {
    const paginaCorrente = extraLista.clientWidth
        ? Math.round(extraLista.scrollLeft / extraLista.clientWidth)
        : 0;
    const rigaAttiva = stato.righe[stato.rigaAttiva];
    const ingredienti = Array.isArray(rigaAttiva?.ingredienti) ? rigaAttiva.ingredienti : [];
    const supportaNoteRiga = ingredienti.length > 0 || rigaAttiva?.ammetteExtra === true;
    sezioneExtra.hidden = !stato.extra.length && !ingredienti.length && !supportaNoteRiga;
    const nomeProdotto = rigaAttiva?.prodotto || "Seleziona un prodotto";
    const nomeComponibile = nomeProdotto.replace(/\s+da comporre$/i, "");
    extraProdotto.textContent = rigaAttiva?.componibile
        ? `Componi: ${nomeComponibile} — scegli gli ingredienti`
        : nomeProdotto;
    const conteggioSenza = Array.isArray(rigaAttiva?.senza) ? rigaAttiva.senza.length : 0;
    const conteggioExtra = Array.isArray(rigaAttiva?.extra) ? rigaAttiva.extra.length : 0;
    const conteggioNote = Array.isArray(rigaAttiva?.note) ? rigaAttiva.note.length : 0;
    extraSenzaConteggio.textContent = `Senza (${conteggioSenza})`;
    extraSenzaConteggio.hidden = rigaAttiva?.componibile === true;
    extraConteggio.textContent = `Extra (${conteggioExtra})`;
    noteRigaConteggio.textContent = `Note (${conteggioNote})`;
    extraFreccia.textContent = extraAperto ? "▴" : "▾";
    extraIntestazione.setAttribute(
        "aria-label",
        `${extraProdotto.textContent}${rigaAttiva?.componibile ? "" : ` · Senza (${conteggioSenza})`} · Extra (${conteggioExtra}) · Note (${conteggioNote})`
    );
    extraIntestazione.setAttribute("aria-expanded", String(extraAperto));
    sezioneExtra.classList.toggle("extra-aperto", extraAperto);
    extraDettagli.hidden = !extraAperto || sezioneExtra.hidden;
    extraRicerca.hidden = !stato.extra.length;
    extraLista.replaceChildren();
    const extraVisibili = filtraExtra(stato.extra, extraRicerca.value);
    extraRicercaVuota.hidden = !extraRicerca.value.trim() || extraVisibili.length > 0;
    extraLista.hidden = !extraVisibili.length;
    const colonne = mediaGrigliaExtra.matches ? 3 : 4;
    const righe = mediaGrigliaExtra.matches ? 4 : 3;
    const elementiPerPagina = colonne * righe;
    for (let inizio = 0; inizio < extraVisibili.length; inizio += elementiPerPagina) {
        const pagina = document.createElement("div");
        pagina.className = "pagina-extra";
        extraVisibili.slice(inizio, inizio + elementiPerPagina).forEach(extra => {
            const bottone = document.createElement("button");
            const rigaAttiva = stato.righe[stato.rigaAttiva];
            bottone.type = "button";
            bottone.className = "extra-card";
            bottone.classList.toggle("selezionato", extraSelezionato(extra, rigaAttiva));
            bottone.disabled = !rigaAttiva || rigaAttiva.ammetteExtra !== true || extra.disponibile === false;
            bottone.setAttribute("aria-pressed", String(extraSelezionato(extra, rigaAttiva)));
            bottone.innerHTML = `<strong>${escapeHtml(extra.nome)}</strong><span>${escapeHtml(euro.format(Number(extra.prezzo)))}</span>${extra.disponibile === false ? '<small>Esaurito</small>' : ""}`;
            bottone.addEventListener("click", () => {
                if (bottone.disabled) return;
                const risultato = toggleExtra(stato.righe, stato.rigaAttiva, extra);
                stato.righe = risultato.righe;
                stato.rigaAttiva = risultato.rigaAttiva;
                renderRiepilogo();
            });
            pagina.appendChild(bottone);
        });
        extraLista.appendChild(pagina);
    }
    if (extraLista.children.length) {
        extraLista.scrollLeft = Math.min(paginaCorrente, extraLista.children.length - 1) * extraLista.clientWidth;
    }
    renderSenzaIngredienti(rigaAttiva, ingredienti);
    renderNoteRiga(rigaAttiva, supportaNoteRiga);
}
function aggiornaPosizionePannelloExtra() {
    const destinazione = mediaPannelloExtra.matches ? prodottiWrapper : sezioneExtra;
    if (extraDettagli.parentElement !== destinazione) destinazione.appendChild(extraDettagli);
}
function chiudiPannelloExtra() {
    if (!extraAperto) return;
    extraAperto = false;
    extraRicerca.value = "";
    renderRiepilogo();
}
function renderSenzaIngredienti(riga, ingredienti) {
    senzaIngredientiLista.replaceChildren();
    senzaIngredienti.hidden = !riga || riga.componibile === true || !ingredienti.length;
    if (!riga || !ingredienti.length) return;
    const selezionati = new Set((Array.isArray(riga.senza) ? riga.senza : [])
        .filter(ingrediente => typeof ingrediente === "string")
        .map(ingrediente => ingrediente.trim().toLocaleLowerCase("it-IT")));
    ingredienti.forEach(ingrediente => {
        if (typeof ingrediente !== "string") return;
        const bottone = document.createElement("button");
        const attivo = selezionati.has(ingrediente.trim().toLocaleLowerCase("it-IT"));
        bottone.type = "button";
        bottone.className = "senza-chip";
        bottone.textContent = ingrediente;
        bottone.classList.toggle("selezionato", attivo);
        bottone.setAttribute("aria-pressed", String(attivo));
        bottone.dataset.senzaIngrediente = ingrediente;
        senzaIngredientiLista.appendChild(bottone);
    });
}
function renderNoteRiga(riga, supportaNote) {
    noteRigaLista.replaceChildren();
    noteRiga.hidden = !riga || !supportaNote;
    if (!riga || !supportaNote) return;
    const selezionate = new Set(normalizzaNoteRiga(riga.note)
        .map(valore => valore.toLocaleLowerCase("it-IT")));
    NOTE_RIGA.forEach(valore => {
        const bottone = document.createElement("button");
        const attivo = selezionate.has(valore.toLocaleLowerCase("it-IT"));
        bottone.type = "button";
        bottone.className = "note-chip";
        bottone.textContent = valore;
        bottone.classList.toggle("selezionato", attivo);
        bottone.setAttribute("aria-pressed", String(attivo));
        bottone.dataset.notaRiga = valore;
        noteRigaLista.appendChild(bottone);
    });
}
function renderProdotti() {
    prodotti.innerHTML = "";
    prodotti.scrollTop = 0;
    prodotti.scrollLeft = 0;
    const disponibili = stato.menu
        .filter(prodotto => !isCoperto(prodotto) && prodotto.categoria === stato.categoria)
        .sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, "it"));
    const pagina = document.createElement("div");
    pagina.className = "pagina-prodotti";
    disponibili.forEach(prodotto => {
        const bottone = creaBottoneProdotto(prodotto);
        bottone.addEventListener("click", () => aggiungiProdotto(prodotto, "griglia"));
        pagina.appendChild(bottone);
    });
    prodotti.appendChild(pagina);
    aggiornaRighePaginaProdotti(prodotti, pagina);
    aggiornaIndicatoreProdotti(prodotti, prodottiWrapper, prodottiIndicatore);
}
function aggiornaRighePaginaProdotti(griglia, pagina = griglia.querySelector(".pagina-prodotti")) {
    if (!pagina) return;
    if (!window.matchMedia("(min-width: 1440px)").matches) {
        pagina.style.removeProperty("--prodotti-righe");
        pagina.querySelectorAll(".ingredienti-wrapper").forEach(wrapper => {
            wrapper.hidden = false;
            wrapper.style.removeProperty("--ingredienti-righe");
            wrapper.style.removeProperty("--ingredienti-altezza");
        });
        return;
    }
    const altezzaDisponibile = griglia.clientHeight;
    if (altezzaDisponibile <= 0) return;
    const spazioRighe = Number.parseFloat(window.getComputedStyle(pagina).rowGap) || 8;
    const righe = Math.max(3, Math.floor(
        (altezzaDisponibile + spazioRighe) / (118 + spazioRighe)
    ));
    pagina.style.setProperty("--prodotti-righe", String(righe));
    aggiornaRigheIngredienti(pagina);
}
function aggiornaRigheIngredienti(pagina) {
    pagina.querySelectorAll(".ingredienti-wrapper").forEach(wrapper => {
        const bottone = wrapper.closest(".prodotto-btn");
        const ingredienti = wrapper.querySelector(".ingredienti");
        const intestazione = bottone?.querySelector(".prodotto-btn__meta");
        if (!bottone || !ingredienti || !intestazione) return;

        const stileBottone = window.getComputedStyle(bottone);
        const stileWrapper = window.getComputedStyle(wrapper);
        const altezzaRiga = Number.parseFloat(window.getComputedStyle(ingredienti).lineHeight);
        if (!Number.isFinite(altezzaRiga) || altezzaRiga <= 0) return;

        const esaurito = bottone.querySelector(".prodotto-esaurito");
        const stileEsaurito = esaurito ? window.getComputedStyle(esaurito) : null;
        const altezzaDisponibile = bottone.clientHeight
            - (Number.parseFloat(stileBottone.paddingTop) || 0)
            - (Number.parseFloat(stileBottone.paddingBottom) || 0)
            - intestazione.offsetHeight
            - (esaurito?.offsetHeight || 0)
            - (Number.parseFloat(stileEsaurito?.marginTop) || 0)
            - (Number.parseFloat(stileWrapper.marginTop) || 0);
        const righe = Math.max(0, Math.min(4, Math.floor(Math.max(0, altezzaDisponibile) / altezzaRiga)));
        wrapper.hidden = righe === 0;
        wrapper.style.setProperty("--ingredienti-righe", String(righe));
        wrapper.style.setProperty("--ingredienti-altezza", `${righe * altezzaRiga}px`);
    });
}
function creaBottoneProdotto(prodotto) {
    const bottone = document.createElement("button");
    bottone.className = "prodotto-btn";
    bottone.type = "button";
    bottone.dataset.prodotto = prodotto.nome;
    bottone.disabled = prodotto.disponibile === false;
    bottone.classList.toggle("esaurito", prodotto.disponibile === false);

    const intestazioneProdotto = document.createElement("span");
    intestazioneProdotto.className = "prodotto-btn__meta";
    const nome = document.createElement("strong");
    nome.className = "prodotto-nome";
    nome.textContent = prodotto.nome;
    const prezzo = document.createElement("span");
    prezzo.className = "prezzo-prodotto";
    prezzo.textContent = euro.format(Number(prodotto.prezzo));
    intestazioneProdotto.append(nome, prezzo);
    bottone.append(intestazioneProdotto);

    if (prodotto.disponibile === false) {
        const esaurito = document.createElement("span");
        esaurito.className = "prodotto-esaurito";
        esaurito.textContent = "Esaurito";
        bottone.append(esaurito);
    }

    const descrizioneIngredienti = Array.isArray(prodotto.ingredienti)
        ? prodotto.ingredienti.join(", ")
        : "";
    if (descrizioneIngredienti) {
        const wrapperIngredienti = document.createElement("span");
        wrapperIngredienti.className = "ingredienti-wrapper";
        const ingredienti = document.createElement("span");
        ingredienti.className = "ingredienti";
        ingredienti.textContent = descrizioneIngredienti;
        ingredienti.title = descrizioneIngredienti;
        wrapperIngredienti.append(ingredienti);
        bottone.append(wrapperIngredienti);
    }

    aggiornaBadgeQuantitaProdotto(bottone);
    return bottone;
}
function aggiornaIndicatoreProdotti(griglia, wrapper, indicatore) {
    const larghezza = griglia.clientWidth;
    const scorrimentoMassimo = griglia.scrollWidth - larghezza;
    const ciSonoAltriProdotti = larghezza > 0 && scorrimentoMassimo > 2;
    wrapper.classList.toggle("ha-altri-prodotti", ciSonoAltriProdotti);
    indicatore.hidden = !ciSonoAltriProdotti;
    if (!ciSonoAltriProdotti) return;

    const pagine = Math.ceil(griglia.scrollWidth / larghezza);
    const posizione = scorrimentoMassimo > 0
        ? Math.round((griglia.scrollLeft / scorrimentoMassimo) * (pagine - 1))
        : 0;
    indicatore.textContent = `${posizione + 1}/${pagine}`;
    indicatore.setAttribute("aria-label", `Pagina ${posizione + 1} di ${pagine}`);
}
function aggiornaBadgeQuantitaProdotto(bottone) {
    const quantita = quantitaProdotto(stato.righe, bottone.dataset.prodotto);
    let badge = bottone.querySelector(".prodotto-quantita");
    const intestazioneProdotto = bottone.querySelector(".prodotto-btn__meta");
    bottone.classList.toggle("ha-quantita", quantita > 0);
    if (quantita === 0) {
        badge?.remove();
        return;
    }
    if (!badge) {
        badge = document.createElement("span");
        badge.className = "prodotto-quantita";
        intestazioneProdotto.prepend(badge);
    }
    badge.textContent = String(quantita);
    badge.setAttribute("aria-label", `${quantita} già nell'ordine`);
}
function aggiornaBadgeQuantitaProdotti() {
    prodotti.querySelectorAll(".prodotto-btn").forEach(aggiornaBadgeQuantitaProdotto);
}
function leggiIngredientiVisibili() {
    try {
        return window.localStorage.getItem(chiaveIngredientiVisibili) !== "false";
    } catch {
        return true;
    }
}
function aggiornaToggleIngredienti(salva = true) {
    document.documentElement.classList.toggle("ingredienti-nascosti", !ingredientiVisibili);
    bottoneIngredienti.setAttribute("aria-pressed", String(ingredientiVisibili));
    bottoneIngredienti.setAttribute(
        "aria-label",
        ingredientiVisibili ? "Nascondi ingredienti" : "Mostra ingredienti"
    );
    bottoneIngredienti.title = ingredientiVisibili ? "Ingredienti visibili" : "Ingredienti nascosti";
    if (!salva) return;
    try {
        window.localStorage.setItem(chiaveIngredientiVisibili, String(ingredientiVisibili));
    } catch {
        return;
    }
}
aggiornaToggleIngredienti(false);
// Unico punto di aggiunta al conto: usato dalle tab delle categorie e dalla ricerca.
function aggiungiProdotto(prodotto, origine = "ricerca") {
    if (prodotto.disponibile === false) return false;
    const limite = controllaLimiteRighe(stato.righe.length, 1);
    if (!limite.consentito) {
        mostraMessaggio(`Massimo 100 prodotti per comanda: puoi aggiungerne ancora ${limite.disponibili}`, "errore");
        return false;
    }
    extraRicerca.value = "";
    extraAperto = prodotto.componibile === true;
    const primoProdotto = stato.righe.length === 0;
    const risultato = aggiungiProdotti(stato.righe, stato.rigaAttiva, prodotto);
    stato.righe = risultato.righe;
    stato.rigaAttiva = risultato.rigaAttiva;
    if (origine === "griglia") aggiornaStatoIntestazione("prodotto");
    else if (primoProdotto) aggiornaStatoIntestazione("aggiunta");
    renderRiepilogo();
    return true;
}
function aggiornaDisplayMoltiplicatore() {
    ricercaMoltiplicatore.textContent = testoMoltiplicatore(statoMoltiplicatore);
    ricercaMoltiplicatore.classList.toggle("armato", statoMoltiplicatore.armato);
}
function renderRisultatiRicerca() {
    const testo = ricercaInput.value;
    const trovati = filtraProdotti(stato.menu.filter(prodotto => !isCoperto(prodotto)), testo);
    ricercaRisultati.replaceChildren();
    ricercaRisultati.scrollLeft = 0;
    ricercaMessaggio.textContent = "";
    if (!testo.trim()) {
        aggiornaIndicatoreProdotti(ricercaRisultati, ricercaWrapper, ricercaPagine);
        return;
    }
    if (!trovati.length) {
        const vuoto = document.createElement("p");
        vuoto.className = "ricerca-vuota";
        vuoto.textContent = "Nessun prodotto trovato";
        ricercaRisultati.appendChild(vuoto);
        aggiornaIndicatoreProdotti(ricercaRisultati, ricercaWrapper, ricercaPagine);
        return;
    }
    const pagina = document.createElement("div");
    pagina.className = "pagina-prodotti";
    trovati.forEach(prodotto => {
        const bottone = creaBottoneProdotto(prodotto);
        bottone.classList.add("ricerca-risultato");
        const categoria = document.createElement("span");
        categoria.className = "ricerca-categoria";
        categoria.textContent = etichetteCategorie[prodotto.categoria] || prodotto.categoriaNome || prodotto.categoria;
        const ingredienti = bottone.querySelector(".ingredienti-wrapper");
        if (ingredienti) ingredienti.before(categoria);
        else bottone.append(categoria);
        bottone.addEventListener("click", () => {
            const quantita = quantitaDaApplicare(statoMoltiplicatore);
            const moltiplicatoreArmato = statoMoltiplicatore.armato;
            const limite = controllaLimiteRighe(stato.righe.length, quantita);
            if (!limite.consentito) {
                ricercaMessaggio.textContent = `Massimo 100 prodotti per comanda: puoi aggiungerne ancora ${limite.disponibili}`;
                return;
            }
            for (let indice = 0; indice < quantita; indice++) {
                aggiungiProdotto(prodotto);
            }
            statoMoltiplicatore = creaStatoMoltiplicatore();
            aggiornaDisplayMoltiplicatore();
            chiudiRicerca();
            const descrizioneAggiunta = moltiplicatoreArmato
                ? `Aggiunti ${quantita} × ${prodotto.nome}`
                : `Aggiunto: ${prodotto.nome}`;
            mostraMessaggio(descrizioneAggiunta, "successo");
        });
        pagina.appendChild(bottone);
    });
    ricercaRisultati.appendChild(pagina);
    aggiornaRighePaginaProdotti(ricercaRisultati, pagina);
    aggiornaIndicatoreProdotti(ricercaRisultati, ricercaWrapper, ricercaPagine);
}
function gestisciTastoMoltiplicatore(evento) {
    const tasto = evento.target.closest("[data-moltiplicatore]");
    if (!tasto) return;
    statoMoltiplicatore = premiTastoMoltiplicatore(statoMoltiplicatore, tasto.dataset.moltiplicatore);
    aggiornaDisplayMoltiplicatore();
    ricercaMessaggio.textContent = "";
}
function azzeraMoltiplicatore() {
    statoMoltiplicatore = creaStatoMoltiplicatore();
    aggiornaDisplayMoltiplicatore();
}
function apriRicerca() {
    ricercaInput.value = "";
    azzeraMoltiplicatore();
    ricercaMessaggio.textContent = "";
    renderRisultatiRicerca();
    ricercaModale.hidden = false;
    bottoneRicerca.setAttribute("aria-expanded", "true");
    document.body.classList.add("modale-aperta");
    // La pagina sotto diventa non interattiva: Tab resta dentro il pannello.
    paginaPrincipale.inert = true;
    // Focus sincrono nel gesto dell'utente: necessario perché iPad/Android aprano la tastiera.
    ricercaInput.focus();
}
function chiudiRicerca() {
    if (ricercaModale.hidden) return;
    ricercaModale.hidden = true;
    bottoneRicerca.setAttribute("aria-expanded", "false");
    document.body.classList.remove("modale-aperta");
    paginaPrincipale.inert = false;
    bottoneRicerca.focus({ preventScroll: true });
}
function renderRiepilogo() {
    renderRigheRiepilogo(riepilogo);
    renderRigheRiepilogo(riepilogoSheetLista);
    aggiornaBadgeQuantitaProdotti();
    renderGrigliaExtra();
    const testoTotale = `Totale: ${euro.format(totaleOrdine())}`;
    document.getElementById("riepilogo-totale").textContent = testoTotale;
    barraTotale.textContent = testoTotale;
    document.getElementById("riepilogo-sheet-totale").textContent = testoTotale;
    aggiornaConteggioProdotti(riepilogoConteggio, stato.righe.length);
    aggiornaConteggioProdotti(barraConteggio, stato.righe.length);
    aggiornaConteggioProdotti(
        document.getElementById("riepilogo-sheet-conteggio"),
        stato.righe.length
    );
    invia.disabled = !stato.righe.length
        || (numeroModifica && !puoSalvareModifica(payloadOriginaleModifica));
    invia.textContent = stato.righe.length
        ? numeroModifica ? "Rivedi e salva" : "Rivedi e invia"
        : "Aggiungi prodotti";
    const inviaSheet = document.getElementById("riepilogo-sheet-invia");
    inviaSheet.disabled = invia.disabled;
    inviaSheet.textContent = invia.textContent;
    aggiornaStatoCaricamentoModifica();
}
function aggiornaStatoCaricamentoModifica() {
    if (!numeroModifica) return;
    const ordineNonCaricato = !puoSalvareModifica(payloadOriginaleModifica);
    composerMain.inert = ordineNonCaricato;
    composerMain.setAttribute("aria-busy", String(ordineNonCaricato));
    invia.disabled = ordineNonCaricato || !stato.righe.length;
    document.getElementById("riepilogo-sheet-invia").disabled = invia.disabled;
    document.getElementById("conferma-invio").disabled = ordineNonCaricato;
    if (ordineNonCaricato) {
        riepilogoSheetApri.setAttribute("aria-disabled", "true");
        riepilogoSheetApri.removeAttribute("tabindex");
    } else {
        riepilogoSheetApri.removeAttribute("aria-disabled");
        aggiornaAccessibilitaBarraSheet();
    }
    riprovaModifica.hidden = !erroreCaricamentoModifica;
    riprovaModifica.disabled = caricamentoModificaInCorso;
}
function renderRigheRiepilogo(contenitore) {
    contenitore.replaceChildren();
    raggruppaRigheConferma(stato.righe).forEach(({ riga, quantita, indici }) => {
        const indiceUltimaRiga = indici[indici.length - 1];
        const voce = document.createElement("div");
        voce.className = "riepilogo-item";
        voce.classList.toggle("riga-attiva", indici.includes(stato.rigaAttiva));
        voce.dataset.rigaAttiva = indiceUltimaRiga;
        const extra = riga.extra.length
            ? `<small class="riepilogo-extra">+ ${escapeHtml(nomiExtra(riga.extra).join(", "))}</small>`
            : "";
        const senza = Array.isArray(riga.senza) && riga.senza.length
            ? `<small class="riepilogo-senza">senza ${escapeHtml(riga.senza.join(", "))}</small>`
            : "";
        const noteRiga = Array.isArray(riga.note) && riga.note.length
            ? `<small class="riepilogo-note-riga">${escapeHtml(riga.note.map(valore => valore.toLocaleLowerCase("it-IT")).join(", "))}</small>`
            : "";
        const nonDisponibile = riga.nonDisponibile
            ? '<small class="riepilogo-non-disponibile">Non più disponibile</small>'
            : "";
        const nomeRiga = `<button class="seleziona-riga" type="button" data-riga-attiva="${escapeHtml(indiceUltimaRiga)}">${escapeHtml(riga.prodotto)}</button>`;
        const totaleGruppo = euro.format(prezzoRiga(riga) * quantita);
        voce.innerHTML = `<span class="riepilogo-quantita">${quantita}×</span><div class="riepilogo-item__descrizione">${nomeRiga}${nonDisponibile}${senza}${extra}${noteRiga}</div><strong class="riepilogo-prezzo">${totaleGruppo}</strong><button class="rimuovi" type="button" data-indice="${escapeHtml(indiceUltimaRiga)}" aria-label="Togli uno">−</button>`;
        contenitore.appendChild(voce);
    });
    if (!stato.righe.length) contenitore.innerHTML = "<p>Nessun prodotto selezionato</p>";
    const coperto = copertoCorrente();
    if (coperto) {
        const voceCoperto = document.createElement("div");
        voceCoperto.className = "riepilogo-coperto";
        voceCoperto.textContent = testoCoperto(coperto);
        contenitore.appendChild(voceCoperto);
    }
}
function rimuoviRigaRiepilogo(evento) {
    const pulsante = evento.target.closest(".rimuovi");
    if (pulsante && evento.currentTarget.contains(pulsante)) {
        const risultato = rimuoviProdotto(stato.righe, stato.rigaAttiva, Number(pulsante.dataset.indice));
        stato.righe = risultato.righe;
        stato.rigaAttiva = risultato.rigaAttiva;
        renderRiepilogo();
        return;
    }
    const riga = evento.target.closest(".riepilogo-item[data-riga-attiva]");
    if (!riga || !evento.currentTarget.contains(riga)) return;
    const risultato = impostaRigaAttiva(stato.righe, Number(riga.dataset.rigaAttiva));
    stato.rigaAttiva = risultato.rigaAttiva;
    extraRicerca.value = "";
    extraAperto = true;
    renderRiepilogo();
    if (evento.currentTarget === riepilogoSheetLista && riepilogoSheetAperto) {
        chiudiRiepilogoSheet(false);
        requestAnimationFrame(() => sezioneExtra.scrollIntoView({ block: "nearest" }));
    }
}
function riepilogoSheetDisponibile() {
    return mediaRiepilogoSheet.matches;
}
function impostaStatoSheet(aperto) {
    const prossimoStato = Boolean(aperto) && riepilogoSheetDisponibile();
    window.clearTimeout(timerNascondiRiepilogoSheet);
    timerNascondiRiepilogoSheet = 0;
    if (prossimoStato) {
        if (!riepilogoSheetAperto) {
            overflowRadicePrecedente = document.documentElement.style.overflow;
        }
        riepilogoSheetAperto = true;
        riepilogoSheetBackdrop.hidden = false;
        document.documentElement.style.overflow = "hidden";
        riepilogoSheetApri.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => {
            if (riepilogoSheetAperto) riepilogoSheetBackdrop.classList.add("is-open");
        });
        return;
    }
    riepilogoSheetAperto = false;
    riepilogoSheetBackdrop.classList.remove("is-open");
    riepilogoSheetApri.setAttribute("aria-expanded", "false");
    if (overflowRadicePrecedente !== null) {
        document.documentElement.style.overflow = overflowRadicePrecedente;
        overflowRadicePrecedente = null;
    }
    if (riepilogoSheetBackdrop.hidden) return;
    const durata = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280;
    timerNascondiRiepilogoSheet = window.setTimeout(() => {
        timerNascondiRiepilogoSheet = 0;
        if (!riepilogoSheetAperto) riepilogoSheetBackdrop.hidden = true;
    }, durata);
}
function apriRiepilogoSheet() {
    if (numeroModifica && !puoSalvareModifica(payloadOriginaleModifica)) return;
    if (!riepilogoSheetDisponibile()) return;
    impostaStatoSheet(true);
    riepilogoSheetChiudi.focus({ preventScroll: true });
}
function aggiornaAccessibilitaBarraSheet() {
    if (riepilogoSheetDisponibile()) {
        riepilogoSheetApri.setAttribute("role", "button");
        riepilogoSheetApri.setAttribute("tabindex", "0");
        riepilogoSheetApri.setAttribute("aria-controls", "riepilogo-sheet");
        riepilogoSheetApri.setAttribute("aria-expanded", String(riepilogoSheetAperto));
        return;
    }
    riepilogoSheetApri.removeAttribute("role");
    riepilogoSheetApri.removeAttribute("tabindex");
    riepilogoSheetApri.removeAttribute("aria-controls");
    riepilogoSheetApri.removeAttribute("aria-expanded");
}
function chiudiRiepilogoSheet(ripristinaFocus = true) {
    if (!riepilogoSheetAperto) return;
    impostaStatoSheet(false);
    if (ripristinaFocus && riepilogoSheetDisponibile()) riepilogoSheetApri.focus({ preventScroll: true });
}
function avviaTrascinamentoRiepilogo(evento) {
    if (numeroModifica && !puoSalvareModifica(payloadOriginaleModifica)) return;
    if (!riepilogoSheetDisponibile() || evento.button !== 0 || evento.target.closest("#btn-invia")) return;
    trascinamentoRiepilogo = {
        pointerId: evento.pointerId,
        startY: evento.clientY,
        lastY: evento.clientY,
        lastTime: performance.now(),
        velocity: 0
    };
    barraConto.setPointerCapture(evento.pointerId);
}
function aggiornaTrascinamentoRiepilogo(evento) {
    if (!trascinamentoRiepilogo || evento.pointerId !== trascinamentoRiepilogo.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - trascinamentoRiepilogo.lastTime);
    trascinamentoRiepilogo.velocity = (evento.clientY - trascinamentoRiepilogo.lastY) / elapsed;
    trascinamentoRiepilogo.lastY = evento.clientY;
    trascinamentoRiepilogo.lastTime = now;
}
function annullaTrascinamentoRiepilogo(evento) {
    if (trascinamentoRiepilogo?.pointerId === evento.pointerId) trascinamentoRiepilogo = null;
}
function terminaTrascinamentoRiepilogo(evento) {
    if (!trascinamentoRiepilogo || evento.pointerId !== trascinamentoRiepilogo.pointerId) return;
    const trascinamento = trascinamentoRiepilogo;
    trascinamentoRiepilogo = null;
    if (evento.type !== "pointerup") return;
    const distanza = evento.clientY - trascinamento.startY;
    const elapsed = Math.max(1, performance.now() - trascinamento.lastTime);
    const velocitaFinale =
        evento.clientY === trascinamento.lastY
            ? trascinamento.velocity
            : (evento.clientY - trascinamento.lastY) / elapsed;
    if (distanza < -30 || velocitaFinale < -0.3 || Math.abs(distanza) < 8) apriRiepilogoSheet();
}
function attivaRiepilogoSheetDaTastiera(evento) {
    if (!riepilogoSheetDisponibile()) return;
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    apriRiepilogoSheet();
}
function avviaTrascinamentoChiusuraSheet(evento) {
    if (evento.button !== 0 || evento.target.closest("button")) return;
    trascinamentoChiusuraSheet = {
        pointerId: evento.pointerId,
        startY: evento.clientY,
        lastY: evento.clientY,
        lastTime: performance.now(),
        velocity: 0
    };
    riepilogoSheetHeader.setPointerCapture(evento.pointerId);
}
function aggiornaTrascinamentoChiusuraSheet(evento) {
    if (!trascinamentoChiusuraSheet || evento.pointerId !== trascinamentoChiusuraSheet.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - trascinamentoChiusuraSheet.lastTime);
    trascinamentoChiusuraSheet.velocity = (evento.clientY - trascinamentoChiusuraSheet.lastY) / elapsed;
    trascinamentoChiusuraSheet.lastY = evento.clientY;
    trascinamentoChiusuraSheet.lastTime = now;
}
function annullaTrascinamentoChiusuraSheet(evento) {
    if (trascinamentoChiusuraSheet?.pointerId === evento.pointerId) trascinamentoChiusuraSheet = null;
}
function terminaTrascinamentoChiusuraSheet(evento) {
    if (!trascinamentoChiusuraSheet || evento.pointerId !== trascinamentoChiusuraSheet.pointerId) return;
    const trascinamento = trascinamentoChiusuraSheet;
    trascinamentoChiusuraSheet = null;
    if (evento.type !== "pointerup") return;
    const distanza = evento.clientY - trascinamento.startY;
    const elapsed = Math.max(1, performance.now() - trascinamento.lastTime);
    const velocitaFinale =
        evento.clientY === trascinamento.lastY
            ? trascinamento.velocity
            : (evento.clientY - trascinamento.lastY) / elapsed;
    if (distanza > 30 || velocitaFinale > 0.3) chiudiRiepilogoSheet();
}
function intrappolaFocusNelRiepilogoSheet(evento) {
    if (!riepilogoSheetAperto || evento.key !== "Tab") return;
    const elementi = [...riepilogoSheet.querySelectorAll("button:not(:disabled), [tabindex='0']")];
    if (!elementi.length) {
        evento.preventDefault();
        riepilogoSheetChiudi.focus({ preventScroll: true });
        return;
    }
    const primo = elementi[0];
    const ultimo = elementi[elementi.length - 1];
    if (
        evento.shiftKey &&
        document.activeElement === primo
    ) {
        evento.preventDefault();
        ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primo.focus();
    }
}
function segnalaCampoObbligatorio(elemento, testo) {
    apriIntestazione();
    mostraMessaggio(testo, "errore");
    elemento.scrollIntoView({ block: "center", behavior: "smooth" });
    elemento.focus();
    return false;
}
function validaDatiOrdine() {
    const dati = datiIntestazioneCorrenti();
    const campoMancante = datiObbligatoriMancanti(tipoOrdine.value, dati);
    if (tipoOrdine.value === "tavolo") {
        const selezione = gestioneTavoli.stato();
        if (selezione.errore || (selezione.aperto && !selezione.tavolo)) {
            if (!selezione.aperto) {
                gestioneTavoli.togglePersonalizzato();
                aggiornaSelettoreTavoli();
            }
            sezioneTavoli.classList.add("errore");
            mostraMessaggio("Numero tavolo da 1 a 99", "errore");
            numeroTavoloPersonalizzato.focus();
            return false;
        }
        if (campoMancante === "tavolo") {
            sezioneTavoli.classList.add("errore");
            apriIntestazione();
            mostraMessaggio("Scegli il tavolo", "errore");
            tavoliGriglia.querySelector("button")?.focus();
            return false;
        }
        sezioneTavoli.classList.remove("errore");
        if (campoMancante === "persone" || !numeroPersone.checkValidity()) {
            sezionePersone.classList.add("errore");
            apriIntestazione();
            mostraMessaggio("Scegli il numero di persone", "errore");
            (personePersonalizzateAperte() ? numeroPersone : personeSelettore.querySelector("button"))?.focus();
            return false;
        }
        sezionePersone.classList.remove("errore");
    } else if (tipoOrdine.value === "banco") {
        const cognome = document.getElementById("cognome-banco");
        if (campoMancante === "cognome" || !cognome.checkValidity()) {
            return segnalaCampoObbligatorio(cognome, "Inserisci il cognome cliente.");
        }
    } else if (tipoOrdine.value === "ritiro") {
        const nome = document.getElementById("cliente-ritiro");
        const telefono = document.getElementById("telefono-ritiro");
        if (campoMancante === "nome" || !nome.checkValidity()) {
            return segnalaCampoObbligatorio(nome, "Inserisci il nome cliente.");
        }
        if (campoMancante === "telefono" || !telefono.checkValidity()) {
            return segnalaCampoObbligatorio(telefono, "Inserisci un numero di telefono valido.");
        }
    } else if (tipoOrdine.value === "consegna") {
        if (campoMancante === "indirizzo" || !inputIndirizzoConsegna.checkValidity()) {
            return segnalaCampoObbligatorio(inputIndirizzoConsegna, "Inserisci l'indirizzo di consegna.");
        }
        if (campoMancante === "telefono" || !inputTelefonoConsegna.checkValidity()) {
            return segnalaCampoObbligatorio(inputTelefonoConsegna, "Inserisci un numero di telefono valido.");
        }
    }
    if (tipoOrdine.value !== "tavolo" && (!orario.value || !orario.checkValidity())) {
        return segnalaCampoObbligatorio(orario, "Scegli l'orario richiesto.");
    }
    return true;
}
function apriConferma() {
    if (numeroModifica && !puoSalvareModifica(payloadOriginaleModifica)) return;
    if (!stato.righe.length) return;
    const indiceComponibileNonCompleto = trovaComponibileSenzaIngredienti(stato.righe);
    if (indiceComponibileNonCompleto >= 0) {
        const riga = stato.righe[indiceComponibileNonCompleto];
        stato.rigaAttiva = indiceComponibileNonCompleto;
        extraRicerca.value = "";
        extraAperto = true;
        renderRiepilogo();
        mostraMessaggio(`Scegli almeno un ingrediente per: ${riga.prodotto}`, "errore");
        riepilogo.querySelector(
            `.riepilogo-item[data-riga-attiva="${indiceComponibileNonCompleto}"]`
        )?.scrollIntoView({ block: "nearest" });
        return;
    }
    const consegna = tipoOrdine.value === "consegna";
    const ritiro = tipoOrdine.value === "ritiro";
    if (!validaDatiOrdine()) return;
    const dettagliServizio =
        tipoOrdine.value === "consegna"
              ? `<div class="conferma-consegna"><strong>Consegna</strong><span>${escapeHtml(document.getElementById("indirizzo-consegna").value.trim())}</span><span>${escapeHtml(document.getElementById("telefono-consegna").value.trim())}</span></div>`
            : tipoOrdine.value === "ritiro"
                ? `<div class="conferma-consegna"><strong>Ritiro: ${escapeHtml(document.getElementById("cliente-ritiro").value.trim())}</strong><span>${escapeHtml(document.getElementById("telefono-ritiro").value.trim())}</span></div>`
              : tipoOrdine.value === "banco"
                  ? `<div class="conferma-consegna"><strong>Banco · ${escapeHtml(document.getElementById("cognome-banco").value.trim())}</strong></div>`
                  : `<div class="conferma-consegna"><strong>${escapeHtml(document.getElementById("tavolo").value)} · ${escapeHtml(numeroPersone.value)} ${Number(numeroPersone.value) === 1 ? "persona" : "persone"}</strong></div>`;
    const dettaglioOrario =
        tipoOrdine.value === "tavolo"
            ? ""
            : `<div class="conferma-consegna"><span>Orario richiesto: ${escapeHtml(orario.value)}</span>${ritiro ? `<span>Pagamento: ${escapeHtml(pagamentoRitiro.selectedOptions[0].textContent)}</span>` : consegna ? `<span>Pagamento: ${escapeHtml(pagamentoConsegna.selectedOptions[0].textContent)}</span>` : ""}</div>`;
    const dettaglioCostoConsegna =
        consegna && costoConsegna
            ? `<div class="conferma-consegna"><span>Costo consegna</span><strong>${escapeHtml(euro.format(costoConsegna))}</strong></div>`
            : "";
    const coperto = copertoCorrente();
    const dettaglioCoperto = coperto
        ? `<div class="conferma-coperto">${escapeHtml(testoCoperto(coperto))}</div>`
        : "";
    confermaIntestazione.innerHTML =
        dettagliServizio +
        dettaglioOrario +
        dettaglioCostoConsegna +
        dettaglioCoperto;
    confermaRighe.innerHTML = raggruppaRigheConferma(stato.righe)
        .map(({ riga, quantita }) => {
            const extra = nomiExtra(riga.extra).join(", ");
            const senza = Array.isArray(riga.senza) && riga.senza.length
                ? `<small class="conferma-senza">SENZA ${escapeHtml(riga.senza.join(", "))}</small>`
                : "";
            const note = normalizzaNoteRiga(riga.note)
                .map(valore => `<small class="conferma-nota-riga">• ${escapeHtml(valore)}</small>`)
                .join("");
            const quantitaTesto = quantita > 1 ? `${quantita}× ` : "";
            return `<div class="conferma-riga"><strong>${quantitaTesto}${escapeHtml(riga.prodotto)} — ${escapeHtml(euro.format(prezzoRiga(riga) * quantita))}</strong>${extra ? `<small class="conferma-extra">+ ${escapeHtml(extra)}</small>` : ""}${senza}${note}</div>`;
        })
        .join("");
    confermaTotale.textContent = `Totale: ${euro.format(totaleOrdine())}`;
    document.getElementById("conferma-invio").textContent = numeroModifica
        ? "Salva modifiche"
        : "Conferma";
    confermaModale.hidden = false;
    document.body.classList.add("modale-aperta");
    document.getElementById("conferma-invio").focus();
}
function chiudiConferma() {
    confermaModale.hidden = true;
    document.body.classList.remove("modale-aperta");
}
function creaPayloadCorrente() {
    const tipo = tipoOrdine.value;
    const tavoloOrdine = tipo === "tavolo"
        ? numeroModifica
            ? nomeTavoloDaNumero(numeroTavoloDaNome(tavolo.value))
            : tavolo.value
        : tipo === "ritiro" ? document.getElementById("cliente-ritiro").value : "";
    return creaPayloadComanda({
        tipo,
        orario: orario.value,
        statoPagamento: tipo === "ritiro"
            ? pagamentoRitiro.value
            : tipo === "consegna" ? pagamentoConsegna.value : null,
        cognomeBanco: document.getElementById("cognome-banco").value,
        tavoloOCliente: tavoloOrdine,
        numeroPersone: numeroPersone.value,
        indirizzoConsegna: inputIndirizzoConsegna.value,
        telefonoConsegna: inputTelefonoConsegna.value,
        costoConsegna,
        telefonoRitiro: document.getElementById("telefono-ritiro").value,
        note: note.value
    }, stato.righe);
}
async function inviaOrdine() {
    if (numeroModifica && !puoSalvareModifica(payloadOriginaleModifica)) return;
    chiudiConferma();
    invia.disabled = true;
    const ordine = creaPayloadCorrente();
    if (numeroModifica) {
        mostraMessaggio("Salvataggio modifiche in corso...", "");
        try {
            if (navigator.onLine === false) throw new TypeError("offline");
            const risposta = await fetch(`/api/ordini/${numeroModifica}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ordine)
            });
            const dati = await risposta.json();
            if (!risposta.ok) throw new Error(dati.errore || "Salvataggio non riuscito.");
            mostraMessaggio(
                `Ordine #${numeroModifica} aggiornato. ${dati.messaggioStampa}`,
                dati.stampaCompletata || dati.stampaInCoda ? "successo" : "errore"
            );
            window.setTimeout(() => window.location.replace(paginaRitornoModifica), 1200);
        } catch (errore) {
            const senzaConnessione = navigator.onLine === false || errore instanceof TypeError;
            mostraMessaggio(
                senzaConnessione
                    ? "Modifiche NON salvate: manca la connessione. Riprova appena torna internet."
                    : errore.message,
                "errore"
            );
            invia.disabled = false;
        }
        return;
    }
    mostraMessaggio("Invio ordine in corso...", "");
    try {
        if (navigator.onLine === false) throw new TypeError("offline");
        const risposta = await fetch("/api/ordini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ordine)
        });
        const dati = await risposta.json();
        if (!risposta.ok) throw new Error(dati.errore || "Invio non riuscito.");
        aggiornaCacheClienteDopoInvio(ordine, dati);
        mostraMessaggio(
            `Ordine #${dati.numero} salvato. ${dati.messaggioStampa}`,
            dati.stampaCompletata || dati.stampaInCoda ? "successo" : "errore"
        );
        stato.righe = [];
        stato.rigaAttiva = null;
        costoConsegna = 0;
        aggiornaBottoneCostoConsegna();
        document.getElementById("cliente-ritiro").value = "";
        document.getElementById("telefono-ritiro").value = "";
        document.getElementById("cognome-banco").value = "";
        document.getElementById("indirizzo-consegna").value = "";
        document.getElementById("telefono-consegna").value = "";
        chiudiRisultatiClientiIndirizzo();
        clientiAbituali.reset();
        aggiornaRicercaClienteAbituale();
        ripristinaIntestazioneComanda();
        orario.value = oraLocale();
        pagamentoRitiro.value = "non_pagato";
        pagamentoConsegna.value = "non_pagato";
        renderRiepilogo();
    } catch (errore) {
        const senzaConnessione = navigator.onLine === false || errore instanceof TypeError;
        mostraMessaggio(
            senzaConnessione
                ? "Comanda NON inviata: manca la connessione. Riprova appena torna internet."
                : errore.message,
            "errore"
        );
        invia.disabled = false;
    }
}
tabsCategorie.addEventListener("click", evento => {
    const tab = evento.target.closest(".tab[data-tab]");
    if (!tab || !tabsCategorie.contains(tab)) return;
    chiudiPannelloExtra();
    stato.categoria = tab.dataset.tab;
    extraRicerca.value = "";
    tabsCategorie.querySelectorAll(".tab[data-tab]")
        .forEach(elemento => elemento.classList.toggle("active", elemento === tab));
    renderProdotti();
});
function abilitaTrascinamentoOrizzontale(griglia) {
    let trascinamento = null;
    let ignoraClick = false;
    griglia.addEventListener("pointerdown", evento => {
        if (evento.pointerType !== "mouse" || evento.button !== 0) return;
        trascinamento = {
            inizioX: evento.clientX,
            scrollIniziale: griglia.scrollLeft,
            iniziato: false
        };
    });
    document.addEventListener("pointermove", evento => {
        if (!trascinamento) return;
        const spostamento = evento.clientX - trascinamento.inizioX;
        if (!trascinamento.iniziato && Math.abs(spostamento) < 5) return;
        trascinamento.iniziato = true;
        griglia.classList.add("is-dragging");
        griglia.scrollLeft = trascinamento.scrollIniziale - spostamento;
        evento.preventDefault();
    });
    function terminaTrascinamento() {
        if (!trascinamento) return;
        const trascinata = trascinamento.iniziato;
        trascinamento = null;
        griglia.classList.remove("is-dragging");
        if (!trascinata) return;
        ignoraClick = true;
        setTimeout(() => (ignoraClick = false), 0);
    }
    document.addEventListener("pointerup", terminaTrascinamento);
    document.addEventListener("pointercancel", terminaTrascinamento);
    griglia.addEventListener(
        "click",
        evento => {
            if (!ignoraClick) return;
            evento.preventDefault();
            evento.stopImmediatePropagation();
        },
        true
    );
}
abilitaTrascinamentoOrizzontale(prodotti);
abilitaTrascinamentoOrizzontale(ricercaRisultati);
prodotti.addEventListener("scroll", () => {
    aggiornaIndicatoreProdotti(prodotti, prodottiWrapper, prodottiIndicatore);
}, { passive: true });
ricercaRisultati.addEventListener("scroll", () => {
    aggiornaIndicatoreProdotti(ricercaRisultati, ricercaWrapper, ricercaPagine);
}, { passive: true });
window.addEventListener("resize", () => {
    aggiornaRighePaginaProdotti(prodotti);
    aggiornaRighePaginaProdotti(ricercaRisultati);
    aggiornaIndicatoreProdotti(prodotti, prodottiWrapper, prodottiIndicatore);
    aggiornaIndicatoreProdotti(ricercaRisultati, ricercaWrapper, ricercaPagine);
});
if (window.ResizeObserver) {
    const osservatoreRigheProdotti = new window.ResizeObserver(() => {
        aggiornaRighePaginaProdotti(prodotti);
        aggiornaRighePaginaProdotti(ricercaRisultati);
    });
    osservatoreRigheProdotti.observe(prodotti);
    osservatoreRigheProdotti.observe(ricercaRisultati);
}
bottoneIngredienti.addEventListener("click", () => {
    ingredientiVisibili = !ingredientiVisibili;
    aggiornaToggleIngredienti();
});
extraLista.addEventListener("pointerdown", evento => {
    if (evento.pointerType !== "mouse" || evento.button !== 0) return;
    trascinamentoExtra = {
        inizioX: evento.clientX,
        scrollIniziale: extraLista.scrollLeft,
        iniziato: false
    };
});
document.addEventListener("pointermove", evento => {
    if (!trascinamentoExtra) return;
    const spostamento = evento.clientX - trascinamentoExtra.inizioX;
    if (!trascinamentoExtra.iniziato && Math.abs(spostamento) < 5) return;
    trascinamentoExtra.iniziato = true;
    extraLista.classList.add("is-dragging");
    extraLista.scrollLeft = trascinamentoExtra.scrollIniziale - spostamento;
    evento.preventDefault();
});
function terminaTrascinamentoExtra() {
    if (!trascinamentoExtra) return;
    const trascinato = trascinamentoExtra.iniziato;
    trascinamentoExtra = null;
    extraLista.classList.remove("is-dragging");
    if (!trascinato) return;
    ignoraClickDopoTrascinamentoExtra = true;
    setTimeout(() => (ignoraClickDopoTrascinamentoExtra = false), 0);
}
document.addEventListener("pointerup", terminaTrascinamentoExtra);
document.addEventListener("pointercancel", terminaTrascinamentoExtra);
extraLista.addEventListener(
    "click",
    evento => {
        if (!ignoraClickDopoTrascinamentoExtra) return;
        evento.preventDefault();
        evento.stopImmediatePropagation();
    },
    true
);
senzaIngredientiLista.addEventListener("click", evento => {
    const bottone = evento.target.closest("[data-senza-ingrediente]");
    if (!bottone || !senzaIngredientiLista.contains(bottone)) return;
    stato.righe = toggleSenza(
        stato.righe,
        stato.rigaAttiva,
        bottone.dataset.senzaIngrediente
    );
    renderRiepilogo();
});
noteRigaLista.addEventListener("click", evento => {
    const bottone = evento.target.closest("[data-nota-riga]");
    if (!bottone || !noteRigaLista.contains(bottone)) return;
    stato.righe = toggleNotaRiga(stato.righe, stato.rigaAttiva, bottone.dataset.notaRiga);
    renderRiepilogo();
});
bottoneRicerca.addEventListener("click", apriRicerca);
ricercaInput.addEventListener("input", renderRisultatiRicerca);
ricercaTasti.addEventListener("pointerdown", evento => {
    if (evento.target.closest("[data-moltiplicatore]")) evento.preventDefault();
});
ricercaTasti.addEventListener("click", gestisciTastoMoltiplicatore);
document.getElementById("ricerca-chiudi").addEventListener("click", chiudiRicerca);
// Tocco/click sullo sfondo (fuori dal pannello) chiude la ricerca.
ricercaModale.addEventListener("click", evento => {
    if (evento.target === ricercaModale) chiudiRicerca();
});
tipoOrdine.addEventListener("change", () => {
    if (tipoOrdine.value !== tipoOrdineCorrente) apriIntestazione();
    const pagamentoPrecedente = tipoOrdineCorrente === "ritiro"
        ? pagamentoRitiro.value
        : tipoOrdineCorrente === "consegna" ? pagamentoConsegna.value : "";
    const pagamentoAttuale = tipoOrdine.value === "ritiro"
        ? pagamentoRitiro
        : tipoOrdine.value === "consegna" ? pagamentoConsegna : null;
    if (numeroModifica && pagamentoAttuale) {
        const nuovoPagamento = pagamentoPrecedente || pagamentoModifica || "non_pagato";
        pagamentoAttuale.value = tipoOrdine.value !== "consegna" && nuovoPagamento === "pos"
            ? "non_pagato"
            : nuovoPagamento;
        pagamentoModifica = pagamentoAttuale.value;
    } else if (numeroModifica && pagamentoPrecedente) {
        pagamentoModifica = pagamentoPrecedente;
    }
    tipoOrdineCorrente = tipoOrdine.value;
    if (tipoOrdine.value !== "consegna") costoConsegna = 0;
    aggiornaTipoOrdine();
    aggiornaStatoIntestazione();
    aggiornaRicercaClienteAbituale();
    aggiornaRicercaClientiIndirizzo();
    renderRiepilogo();
});
pagamentoRitiro.addEventListener("change", () => {
    if (numeroModifica) pagamentoModifica = pagamentoRitiro.value;
});
pagamentoConsegna.addEventListener("change", () => {
    if (numeroModifica) pagamentoModifica = pagamentoConsegna.value;
});
noteToggle.addEventListener("click", () => {
    noteAperta = !noteAperta;
    aggiornaPulsanteNote();
    if (noteAperta) note.focus();
});
noteRapide.addEventListener("click", evento => {
    const bottone = evento.target.closest("[data-note-rapida]");
    if (!bottone || !noteRapide.contains(bottone)) return;
    const testo = bottone.dataset.noteRapida;
    note.value = notaContiene(note.value, testo)
        ? togliNotaRapida(note.value, testo)
        : aggiungiNotaRapida(note.value, testo);
    note.dispatchEvent(new Event("input", { bubbles: true }));
});
note.addEventListener("input", aggiornaPulsanteNote);
intestazioneCompatta.addEventListener("click", apriIntestazione);
tavolo.addEventListener("change", () => {
    sezioneTavoli.classList.remove("errore");
    aggiornaSelettoreTavoli();
    aggiornaStatoIntestazione();
});
numeroTavoloPersonalizzato.addEventListener("input", () => {
    gestioneTavoli.impostaNumeroPersonalizzato(numeroTavoloPersonalizzato.value);
    aggiornaSelettoreTavoli();
});
for (const id of ["telefono-consegna", "telefono-ritiro"]) {
    document.getElementById(id).addEventListener("input", aggiornaRicercaClienteAbituale);
}
inputIndirizzoConsegna.addEventListener("input", aggiornaRicercaClientiIndirizzo);
inputIndirizzoConsegna.addEventListener("blur", evento => {
    if (!clientiIndirizzoRisultati.contains(evento.relatedTarget)) {
        chiudiRisultatiClientiIndirizzo();
    }
});
clientiIndirizzoRisultati.addEventListener("focusout", evento => {
    if (!clientiIndirizzoRisultati.contains(evento.relatedTarget)
            && evento.relatedTarget !== inputIndirizzoConsegna) {
        chiudiRisultatiClientiIndirizzo();
    }
});
document.addEventListener("pointerdown", evento => {
    if (!clientiIndirizzoRisultati.hidden
            && !clientiIndirizzoRisultati.contains(evento.target)
            && evento.target !== inputIndirizzoConsegna) {
        chiudiRisultatiClientiIndirizzo();
    }
});
numeroPersone.addEventListener("input", () => {
    sezionePersone.classList.remove("errore");
    aggiornaSelettorePersone();
    aggiornaStatoIntestazione();
    renderRiepilogo();
});
bottoneCostoConsegna.addEventListener("click", () => {
    costoConsegna = costoConsegna === 2 ? 0 : 2;
    aggiornaBottoneCostoConsegna();
    renderRiepilogo();
});
orario.value = oraLocale();
creaSelettoriOrdine();
numeroPersone.min = "1";
numeroPersone.max = "30";
aggiornaPulsanteNote();
aggiornaTipoOrdine();
aggiornaPosizionePannelloExtra();
window.addEventListener("resize", aggiornaPosizionePannelloExtra);
extraFatto.addEventListener("click", () => {
    chiudiPannelloExtra();
    extraIntestazione.focus({ preventScroll: true });
});
extraIntestazione.addEventListener("click", () => {
    extraAperto = !extraAperto;
    if (!extraAperto) extraRicerca.value = "";
    renderRiepilogo();
});
extraRicerca.addEventListener("input", renderGrigliaExtra);
riprovaModifica.addEventListener("click", inizializzaModifica);
invia.addEventListener("click", apriConferma);
document.getElementById("conferma-invio").addEventListener("click", inviaOrdine);
document.getElementById("annulla-invio").addEventListener("click", chiudiConferma);
riepilogo.addEventListener("click", rimuoviRigaRiepilogo);
riepilogoSheetLista.addEventListener("click", rimuoviRigaRiepilogo);
barraConto.addEventListener("pointerdown", avviaTrascinamentoRiepilogo);
barraConto.addEventListener("pointermove", aggiornaTrascinamentoRiepilogo);
barraConto.addEventListener("pointerup", terminaTrascinamentoRiepilogo);
barraConto.addEventListener("pointercancel", terminaTrascinamentoRiepilogo);
barraConto.addEventListener("lostpointercapture", annullaTrascinamentoRiepilogo);
riepilogoSheetApri.addEventListener("keydown", attivaRiepilogoSheetDaTastiera);
riepilogoSheetHeader.addEventListener("pointerdown", avviaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("pointermove", aggiornaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("pointerup", terminaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("pointercancel", terminaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("lostpointercapture", annullaTrascinamentoChiusuraSheet);
riepilogoSheetChiudi.addEventListener("click", () => chiudiRiepilogoSheet());
document.getElementById("riepilogo-sheet-invia").addEventListener("click", () => {
    chiudiRiepilogoSheet();
    apriConferma();
});
riepilogoSheetBackdrop.addEventListener("click", evento => {
    if (evento.target === riepilogoSheetBackdrop) chiudiRiepilogoSheet();
});
function aggiornaSheetAlCambioViewport() {
    if (riepilogoSheetAperto && !riepilogoSheetDisponibile()) chiudiRiepilogoSheet(false);
    aggiornaAccessibilitaBarraSheet();
}
window.addEventListener("resize", aggiornaSheetAlCambioViewport);
window.addEventListener("orientationchange", aggiornaSheetAlCambioViewport);
mediaRiepilogoSheet.addEventListener("change", aggiornaSheetAlCambioViewport);
mediaGrigliaExtra.addEventListener("change", renderGrigliaExtra);
aggiornaAccessibilitaBarraSheet();
document.getElementById("btn-annulla").addEventListener("click", () => {
    if (numeroModifica) {
        if (payloadOriginaleModifica !== null
                && JSON.stringify(creaPayloadCorrente()) !== payloadOriginaleModifica) {
            annullaModificaModale.hidden = false;
            document.body.classList.add("modale-aperta");
            document.getElementById("annulla-modifica-esci").focus({ preventScroll: true });
        } else {
            window.location.replace(paginaRitornoModifica);
        }
        return;
    }
    stato.righe = [];
    stato.rigaAttiva = null;
    chiudiRisultatiClientiIndirizzo();
    clientiAbituali.reset();
    costoConsegna = 0;
    aggiornaBottoneCostoConsegna();
    ripristinaIntestazioneComanda();
    renderRiepilogo();
    mostraMessaggio("Ordine annullato.", "");
});
document.getElementById("annulla-modifica-continua").addEventListener("click", () => {
    annullaModificaModale.hidden = true;
    document.body.classList.remove("modale-aperta");
});
document.getElementById("annulla-modifica-esci").addEventListener("click", () => {
    window.location.replace(paginaRitornoModifica);
});
annullaModificaModale.addEventListener("click", evento => {
    if (evento.target === annullaModificaModale) {
        annullaModificaModale.hidden = true;
        document.body.classList.remove("modale-aperta");
    }
});
document.addEventListener("keydown", evento => {
    intrappolaFocusNelRiepilogoSheet(evento);
    if (evento.key !== "Escape") return;
    if (!clientiIndirizzoRisultati.hidden) {
        chiudiRisultatiClientiIndirizzo();
        evento.preventDefault();
        return;
    }
    if (!annullaModificaModale.hidden) {
        annullaModificaModale.hidden = true;
        document.body.classList.remove("modale-aperta");
        evento.preventDefault();
        return;
    }
    if (riepilogoSheetAperto) chiudiRiepilogoSheet();
    else if (!ricercaModale.hidden) chiudiRicerca();
    else if (!confermaModale.hidden) chiudiConferma();
});
function applicaMenu(menu, extra) {
    const categoriaPrecedente = stato.categoria;
    stato.menu = menu;
    prodottoCoperto = stato.menu.find(prodotto => isCoperto(prodotto)) || null;
    stato.menu = stato.menu.filter(prodotto => !isCoperto(prodotto));
    stato.extra = extra;
    const labels = new Map(
        [...tabsCategorie.querySelectorAll(".tab[data-tab]")]
            .map(tab => [tab.dataset.tab, tab.textContent.trim()])
    );
    const categorie = new Map();
    for (const prodotto of stato.menu) {
        if (isCoperto(prodotto)) continue;
        if (!categorie.has(prodotto.categoria)) {
            categorie.set(prodotto.categoria, {
                id: prodotto.categoria,
                nome: prodotto.categoriaNome || labels.get(prodotto.categoria) || prodotto.categoria,
                ordine: Number(prodotto.categoriaOrdine || 0)
            });
        }
    }
    tabsCategorie.querySelectorAll(".tab[data-tab]").forEach(tab => tab.remove());
    const ordinate = [...categorie.values()].sort((first, second) => first.ordine - second.ordine);
    etichetteCategorie = {};
    for (const categoria of ordinate) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "tab";
        tab.dataset.tab = categoria.id;
        tab.textContent = categoria.nome || labels.get(categoria.id) || categoria.id;
        etichetteCategorie[categoria.id] = tab.textContent;
        tabsCategorie.appendChild(tab);
    }
    stato.categoria = categorie.has(categoriaPrecedente) ? categoriaPrecedente : ordinate[0]?.id || "";
    tabsCategorie.querySelectorAll(".tab[data-tab]").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === stato.categoria);
    });
    renderGrigliaExtra();
    renderProdotti();
    renderRiepilogo();
    if (!ricercaModale.hidden) renderRisultatiRicerca();
}

const caricamentoMenu = window.prodottiUI.caricaMenuConCache(async () => {
    const risposte = await Promise.all([fetch("/api/menu"), fetch("/api/extra")]);
    if (risposte.some(risposta => !risposta.ok)) throw new Error("Menu non disponibile.");
    const [menu, extra] = await Promise.all(risposte.map(risposta => risposta.json()));
    const versioneMenu = risposte[0].headers.get("X-Menu-Version");
    const versioneExtra = risposte[1].headers.get("X-Menu-Version");
    return {
        menu,
        extra,
        versione: versioneMenu !== null && versioneMenu === versioneExtra ? Number(versioneMenu) : null
    };
}, applicaMenu);

caricamentoMenu.aggiornamento.catch(errore => {
    if (!caricamentoMenu.cache) mostraMessaggio(errore.message, "errore");
});

async function inizializzaModifica() {
    if (!numeroModifica || caricamentoModificaInCorso) return;
    caricamentoModificaInCorso = true;
    erroreCaricamentoModifica = false;
    payloadOriginaleModifica = null;
    aggiornaStatoCaricamentoModifica();
    mostraMessaggio(`Caricamento ordine #${numeroModifica}...`, "");
    document.title = `Modifica ordine #${numeroModifica} | CIVICO7`;
    document.querySelector("main.container > header h1").textContent = `Modifica ordine #${numeroModifica}`;
    document.getElementById("btn-annulla").textContent = "Annulla";
    document.getElementById("conferma-invio").textContent = "Salva modifiche";

    try {
        try {
            await caricamentoMenu.aggiornamento;
        } catch (errore) {
            if (!caricamentoMenu.cache) throw errore;
        }
        const risposta = await fetch(`/api/ordini/${numeroModifica}`);
        const ordine = await risposta.json();
        if (!risposta.ok) throw new Error(ordine.errore || "Impossibile caricare l'ordine.");

        const tipo = ordine.tipo === "sala" ? "tavolo" : ordine.tipo || "tavolo";
        const persone = Number.isInteger(ordine.numeroPersone) && ordine.numeroPersone > 0
            ? ordine.numeroPersone
            : 1;
        tipoOrdine.value = tipo;
        tipoOrdineOriginale = tipo;
        numeroPersoneOriginale = persone;
        copertoOrdine = ordine.coperto || null;
        const righeCopertoLegacy = (ordine.righe || []).filter(riga => isCoperto({ nome: riga.prodotto }));
        if (!copertoOrdine && tipoOrdineOriginale === "tavolo" && righeCopertoLegacy.length) {
            const totaleCopertoLegacy = righeCopertoLegacy.reduce(
                (totale, riga) => totale + Number(riga.totale ?? riga.prezzoBase ?? 0),
                0
            );
            copertoOrdine = calcolaCoperto("tavolo", persone, totaleCopertoLegacy / persone);
        }

        gestioneTavoli.reset();
        const numeroTavoloOrdine = numeroTavoloDaNome(ordine.tavoloOCliente);
        if (tipo === "tavolo" && numeroTavoloOrdine) {
            if (Number(numeroTavoloOrdine) <= 15) {
                gestioneTavoli.scegli(numeroTavoloOrdine);
            } else {
                gestioneTavoli.impostaNumeroPersonalizzato(numeroTavoloOrdine);
            }
        }
        aggiornaSelettoreTavoli();
        numeroPersone.value = String(persone);
        impostaPersonePersonalizzate(persone > 8);
        aggiornaSelettorePersone();

        document.getElementById("cliente-ritiro").value = ordine.tipo === "ritiro"
            ? ordine.tavoloOCliente || ""
            : "";
        document.getElementById("indirizzo-consegna").value = ordine.indirizzoConsegna || "";
        document.getElementById("telefono-consegna").value = ordine.telefonoConsegna || "";
        document.getElementById("telefono-ritiro").value = ordine.telefonoRitiro || "";
        document.getElementById("cognome-banco").value = ordine.cognomeBanco || "";
        note.value = ordine.note || "";
        noteAperta = Boolean(note.value);
        orario.value = tipo === "tavolo" ? "" : ordine.orario || oraLocale();
        pagamentoRitiro.value = ordine.statoPagamento || "";
        pagamentoConsegna.value = ordine.statoPagamento || "";
        pagamentoModifica = ordine.statoPagamento || "";
        costoConsegna = Number(ordine.costoConsegna) === 2 ? 2 : 0;
        tipoOrdineCorrente = tipo;
        aggiornaTipoOrdine();
        aggiornaPulsanteNote();

        stato.righe = preparaRigheModifica(ordine.righe, stato.menu, stato.extra);
        stato.rigaAttiva = stato.righe.length ? stato.righe.length - 1 : null;
        extraAperto = false;
        aggiornaBottoneCostoConsegna();
        chiudiRisultatiClientiIndirizzo();
        if (datiOrdineCompleti(tipo, datiIntestazioneCorrenti())) chiudiIntestazione();
        payloadOriginaleModifica = JSON.stringify(creaPayloadCorrente());
        erroreCaricamentoModifica = false;
        renderRiepilogo();
        mostraMessaggio("", "");
    } catch (errore) {
        payloadOriginaleModifica = null;
        erroreCaricamentoModifica = true;
        mostraMessaggio(`Impossibile caricare l'ordine #${numeroModifica}. Riprova.`, "errore");
    } finally {
        caricamentoModificaInCorso = false;
        aggiornaStatoCaricamentoModifica();
    }
}

inizializzaModifica();
void aggiornaTavoliOccupati();
configuraAggiornamentoTavoliOccupati();
document.addEventListener("civico7:online", () => void aggiornaTavoliOccupati());
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void aggiornaTavoliOccupati();
    configuraAggiornamentoTavoliOccupati();
});
