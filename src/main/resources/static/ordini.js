const stato = { categoria: "pizze", menu: [], extra: [], righe: [], rigaAttiva: null };
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
const invia = document.getElementById("btn-invia");
const sezioneExtra = document.getElementById("extra-section");
const extraLista = document.getElementById("extra-lista");
const extraIntestazione = document.getElementById("extra-intestazione");
const senzaIngredienti = document.getElementById("senza-ingredienti");
const senzaIngredientiLista = document.getElementById("senza-ingredienti-lista");
const mediaGrigliaExtra = window.matchMedia("(max-width: 699px)");
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
const selettoreRigaExtra = document.getElementById("riga-extra");
const extraRiepilogo = document.getElementById("extra-riepilogo");
const confermaModale = document.getElementById("conferma-modale");
const confermaRiepilogo = document.getElementById("conferma-riepilogo");
const confermaTotale = document.getElementById("conferma-totale");
const bottoneCostoConsegna = document.getElementById("btn-costo-consegna");
const bottoneRicerca = document.getElementById("btn-ricerca");
const ricercaModale = document.getElementById("ricerca-modale");
const ricercaInput = document.getElementById("ricerca-input");
const ricercaRisultati = document.getElementById("ricerca-risultati");
const ricercaTasti = document.getElementById("ricerca-tasti");
const ricercaMoltiplicatore = document.getElementById("ricerca-moltiplicatore");
const ricercaMessaggio = document.getElementById("ricerca-messaggio");
const paginaPrincipale = document.querySelector("main");
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const { escapeHtml } = window.htmlUtils;
const {
    filtraProdotti,
    isCoperto,
    calcolaCoperto,
    aggiungiProdotti,
    preparaRipetizione,
    impostaRigaAttiva,
    rimuoviProdotto,
    toggleExtra,
    toggleSenza,
    intestazioneExtra,
    creaStatoMoltiplicatore,
    premiTastoMoltiplicatore,
    quantitaDaApplicare,
    testoMoltiplicatore,
    aggiornaConteggioProdotti,
    controllaLimiteRighe,
    impostaValoreControllo,
    nomeTavoloDaNumero,
    datiObbligatoriMancanti,
    datiOrdineCompleti,
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
let statoMoltiplicatore = creaStatoMoltiplicatore();
let trascinamentoProdotti = null;
let ignoraClickDopoTrascinamento = false;
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
            const chiave = JSON.stringify([
                riga.prodotto,
                [...extra].sort((a, b) => a.localeCompare(b, "it-IT")),
                [...senza].sort((a, b) => a.localeCompare(b, "it-IT"))
            ]);
            const corrente = raggruppate.get(chiave);
            if (corrente) corrente.quantita++;
            else if (raggruppate.size < 30) {
                raggruppate.set(chiave, { prodotto: riga.prodotto, quantita: 1, extra, senza });
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
        bottone.classList.toggle("selezionato", selezionato);
        bottone.setAttribute("aria-pressed", String(selezionato));
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
    return calcolaCoperto(
        tipoOrdine.value,
        Number(numeroPersone.value),
        prodottoCoperto?.disponibile === false || prodottoCoperto?.archiviato === true
            ? 0
            : prodottoCoperto?.prezzo
    );
}
function testoCoperto(coperto) {
    return `Coperto ${coperto.persone} × ${euro.format(coperto.prezzoUnitario)} = ${euro.format(coperto.totale)}`;
}
function renderExtra(container, selezionati, onChange) {
    container.innerHTML = "";
    stato.extra.filter(extra => extra.disponibile !== false).forEach(extra => {
        const bottone = document.createElement("button");
        bottone.type = "button";
        bottone.className = "extra-card";
        bottone.classList.toggle(
            "selezionato",
            selezionati.some(elemento => elemento.id === extra.id)
        );
        bottone.innerHTML = `<strong>${escapeHtml(extra.nome)}</strong><span>${escapeHtml(euro.format(Number(extra.prezzo)))}</span>`;
        bottone.addEventListener("click", () => {
            const presenti = selezionati.some(elemento => elemento.id === extra.id);
            selezionati = presenti ? selezionati.filter(elemento => elemento.id !== extra.id) : [...selezionati, extra];
            onChange(selezionati);
            renderExtra(container, selezionati, onChange);
        });
        container.appendChild(bottone);
    });
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
    sezioneExtra.hidden = !stato.extra.length && !ingredienti.length;
    extraIntestazione.textContent = intestazioneExtra(stato.righe, stato.rigaAttiva);
    extraLista.hidden = !stato.extra.length;
    extraLista.replaceChildren();
    const colonne = mediaGrigliaExtra.matches ? 3 : 4;
    const righe = mediaGrigliaExtra.matches ? 4 : 3;
    const elementiPerPagina = colonne * righe;
    for (let inizio = 0; inizio < stato.extra.length; inizio += elementiPerPagina) {
        const pagina = document.createElement("div");
        pagina.className = "pagina-extra";
        stato.extra.slice(inizio, inizio + elementiPerPagina).forEach(extra => {
            const bottone = document.createElement("button");
            const rigaAttiva = stato.righe[stato.rigaAttiva];
            bottone.type = "button";
            bottone.className = "extra-card";
            bottone.classList.toggle("selezionato", extraSelezionato(extra, rigaAttiva));
            bottone.disabled = !rigaAttiva || extra.disponibile === false;
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
}
function renderSenzaIngredienti(riga, ingredienti) {
    senzaIngredientiLista.replaceChildren();
    senzaIngredienti.hidden = !riga || !ingredienti.length;
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
function renderProdotti() {
    prodotti.innerHTML = "";
    prodotti.scrollLeft = 0;
    const disponibili = stato.menu
        .filter(prodotto => !isCoperto(prodotto) && prodotto.categoria === stato.categoria)
        .sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, "it"));
    for (let inizio = 0; inizio < disponibili.length; inizio += 9) {
        const pagina = document.createElement("div");
        pagina.className = "pagina-prodotti";
        disponibili.slice(inizio, inizio + 9).forEach(prodotto => {
            const bottone = document.createElement("button");
            bottone.className = "prodotto-btn";
            bottone.type = "button";
            bottone.disabled = prodotto.disponibile === false;
            bottone.classList.toggle("esaurito", prodotto.disponibile === false);
            const descrizioneIngredienti = prodotto.ingredienti?.length ? prodotto.ingredienti.join(", ") : "";
            const ingredienti = descrizioneIngredienti
                ? `<span class="ingredienti-wrapper"><span class="ingredienti">${escapeHtml(descrizioneIngredienti)}</span></span>`
                : "";
            bottone.innerHTML = `<strong>${escapeHtml(prodotto.nome)}</strong><span class="prezzo-prodotto">${escapeHtml(euro.format(Number(prodotto.prezzo)))}</span>${prodotto.disponibile === false ? '<span class="prodotto-esaurito">Esaurito</span>' : ""}${ingredienti}`;
            if (descrizioneIngredienti) bottone.querySelector(".ingredienti").title = descrizioneIngredienti;
            bottone.addEventListener("click", () => aggiungiProdotto(prodotto));
            pagina.appendChild(bottone);
        });
        prodotti.appendChild(pagina);
    }
}
// Unico punto di aggiunta al conto: usato dalle tab delle categorie e dalla ricerca.
function aggiungiProdotto(prodotto) {
    if (prodotto.disponibile === false) return false;
    const limite = controllaLimiteRighe(stato.righe.length, 1);
    if (!limite.consentito) {
        mostraMessaggio(`Massimo 100 prodotti per comanda: puoi aggiungerne ancora ${limite.disponibili}`, "errore");
        return false;
    }
    const primoProdotto = stato.righe.length === 0;
    const risultato = aggiungiProdotti(stato.righe, stato.rigaAttiva, prodotto);
    stato.righe = risultato.righe;
    stato.rigaAttiva = risultato.rigaAttiva;
    if (primoProdotto && datiOrdineCompleti(tipoOrdine.value, datiIntestazioneCorrenti())) {
        chiudiIntestazione();
    }
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
    ricercaRisultati.innerHTML = "";
    ricercaMessaggio.textContent = "";
    if (!testo.trim()) return;
    if (!trovati.length) {
        ricercaRisultati.innerHTML = '<p class="ricerca-vuota">Nessun prodotto trovato</p>';
        return;
    }
    trovati.forEach(prodotto => {
        const bottone = document.createElement("button");
        bottone.type = "button";
        bottone.className = "ricerca-risultato";
        bottone.disabled = prodotto.disponibile === false;
        bottone.classList.toggle("esaurito", prodotto.disponibile === false);
        bottone.innerHTML = `<span class="ricerca-nome">${escapeHtml(prodotto.nome)}</span><span class="ricerca-categoria">${escapeHtml(etichetteCategorie[prodotto.categoria] || prodotto.categoriaNome || prodotto.categoria)}</span><span class="ricerca-prezzo">${escapeHtml(euro.format(Number(prodotto.prezzo)))}</span>${prodotto.disponibile === false ? '<span class="ricerca-esaurito">Esaurito</span>' : ""}`;
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
        ricercaRisultati.appendChild(bottone);
    });
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
function aggiornaGestioneExtra() {
    const riga = stato.righe[Number(selettoreRigaExtra.value)];
    const prodotto = riga && stato.menu.find(item => item.nome === riga.prodotto);
    const modificabile = riga && prodotto?.ammetteExtra === true;
    extraRiepilogo.hidden = !modificabile;
    if (modificabile)
        renderExtra(
            document.getElementById("extra-riepilogo-lista"),
            nomiExtra(riga.extra)
                .map(nome => stato.extra.find(extra => extra.nome === nome))
                .filter(Boolean),
            selezionati => {
                riga.extra = selezionati;
            }
        );
}
function aggiornaSelettoreRighe() {
    const scelto = selettoreRigaExtra.value;
    selettoreRigaExtra.innerHTML = '<option value="">Seleziona un prodotto</option>';
    stato.righe.forEach((riga, indice) => {
        const opzione = document.createElement("option");
        opzione.value = indice;
        opzione.textContent = `${riga.prodotto}${riga.extra.length ? ` + ${nomiExtra(riga.extra).join(", ")}` : ""}`;
        selettoreRigaExtra.appendChild(opzione);
    });
    selettoreRigaExtra.disabled = !stato.righe.length;
    selettoreRigaExtra.value = scelto < stato.righe.length ? scelto : "";
    aggiornaGestioneExtra();
}
function renderRiepilogo() {
    renderRigheRiepilogo(riepilogo);
    renderRigheRiepilogo(riepilogoSheetLista);
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
    invia.disabled = !stato.righe.length;
    invia.textContent = stato.righe.length ? "Rivedi e invia" : "Aggiungi prodotti";
    const inviaSheet = document.getElementById("riepilogo-sheet-invia");
    inviaSheet.disabled = !stato.righe.length;
    inviaSheet.textContent = invia.textContent;
    aggiornaSelettoreRighe();
}
function renderRigheRiepilogo(contenitore) {
    contenitore.replaceChildren();
    stato.righe.forEach((riga, indice) => {
        const voce = document.createElement("div");
        voce.className = "riepilogo-item";
        voce.classList.toggle("riga-attiva", indice === stato.rigaAttiva);
        const descrizione = riga.ingredienti?.length
            ? `<small class="riepilogo-descrizione">${escapeHtml(riga.ingredienti.join(", "))}</small>`
            : "";
        const extra = riga.extra.length
            ? `<span>Extra: ${escapeHtml(nomiExtra(riga.extra).join(", "))}</span>`
            : "";
        const senza = Array.isArray(riga.senza) && riga.senza.length
            ? `<small class="riepilogo-senza">senza ${escapeHtml(riga.senza.join(", "))}</small>`
            : "";
        const nomeRiga = riga.ammetteExtra || riga.ingredienti?.length
            ? `<button class="seleziona-riga" type="button" data-riga-attiva="${escapeHtml(indice)}">${escapeHtml(riga.prodotto)}</button>`
            : `<strong>${escapeHtml(riga.prodotto)}</strong>`;
        voce.innerHTML = `<div>${nomeRiga}${senza}${descrizione}${extra}</div><button class="rimuovi" type="button" data-indice="${escapeHtml(indice)}">Rimuovi</button>`;
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
    const selezione = evento.target.closest(".seleziona-riga");
    if (selezione && evento.currentTarget.contains(selezione)) {
        const risultato = impostaRigaAttiva(stato.righe, Number(selezione.dataset.rigaAttiva));
        stato.rigaAttiva = risultato.rigaAttiva;
        renderRiepilogo();
        return;
    }
    const pulsante = evento.target.closest(".rimuovi");
    if (!pulsante || !evento.currentTarget.contains(pulsante)) return;
    const risultato = rimuoviProdotto(stato.righe, stato.rigaAttiva, Number(pulsante.dataset.indice));
    stato.righe = risultato.righe;
    stato.rigaAttiva = risultato.rigaAttiva;
    renderRiepilogo();
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
    if (!stato.righe.length) return;
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
                  : `<div class="conferma-consegna"><strong>${escapeHtml(document.getElementById("tavolo").value)} · ${escapeHtml(numeroPersone.value)} persone</strong></div>`;
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
    confermaRiepilogo.innerHTML =
        dettagliServizio +
        dettaglioOrario +
        dettaglioCostoConsegna +
        dettaglioCoperto +
        stato.righe
            .map(riga => {
                const extra = nomiExtra(riga.extra)
                    .map(nome => {
                        const dato = stato.extra.find(item => item.nome === nome);
                        return `${escapeHtml(nome)} (${escapeHtml(euro.format(Number(dato?.prezzo || 0)))})`;
                    })
                    .join(", ");
                const senza = Array.isArray(riga.senza) && riga.senza.length
                    ? `<span class="conferma-senza">senza ${escapeHtml(riga.senza.join(", "))}</span>`
                    : "";
                return `<div class="conferma-riga"><strong>${escapeHtml(riga.prodotto)} - ${escapeHtml(euro.format(Number(riga.prezzo)))}</strong>${senza}${riga.ingredienti?.length ? `<span>${escapeHtml(riga.ingredienti.join(", "))}</span>` : ""}${extra ? `<span>Extra: ${extra}</span>` : ""}<span>Totale riga: ${escapeHtml(euro.format(prezzoRiga(riga)))}</span></div>`;
            })
            .join("");
    confermaTotale.textContent = `Totale: ${euro.format(totaleOrdine())}`;
    confermaModale.hidden = false;
    document.body.classList.add("modale-aperta");
    document.getElementById("conferma-invio").focus();
}
function chiudiConferma() {
    confermaModale.hidden = true;
    document.body.classList.remove("modale-aperta");
}
async function inviaOrdine() {
    chiudiConferma();
    invia.disabled = true;
    mostraMessaggio("Invio ordine in corso...", "");
    const tipo = tipoOrdine.value;
    const consegna = tipo === "consegna";
    const ritiro = tipo === "ritiro";
    const tavolo = tipo === "tavolo";
    const ordine = {
        tipo,
        orario: tavolo ? "" : orario.value,
        statoPagamento: ritiro ? pagamentoRitiro.value : consegna ? pagamentoConsegna.value : null,
        cognomeBanco: tipo === "banco" ? document.getElementById("cognome-banco").value : "",
        tavoloOCliente: tavolo
            ? document.getElementById("tavolo").value
            : ritiro
                ? document.getElementById("cliente-ritiro").value
                : "",
        numeroPersone: tavolo ? Number(numeroPersone.value) : null,
        indirizzoConsegna: consegna ? document.getElementById("indirizzo-consegna").value : "",
        telefonoConsegna: consegna ? document.getElementById("telefono-consegna").value : "",
        costoConsegna: consegna ? costoConsegna : 0,
        telefonoRitiro: ritiro ? document.getElementById("telefono-ritiro").value : "",
        note: document.getElementById("note").value,
        righe: stato.righe.map(riga => ({
            prodotto: riga.prodotto,
            extra: riga.extra,
            senza: Array.isArray(riga.senza) ? riga.senza : []
        }))
    };
    try {
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
        mostraMessaggio(errore.message, "errore");
        invia.disabled = false;
    }
}
tabsCategorie.addEventListener("click", evento => {
    const tab = evento.target.closest(".tab[data-tab]");
    if (!tab || !tabsCategorie.contains(tab)) return;
    stato.categoria = tab.dataset.tab;
    tabsCategorie.querySelectorAll(".tab[data-tab]")
        .forEach(elemento => elemento.classList.toggle("active", elemento === tab));
    renderProdotti();
});
prodotti.addEventListener("pointerdown", evento => {
    if (evento.pointerType !== "mouse" || evento.button !== 0) return;
    trascinamentoProdotti = {
        inizioX: evento.clientX,
        scrollIniziale: prodotti.scrollLeft,
        iniziato: false
    };
});
document.addEventListener("pointermove", evento => {
    if (!trascinamentoProdotti) return;
    const spostamento = evento.clientX - trascinamentoProdotti.inizioX;
    if (!trascinamentoProdotti.iniziato && Math.abs(spostamento) < 5) return;
    trascinamentoProdotti.iniziato = true;
    prodotti.classList.add("is-dragging");
    prodotti.scrollLeft = trascinamentoProdotti.scrollIniziale - spostamento;
    evento.preventDefault();
});
function terminaTrascinamentoProdotti() {
    if (!trascinamentoProdotti) return;
    const trascinato = trascinamentoProdotti.iniziato;
    trascinamentoProdotti = null;
    prodotti.classList.remove("is-dragging");
    if (!trascinato) return;
    ignoraClickDopoTrascinamento = true;
    setTimeout(() => (ignoraClickDopoTrascinamento = false), 0);
}
document.addEventListener("pointerup", terminaTrascinamentoProdotti);
document.addEventListener("pointercancel", terminaTrascinamentoProdotti);
prodotti.addEventListener(
    "click",
    evento => {
        if (!ignoraClickDopoTrascinamento) return;
        evento.preventDefault();
        evento.stopImmediatePropagation();
    },
    true
);
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
    tipoOrdineCorrente = tipoOrdine.value;
    if (tipoOrdine.value !== "consegna") costoConsegna = 0;
    aggiornaTipoOrdine();
    aggiornaRicercaClienteAbituale();
    aggiornaRicercaClientiIndirizzo();
    renderRiepilogo();
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
selettoreRigaExtra.addEventListener("change", aggiornaGestioneExtra);
document.getElementById("applica-extra").addEventListener("click", () => {
    renderRiepilogo();
    mostraMessaggio("Extra aggiornati.", "successo");
});
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
document.addEventListener("keydown", evento => {
    intrappolaFocusNelRiepilogoSheet(evento);
    if (evento.key !== "Escape") return;
    if (!clientiIndirizzoRisultati.hidden) {
        chiudiRisultatiClientiIndirizzo();
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
