const stato = { categoria: "pizze", menu: [], extra: [], righe: [], extraSelezionati: [] };
const prodotti = document.getElementById("prodotti");
const riepilogo = document.getElementById("riepilogo-items");
const riepilogoConteggio = document.getElementById("riepilogo-conteggio");
const barraTotale = document.getElementById("barra-totale");
const barraConteggio = document.getElementById("barra-conteggio");
const riepilogoSheetBackdrop = document.getElementById("riepilogo-sheet-backdrop");
const riepilogoSheet = document.getElementById("riepilogo-sheet");
const riepilogoSheetTitolo = document.getElementById("riepilogo-sheet-titolo");
const riepilogoSheetHeader = document.querySelector(".riepilogo-sheet-header");
const riepilogoSheetLista = document.getElementById("riepilogo-sheet-items");
const mediaRiepilogoSheet = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
const barraConto = document.querySelector(".barra-conto");
const riepilogoSheetApri = document.querySelector(".barra-conto-dettagli");
let riepilogoSheetAperto = false;
let riepilogoSheetHistory = false;
let trascinamentoRiepilogo = null;
let trascinamentoChiusuraSheet = null;
let frameTrascinamentoRiepilogo = 0;
let frameTrascinamentoChiusuraSheet = 0;
let ignoraTapRiepilogoFino = 0;
let origineTapRiepilogo = false;
let posizioneScrollSheet = 0;
let posizioneStileCorpo = null;
let inertRipristino = [];
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
    aggiornaConteggioProdotti,
    controllaLimiteRighe
} = window.prodottiUI;
const etichetteCategorie = Object.fromEntries(
    [...document.querySelectorAll(".tab[data-tab]")].map(tab => [tab.dataset.tab, tab.textContent.trim()])
);
let costoConsegna = 0;
let statoMoltiplicatore = creaStatoMoltiplicatore();
let trascinamentoProdotti = null;
let ignoraClickDopoTrascinamento = false;

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
function renderProdotti() {
    sezioneExtra.hidden = !categoriaConExtra();
    prodotti.innerHTML = "";
    prodotti.scrollLeft = 0;
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
                ? `<span class="ingredienti-wrapper"><span class="ingredienti">${testoSicuro(descrizioneIngredienti)}</span></span>`
                : "";
            bottone.innerHTML = `<strong>${testoSicuro(prodotto.nome)}</strong><span class="prezzo-prodotto">${euro.format(Number(prodotto.prezzo))}</span>${ingredienti}`;
            if (descrizioneIngredienti) bottone.querySelector(".ingredienti").title = descrizioneIngredienti;
            bottone.addEventListener("click", () => aggiungiProdotto(prodotto));
            pagina.appendChild(bottone);
        });
        prodotti.appendChild(pagina);
    }
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
    renderRigheRiepilogo(riepilogo);
    renderRigheRiepilogo(riepilogoSheetLista);
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
        const descrizione = riga.ingredienti?.length
            ? `<small class="riepilogo-descrizione">${testoSicuro(riga.ingredienti.join(", "))}</small>`
            : "";
        const extra = riga.extra.length
            ? `<span>Extra: ${testoSicuro(nomiExtra(riga.extra).join(", "))}</span>`
            : "";
        voce.innerHTML = `<div><strong>${testoSicuro(riga.prodotto)}</strong>${descrizione}${extra}</div><button class="rimuovi" type="button" data-indice="${indice}">Rimuovi</button>`;
        contenitore.appendChild(voce);
    });
    if (!stato.righe.length) contenitore.innerHTML = "<p>Nessun prodotto selezionato</p>";
}
function rimuoviRigaRiepilogo(evento) {
    const pulsante = evento.target.closest(".rimuovi");
    if (!pulsante || !evento.currentTarget.contains(pulsante)) return;
    stato.righe.splice(Number(pulsante.dataset.indice), 1);
    renderRiepilogo();
}
function riepilogoSheetDisponibile() {
    return mediaRiepilogoSheet.matches;
}
function apriRiepilogoSheet(trascinamentoInCorso = false) {
    if (riepilogoSheetAperto || !riepilogoSheetDisponibile()) return;
    riepilogoSheetAperto = true;
    riepilogoSheetBackdrop.hidden = false;
    if (!trascinamentoInCorso) {
        riepilogoSheetBackdrop.classList.remove("is-dragging");
        riepilogoSheet.classList.remove("is-dragging");
        riepilogoSheetBackdrop.style.opacity = "";
        riepilogoSheet.style.transform = "";
        requestAnimationFrame(() => riepilogoSheetBackdrop.classList.add("is-open"));
    }
    posizioneScrollSheet = window.scrollY;
    posizioneStileCorpo = {
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width
    };
    document.body.style.position = "fixed";
    document.body.style.top = `-${posizioneScrollSheet}px`;
    document.body.style.width = "100%";
    document.body.classList.add("riepilogo-sheet-aperto");
    inertRipristino = [
        paginaPrincipale,
        document.querySelector("nav.app-bottom-nav"),
        document.querySelector(".app-sidebar")
    ]
        .filter(Boolean)
        .map(elemento => {
            const inert = elemento.inert;
            elemento.inert = true;
            return { elemento, inert };
        });
    riepilogoSheetApri.setAttribute("aria-expanded", "true");
    history.pushState({ ...(history.state || {}), riepilogoSheet: true }, "", location.href);
    riepilogoSheetHistory = true;
    riepilogoSheetTitolo.focus({ preventScroll: true });
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
function chiudiRiepilogoSheet(daCronologia = false, daTrascinamento = false) {
    if (!riepilogoSheetAperto) return;
    riepilogoSheetAperto = false;
    riepilogoSheetApri.setAttribute("aria-expanded", "false");
    if (daTrascinamento) {
        requestAnimationFrame(() => {
            riepilogoSheetBackdrop.classList.remove("is-dragging");
            riepilogoSheet.classList.remove("is-dragging");
            requestAnimationFrame(() => {
                riepilogoSheetBackdrop.classList.remove("is-open");
                riepilogoSheetBackdrop.style.opacity = "";
                riepilogoSheet.style.transform = "";
            });
        });
    } else {
        riepilogoSheetBackdrop.classList.remove("is-open", "is-dragging");
        riepilogoSheet.classList.remove("is-dragging");
        riepilogoSheetBackdrop.style.opacity = "";
        riepilogoSheet.style.transform = "";
    }
    document.body.classList.remove("riepilogo-sheet-aperto");
    document.body.style.position = posizioneStileCorpo.position;
    document.body.style.top = posizioneStileCorpo.top;
    document.body.style.width = posizioneStileCorpo.width;
    inertRipristino.forEach(({ elemento, inert }) => (elemento.inert = inert));
    inertRipristino = [];
    window.scrollTo(0, posizioneScrollSheet);
    riepilogoSheetApri.focus({ preventScroll: true });
    if (riepilogoSheetHistory && !daCronologia) history.back();
    riepilogoSheetHistory = false;
    const durata = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300;
    window.setTimeout(() => {
        if (!riepilogoSheetAperto) riepilogoSheetBackdrop.hidden = true;
    }, durata);
}
function avviaTrascinamentoRiepilogo(evento) {
    if (!riepilogoSheetDisponibile() || evento.button !== 0 || evento.target.closest("#btn-invia")) return;
    origineTapRiepilogo = !evento.target.closest("#btn-invia");
    riepilogoSheetBackdrop.hidden = false;
    const altezza = riepilogoSheet.getBoundingClientRect().height;
    riepilogoSheetBackdrop.classList.add("is-open", "is-dragging");
    riepilogoSheet.classList.add("is-dragging");
    trascinamentoRiepilogo = {
        pointerId: evento.pointerId,
        startY: evento.clientY,
        lastY: evento.clientY,
        lastTime: performance.now(),
        velocity: 0,
        moved: false,
        altezza,
        pendingY: evento.clientY
    };
    riepilogoSheet.style.transform = `translateY(${altezza}px)`;
    riepilogoSheetBackdrop.style.opacity = "0";
    barraConto.setPointerCapture(evento.pointerId);
}
function aggiornaTrascinamentoRiepilogo(evento) {
    if (!trascinamentoRiepilogo || evento.pointerId !== trascinamentoRiepilogo.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - trascinamentoRiepilogo.lastTime);
    trascinamentoRiepilogo.velocity = (evento.clientY - trascinamentoRiepilogo.lastY) / elapsed;
    trascinamentoRiepilogo.lastY = evento.clientY;
    trascinamentoRiepilogo.lastTime = now;
    trascinamentoRiepilogo.pendingY = evento.clientY;
    trascinamentoRiepilogo.moved ||= Math.abs(evento.clientY - trascinamentoRiepilogo.startY) > 8;
    if (frameTrascinamentoRiepilogo) return;
    frameTrascinamentoRiepilogo = requestAnimationFrame(() => {
        frameTrascinamentoRiepilogo = 0;
        const progresso = Math.max(
            0,
            Math.min(
                1,
                (trascinamentoRiepilogo.startY - trascinamentoRiepilogo.pendingY) /
                    trascinamentoRiepilogo.altezza
            )
        );
        riepilogoSheet.style.transform = `translateY(${trascinamentoRiepilogo.altezza * (1 - progresso)}px)`;
        riepilogoSheetBackdrop.style.opacity = String(progresso);
    });
}
function terminaTrascinamentoRiepilogo(evento) {
    if (!trascinamentoRiepilogo || evento.pointerId !== trascinamentoRiepilogo.pointerId) return;
    if (frameTrascinamentoRiepilogo) cancelAnimationFrame(frameTrascinamentoRiepilogo);
    frameTrascinamentoRiepilogo = 0;
    const trascinamento = trascinamentoRiepilogo;
    const distanza = trascinamento.startY - evento.clientY;
    trascinamento.pendingY = evento.clientY;
    const progresso = Math.max(0, Math.min(1, distanza / trascinamento.altezza));
    riepilogoSheet.style.transform = `translateY(${trascinamento.altezza * (1 - progresso)}px)`;
    riepilogoSheetBackdrop.style.opacity = String(progresso);
    const apri =
        evento.type !== "pointercancel" &&
        (distanza > trascinamento.altezza * 0.25 || trascinamento.velocity < -0.3);
    if (trascinamento.moved) {
        ignoraTapRiepilogoFino = Date.now() + 300;
        origineTapRiepilogo = false;
    }
    if (evento.type === "pointercancel") origineTapRiepilogo = false;
    trascinamentoRiepilogo = null;
    if (!trascinamento.moved) {
        riepilogoSheetBackdrop.classList.remove("is-open", "is-dragging");
        riepilogoSheet.classList.remove("is-dragging");
        riepilogoSheetBackdrop.style.opacity = "";
        riepilogoSheet.style.transform = "";
        riepilogoSheetBackdrop.hidden = true;
        return;
    }
    if (apri) {
        apriRiepilogoSheet(true);
        requestAnimationFrame(() => {
            riepilogoSheetBackdrop.classList.remove("is-dragging");
            riepilogoSheet.classList.remove("is-dragging");
            requestAnimationFrame(() => {
                riepilogoSheetBackdrop.style.opacity = "";
                riepilogoSheet.style.transform = "";
            });
        });
        return;
    }
    requestAnimationFrame(() => {
        riepilogoSheetBackdrop.classList.remove("is-dragging");
        riepilogoSheet.classList.remove("is-dragging");
        requestAnimationFrame(() => {
            riepilogoSheetBackdrop.classList.remove("is-open");
            riepilogoSheetBackdrop.style.opacity = "";
            riepilogoSheet.style.transform = "";
            window.setTimeout(() => {
                if (!riepilogoSheetAperto) riepilogoSheetBackdrop.hidden = true;
            }, 300);
        });
    });
}
function attivaRiepilogoSheetDaTastiera(evento) {
    if (!riepilogoSheetDisponibile()) return;
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    apriRiepilogoSheet();
}
function avviaTrascinamentoChiusuraSheet(evento) {
    if (evento.button !== 0 || evento.target.closest("button")) return;
    const altezza = riepilogoSheet.getBoundingClientRect().height;
    trascinamentoChiusuraSheet = {
        pointerId: evento.pointerId,
        startY: evento.clientY,
        lastY: evento.clientY,
        lastTime: performance.now(),
        velocity: 0,
        altezza,
        pendingY: evento.clientY
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
    trascinamentoChiusuraSheet.pendingY = evento.clientY;
    if (frameTrascinamentoChiusuraSheet) return;
    frameTrascinamentoChiusuraSheet = requestAnimationFrame(() => {
        frameTrascinamentoChiusuraSheet = 0;
        const trascinamento = trascinamentoChiusuraSheet;
        const progresso = Math.max(
            0,
            Math.min(
                1,
                (trascinamento.pendingY - trascinamento.startY) / trascinamento.altezza
            )
        );
        riepilogoSheet.style.transform = `translateY(${trascinamento.altezza * progresso}px)`;
        riepilogoSheetBackdrop.style.opacity = String(1 - progresso);
    });
    riepilogoSheet.classList.add("is-dragging");
    riepilogoSheetBackdrop.classList.add("is-dragging");
}
function terminaTrascinamentoChiusuraSheet(evento) {
    if (!trascinamentoChiusuraSheet || evento.pointerId !== trascinamentoChiusuraSheet.pointerId) return;
    if (frameTrascinamentoChiusuraSheet) cancelAnimationFrame(frameTrascinamentoChiusuraSheet);
    frameTrascinamentoChiusuraSheet = 0;
    const trascinamento = trascinamentoChiusuraSheet;
    const distanza = evento.clientY - trascinamento.startY;
    const progresso = Math.max(0, Math.min(1, distanza / trascinamento.altezza));
    riepilogoSheet.style.transform = `translateY(${trascinamento.altezza * progresso}px)`;
    riepilogoSheetBackdrop.style.opacity = String(1 - progresso);
    const chiudi =
        evento.type !== "pointercancel" &&
        (distanza > trascinamento.altezza * 0.25 || trascinamento.velocity > 0.3);
    trascinamentoChiusuraSheet = null;
    if (chiudi) {
        chiudiRiepilogoSheet(false, true);
        return;
    }
    requestAnimationFrame(() => {
        riepilogoSheet.classList.remove("is-dragging");
        riepilogoSheetBackdrop.classList.remove("is-dragging");
        requestAnimationFrame(() => {
            riepilogoSheet.style.transform = "";
            riepilogoSheetBackdrop.style.opacity = "";
        });
    });
}
function intrappolaFocusNelRiepilogoSheet(evento) {
    if (!riepilogoSheetAperto || evento.key !== "Tab") return;
    const elementi = [...riepilogoSheet.querySelectorAll("button:not(:disabled), [tabindex='0']")];
    if (!elementi.length) {
        evento.preventDefault();
        riepilogoSheetTitolo.focus();
        return;
    }
    const primo = elementi[0];
    const ultimo = elementi[elementi.length - 1];
    if (
        evento.shiftKey &&
        (document.activeElement === primo || document.activeElement === riepilogoSheetTitolo)
    ) {
        evento.preventDefault();
        ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primo.focus();
    }
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
riepilogo.addEventListener("click", rimuoviRigaRiepilogo);
riepilogoSheetLista.addEventListener("click", rimuoviRigaRiepilogo);
barraConto.addEventListener("pointerdown", avviaTrascinamentoRiepilogo);
barraConto.addEventListener("pointermove", aggiornaTrascinamentoRiepilogo);
barraConto.addEventListener("pointerup", terminaTrascinamentoRiepilogo);
barraConto.addEventListener("pointercancel", terminaTrascinamentoRiepilogo);
barraConto.addEventListener("click", evento => {
    const attivatoDalRiepilogo = riepilogoSheetApri.contains(evento.target) || origineTapRiepilogo;
    origineTapRiepilogo = false;
    if (!attivatoDalRiepilogo || evento.target.closest("#btn-invia") || Date.now() < ignoraTapRiepilogoFino) return;
    apriRiepilogoSheet();
});
riepilogoSheetApri.addEventListener("keydown", attivaRiepilogoSheetDaTastiera);
riepilogoSheetHeader.addEventListener("pointerdown", avviaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("pointermove", aggiornaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("pointerup", terminaTrascinamentoChiusuraSheet);
riepilogoSheetHeader.addEventListener("pointercancel", terminaTrascinamentoChiusuraSheet);
document.getElementById("riepilogo-sheet-chiudi").addEventListener("click", () =>
    chiudiRiepilogoSheet()
);
document.getElementById("riepilogo-sheet-invia").addEventListener("click", () => {
    chiudiRiepilogoSheet();
    apriConferma();
});
riepilogoSheetBackdrop.addEventListener("click", evento => {
    if (evento.target === riepilogoSheetBackdrop) chiudiRiepilogoSheet();
});
window.addEventListener("popstate", () => {
    if (riepilogoSheetAperto) chiudiRiepilogoSheet(true);
});
function aggiornaSheetAlCambioViewport() {
    if (riepilogoSheetAperto && !riepilogoSheetDisponibile()) chiudiRiepilogoSheet();
    aggiornaAccessibilitaBarraSheet();
}
window.addEventListener("resize", aggiornaSheetAlCambioViewport);
mediaRiepilogoSheet.addEventListener("change", aggiornaSheetAlCambioViewport);
aggiornaAccessibilitaBarraSheet();
document.getElementById("btn-annulla").addEventListener("click", () => {
    stato.righe = [];
    costoConsegna = 0;
    aggiornaBottoneCostoConsegna();
    renderRiepilogo();
    mostraMessaggio("Ordine annullato.", "");
});
document.addEventListener("keydown", evento => {
    intrappolaFocusNelRiepilogoSheet(evento);
    if (evento.key !== "Escape") return;
    if (riepilogoSheetAperto) chiudiRiepilogoSheet();
    else if (!ricercaModale.hidden) chiudiRicerca();
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
