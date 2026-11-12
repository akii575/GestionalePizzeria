const stato = { categoria: "pizze", menu: [], extra: [], righe: [], extraSelezionati: [] };
const prodotti = document.getElementById("prodotti");
const paginazioneProdotti = document.getElementById("paginazione-prodotti");
const paginaProdottiPrecedente = document.getElementById("pagina-prodotti-precedente");
const paginaProdottiSuccessiva = document.getElementById("pagina-prodotti-successiva");
const statoPaginazioneProdotti = document.getElementById("pagina-prodotti-stato");
const indicatoriProdotti = document.getElementById("indicatori-prodotti");
const riepilogo = document.getElementById("riepilogo-items");
const messaggio = document.getElementById("messaggio");
const invia = document.getElementById("btn-invia");
const sezioneExtra = document.getElementById("extra-section");
const tipoOrdine = document.getElementById("tipo-ordine");
const campoTavolo = document.getElementById("campo-tavolo");
const numeroPersone = document.getElementById("numero-persone");
const campoRitiro = document.getElementById("campo-ritiro");
const campiConsegna = document.getElementById("campi-consegna");
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
const {
    CATEGORIE_CON_EXTRA,
    filtraProdotti,
    creaRiga,
    creaStatoMoltiplicatore,
    premiTastoMoltiplicatore,
    quantitaDaApplicare,
    testoMoltiplicatore,
    controllaLimiteRighe
} = window.prodottiUI;
const etichetteCategorie = Object.fromEntries(
    [...document.querySelectorAll(".tab[data-tab]")].map(tab => [tab.dataset.tab, tab.textContent.trim()])
);
let costoConsegna = 0;
let statoMoltiplicatore = creaStatoMoltiplicatore();
let paginaProdottiCorrente = 0;
let numeroPagineProdotti = 0;

function categoriaConExtra() {
    return CATEGORIE_CON_EXTRA.includes(stato.categoria);
}
function mostraMessaggio(testo, classe) {
    messaggio.textContent = testo;
    messaggio.className = classe;
}
function testoSicuro(valore) {
    const elemento = document.createElement("span");
    elemento.textContent = valore == null ? "" : valore;
    return elemento.innerHTML;
}
function oraLocale() {
    const adesso = new Date();
    return `${String(adesso.getHours()).padStart(2, "0")}:${String(adesso.getMinutes()).padStart(2, "0")}`;
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
    aggiornaBottoneCostoConsegna();
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
    return stato.righe.reduce((totale, riga) => totale + prezzoRiga(riga), 0) + costoConsegna;
}
function renderExtra(container, selezionati, onChange) {
    container.innerHTML = "";
    stato.extra.forEach(extra => {
        const bottone = document.createElement("button");
        bottone.type = "button";
        bottone.className = "extra-card";
        bottone.classList.toggle(
            "selezionato",
            selezionati.some(elemento => elemento.id === extra.id)
        );
        bottone.innerHTML = `<strong>${extra.nome}</strong><span>${euro.format(Number(extra.prezzo))}</span>`;
        bottone.addEventListener("click", () => {
            const presenti = selezionati.some(elemento => elemento.id === extra.id);
            selezionati = presenti ? selezionati.filter(elemento => elemento.id !== extra.id) : [...selezionati, extra];
            onChange(selezionati);
            renderExtra(container, selezionati, onChange);
        });
        container.appendChild(bottone);
    });
}
function aggiornaIndicatoriProdotti() {
    const haPiuPagine = numeroPagineProdotti > 1;
    paginazioneProdotti.hidden = !haPiuPagine;
    indicatoriProdotti.hidden = !haPiuPagine;
    statoPaginazioneProdotti.textContent = numeroPagineProdotti
        ? `Pagina ${paginaProdottiCorrente + 1} di ${numeroPagineProdotti}`
        : "";
    paginaProdottiPrecedente.disabled = !haPiuPagine || paginaProdottiCorrente === 0;
    paginaProdottiSuccessiva.disabled =
        !haPiuPagine || paginaProdottiCorrente === numeroPagineProdotti - 1;
    [...indicatoriProdotti.children].forEach((indicatore, indice) => {
        indicatore.classList.toggle("attivo", indice === paginaProdottiCorrente);
        if (indice === paginaProdottiCorrente) indicatore.setAttribute("aria-current", "page");
        else indicatore.removeAttribute("aria-current");
    });
}
function vaiAllaPaginaProdotti(indice) {
    if (!numeroPagineProdotti) return;
    paginaProdottiCorrente = Math.max(0, Math.min(indice, numeroPagineProdotti - 1));
    aggiornaIndicatoriProdotti();
    prodotti.scrollTo({
        left: paginaProdottiCorrente * prodotti.clientWidth,
        behavior: "smooth"
    });
}
function aggiornaPaginaProdottiDaScroll() {
    if (!prodotti.clientWidth || numeroPagineProdotti < 2) return;
    const indice = Math.max(
        0,
        Math.min(numeroPagineProdotti - 1, Math.round(prodotti.scrollLeft / prodotti.clientWidth))
    );
    if (indice === paginaProdottiCorrente) return;
    paginaProdottiCorrente = indice;
    aggiornaIndicatoriProdotti();
}
function creaIndicatoriProdotti() {
    indicatoriProdotti.innerHTML = "";
    for (let indice = 0; indice < numeroPagineProdotti; indice++) {
        const indicatore = document.createElement("button");
        indicatore.type = "button";
        indicatore.className = "indicatore-pagina-prodotto";
        indicatore.setAttribute("aria-label", `Vai alla pagina ${indice + 1}`);
        indicatore.title = `Vai alla pagina ${indice + 1}`;
        indicatore.addEventListener("click", () => vaiAllaPaginaProdotti(indice));
        indicatoriProdotti.appendChild(indicatore);
    }
}
function renderProdotti() {
    sezioneExtra.hidden = !categoriaConExtra();
    prodotti.innerHTML = "";
    prodotti.scrollLeft = 0;
    paginaProdottiCorrente = 0;
    const disponibili = stato.menu
        .filter(prodotto => prodotto.categoria === stato.categoria)
        .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    for (let inizio = 0; inizio < disponibili.length; inizio += 9) {
        const pagina = document.createElement("div");
        pagina.className = "pagina-prodotti";
        disponibili.slice(inizio, inizio + 9).forEach(prodotto => {
            const bottone = document.createElement("button");
            bottone.className = "prodotto-btn";
            bottone.type = "button";
            const descrizioneIngredienti = prodotto.ingredienti?.length ? prodotto.ingredienti.join(", ") : "";
            const ingredienti = descrizioneIngredienti
                ? `<span class="ingredienti">${testoSicuro(descrizioneIngredienti)}</span>`
                : "";
            bottone.innerHTML = `<strong>${testoSicuro(prodotto.nome)}</strong><span class="prezzo-prodotto">${euro.format(Number(prodotto.prezzo))}</span>${ingredienti}`;
            if (descrizioneIngredienti) bottone.querySelector(".ingredienti").title = descrizioneIngredienti;
            bottone.addEventListener("click", () => aggiungiProdotto(prodotto));
            pagina.appendChild(bottone);
        });
        prodotti.appendChild(pagina);
    }
    numeroPagineProdotti = Math.ceil(disponibili.length / 9);
    creaIndicatoriProdotti();
    aggiornaIndicatoriProdotti();
}
// Unico punto di aggiunta al conto: usato dalle tab delle categorie e dalla ricerca.
function aggiungiProdotto(prodotto) {
    const limite = controllaLimiteRighe(stato.righe.length, 1);
    if (!limite.consentito) {
        mostraMessaggio(`Massimo 100 prodotti per comanda: puoi aggiungerne ancora ${limite.disponibili}`, "errore");
        return false;
    }
    const { riga, extraRimanenti } = creaRiga(prodotto, stato.extraSelezionati);
    stato.righe.push(riga);
    stato.extraSelezionati = extraRimanenti;
    renderExtra(
        document.getElementById("extra-lista"),
        stato.extraSelezionati,
        selezionati => (stato.extraSelezionati = selezionati)
    );
    renderRiepilogo();
    return true;
}
function aggiornaDisplayMoltiplicatore() {
    ricercaMoltiplicatore.textContent = testoMoltiplicatore(statoMoltiplicatore);
    ricercaMoltiplicatore.classList.toggle("armato", statoMoltiplicatore.armato);
}
function renderRisultatiRicerca() {
    const testo = ricercaInput.value;
    const trovati = filtraProdotti(stato.menu, testo);
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
        bottone.innerHTML = `<span class="ricerca-nome">${testoSicuro(prodotto.nome)}</span><span class="ricerca-categoria">${testoSicuro(etichetteCategorie[prodotto.categoria] || prodotto.categoria)}</span><span class="ricerca-prezzo">${euro.format(Number(prodotto.prezzo))}</span>`;
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
            // Gli extra non applicabili (es. a una bibita) restano in attesa: lo segnaliamo.
            const extraInAttesa = stato.extraSelezionati.length
                ? ` (extra in attesa per il prossimo piatto: ${nomiExtra(stato.extraSelezionati).join(", ")})`
                : "";
            const descrizioneAggiunta = moltiplicatoreArmato
                ? `Aggiunti ${quantita} × ${prodotto.nome}`
                : `Aggiunto: ${prodotto.nome}`;
            mostraMessaggio(`${descrizioneAggiunta}${extraInAttesa}`, "successo");
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
    const modificabile = riga && CATEGORIE_CON_EXTRA.includes(riga.categoria);
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
    riepilogo.innerHTML = "";
    stato.righe.forEach((riga, indice) => {
        const voce = document.createElement("div");
        voce.className = "riepilogo-item";
        const descrizione = riga.ingredienti?.length
            ? `<small class="riepilogo-descrizione">${testoSicuro(riga.ingredienti.join(", "))}</small>`
            : "";
        voce.innerHTML = `<div><strong>${testoSicuro(riga.prodotto)}</strong>${descrizione}<span>${riga.extra.length ? `Extra: ${testoSicuro(nomiExtra(riga.extra).join(", "))}` : "Nessun extra"}</span></div><button class="rimuovi" type="button" data-indice="${indice}">Rimuovi</button>`;
        riepilogo.appendChild(voce);
    });
    if (!stato.righe.length) riepilogo.innerHTML = "<p>Nessun prodotto selezionato</p>";
    riepilogo.querySelectorAll(".rimuovi").forEach(button =>
        button.addEventListener("click", () => {
            stato.righe.splice(Number(button.dataset.indice), 1);
            renderRiepilogo();
        })
    );
    document.getElementById("riepilogo-totale").textContent = `Totale: ${euro.format(totaleOrdine())}`;
    invia.disabled = !stato.righe.length;
    aggiornaSelettoreRighe();
}
function apriConferma() {
    if (!stato.righe.length) return;
    const consegna = tipoOrdine.value === "consegna";
    const ritiro = tipoOrdine.value === "ritiro";
    if (
        tipoOrdine.value === "tavolo" &&
        (!document.getElementById("tavolo").reportValidity() || !numeroPersone.reportValidity())
    )
        return;
    if (tipoOrdine.value === "ritiro") {
        for (const id of ["cliente-ritiro", "telefono-ritiro"]) {
            if (!document.getElementById(id).reportValidity()) return;
        }
        if (tipoOrdine.value === "banco" && !document.getElementById("cognome-banco").reportValidity()) return;
    }
    if (tipoOrdine.value === "consegna") {
        for (const id of ["indirizzo-consegna", "telefono-consegna"]) {
            if (!document.getElementById(id).reportValidity()) return;
        }
    }
    if (tipoOrdine.value !== "tavolo" && !orario.reportValidity()) return;
    const dettagliServizio =
        tipoOrdine.value === "consegna"
            ? `<div class="conferma-consegna"><strong>Consegna</strong><span>${testoSicuro(document.getElementById("indirizzo-consegna").value.trim())}</span><span>${testoSicuro(document.getElementById("telefono-consegna").value.trim())}</span></div>`
            : tipoOrdine.value === "ritiro"
              ? `<div class="conferma-consegna"><strong>Ritiro: ${testoSicuro(document.getElementById("cliente-ritiro").value.trim())}</strong><span>${testoSicuro(document.getElementById("telefono-ritiro").value.trim())}</span></div>`
              : tipoOrdine.value === "banco"
                ? `<div class="conferma-consegna"><strong>Banco · ${testoSicuro(document.getElementById("cognome-banco").value.trim())}</strong></div>`
                : `<div class="conferma-consegna"><strong>${testoSicuro(document.getElementById("tavolo").value)} · ${testoSicuro(numeroPersone.value)} persone</strong></div>`;
    const dettaglioOrario =
        tipoOrdine.value === "tavolo"
            ? ""
            : `<div class="conferma-consegna"><span>Orario richiesto: ${testoSicuro(orario.value)}</span>${ritiro ? `<span>Pagamento: ${testoSicuro(pagamentoRitiro.selectedOptions[0].textContent)}</span>` : consegna ? `<span>Pagamento: ${testoSicuro(pagamentoConsegna.selectedOptions[0].textContent)}</span>` : ""}</div>`;
    const dettaglioCostoConsegna =
        consegna && costoConsegna
            ? `<div class="conferma-consegna"><span>Costo consegna</span><strong>${euro.format(costoConsegna)}</strong></div>`
            : "";
    confermaRiepilogo.innerHTML =
        dettagliServizio +
        dettaglioOrario +
        dettaglioCostoConsegna +
        stato.righe
            .map(riga => {
                const extra = nomiExtra(riga.extra)
                    .map(nome => {
                        const dato = stato.extra.find(item => item.nome === nome);
                        return `${testoSicuro(nome)} (${euro.format(Number(dato?.prezzo || 0))})`;
                    })
                    .join(", ");
                return `<div class="conferma-riga"><strong>${testoSicuro(riga.prodotto)} - ${euro.format(Number(riga.prezzo))}</strong>${riga.ingredienti?.length ? `<span>${testoSicuro(riga.ingredienti.join(", "))}</span>` : ""}${extra ? `<span>Extra: ${extra}</span>` : ""}<span>Totale riga: ${euro.format(prezzoRiga(riga))}</span></div>`;
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
    try {
        const risposta = await fetch("/api/ordini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
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
                righe: stato.righe.map(riga => ({ prodotto: riga.prodotto, extra: riga.extra }))
            })
        });
        const dati = await risposta.json();
        if (!risposta.ok) throw new Error(dati.errore || "Invio non riuscito.");
        mostraMessaggio(
            `Ordine #${dati.numero} salvato. ${dati.messaggioStampa}`,
            dati.stampaCompletata || dati.stampaInCoda ? "successo" : "errore"
        );
        stato.righe = [];
        costoConsegna = 0;
        aggiornaBottoneCostoConsegna();
        document.getElementById("note").value = "";
        document.getElementById("cliente-ritiro").value = "";
        document.getElementById("telefono-ritiro").value = "";
        document.getElementById("cognome-banco").value = "";
        document.getElementById("indirizzo-consegna").value = "";
        document.getElementById("telefono-consegna").value = "";
        orario.value = oraLocale();
        pagamentoRitiro.value = "non_pagato";
        pagamentoConsegna.value = "non_pagato";
        renderRiepilogo();
    } catch (errore) {
        mostraMessaggio(errore.message, "errore");
        invia.disabled = false;
    }
}
document.querySelectorAll(".tab[data-tab]").forEach(tab =>
    tab.addEventListener("click", () => {
        stato.categoria = tab.dataset.tab;
        document
            .querySelectorAll(".tab[data-tab]")
            .forEach(elemento => elemento.classList.toggle("active", elemento === tab));
        renderProdotti();
    })
);
paginaProdottiPrecedente.addEventListener("click", () => vaiAllaPaginaProdotti(paginaProdottiCorrente - 1));
paginaProdottiSuccessiva.addEventListener("click", () => vaiAllaPaginaProdotti(paginaProdottiCorrente + 1));
prodotti.addEventListener("scroll", aggiornaPaginaProdottiDaScroll, { passive: true });
prodotti.addEventListener(
    "wheel",
    evento => {
        if (evento.deltaX || !evento.deltaY) return;
        const scrollMassimo = prodotti.scrollWidth - prodotti.clientWidth;
        const prossimaPosizione = prodotti.scrollLeft + evento.deltaY;
        if (prossimaPosizione <= 0 || prossimaPosizione >= scrollMassimo) return;
        prodotti.scrollLeft = prossimaPosizione;
        evento.preventDefault();
    },
    { passive: false }
);
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
    if (tipoOrdine.value !== "consegna") costoConsegna = 0;
    aggiornaTipoOrdine();
    renderRiepilogo();
});
bottoneCostoConsegna.addEventListener("click", () => {
    costoConsegna = costoConsegna === 2 ? 0 : 2;
    aggiornaBottoneCostoConsegna();
    renderRiepilogo();
});
orario.value = oraLocale();
aggiornaTipoOrdine();
selettoreRigaExtra.addEventListener("change", aggiornaGestioneExtra);
document.getElementById("applica-extra").addEventListener("click", () => {
    renderRiepilogo();
    mostraMessaggio("Extra aggiornati.", "successo");
});
invia.addEventListener("click", apriConferma);
document.getElementById("conferma-invio").addEventListener("click", inviaOrdine);
document.getElementById("annulla-invio").addEventListener("click", chiudiConferma);
document.getElementById("btn-annulla").addEventListener("click", () => {
    stato.righe = [];
    costoConsegna = 0;
    aggiornaBottoneCostoConsegna();
    renderRiepilogo();
    mostraMessaggio("Ordine annullato.", "");
});
document.addEventListener("keydown", evento => {
    if (evento.key !== "Escape") return;
    if (!ricercaModale.hidden) chiudiRicerca();
    else if (!confermaModale.hidden) chiudiConferma();
});
Promise.all([fetch("/api/menu"), fetch("/api/extra")])
    .then(async risposte => {
        stato.menu = await risposte[0].json();
        stato.extra = (await risposte[1].json()).sort((primo, secondo) =>
            primo.nome.localeCompare(secondo.nome, "it", { sensitivity: "base" })
        );
        renderExtra(
            document.getElementById("extra-lista"),
            stato.extraSelezionati,
            selezionati => (stato.extraSelezionati = selezionati)
        );
        renderProdotti();
        // Se la ricerca è stata aperta prima che il menu arrivasse, aggiorna i risultati.
        if (!ricercaModale.hidden) renderRisultatiRicerca();
    })
    .catch(errore => mostraMessaggio(errore.message, "errore"));
