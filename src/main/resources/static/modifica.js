const numero = new URLSearchParams(window.location.search).get("numero");
const righe = document.getElementById("righe");
const conteggioModifica = document.getElementById("conteggio-modifica");
const { aggiornaConteggioProdotti } = window.prodottiUI;
const { escapeHtml } = window.htmlUtils;
let menu = [];
let extra = [];
let costoConsegna = 0;
let prodottoCoperto = null;
let copertoOrdine = null;
let tipoOrdineOriginale = null;
let numeroPersoneOriginale = null;
let ordineCaricato = null;
const bottoneCostoConsegna = document.getElementById("btn-costo-consegna");
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const { isCoperto, calcolaCoperto, nomeTavoloDaNumero, numeroTavoloDaNome } = window.prodottiUI;
const stato = testo => (document.getElementById("stato").textContent = testo);
function oraLocale() {
    const adesso = new Date();
    return `${String(adesso.getHours()).padStart(2, "0")}:${String(adesso.getMinutes()).padStart(2, "0")}`;
}
function aggiornaBottoneCostoConsegna() {
    const attivo = costoConsegna === 2;
    bottoneCostoConsegna.hidden = document.getElementById("tipo-ordine").value !== "consegna";
    bottoneCostoConsegna.setAttribute("aria-pressed", String(attivo));
    bottoneCostoConsegna.textContent = attivo ? "Rimuovi costo consegna (2,00 €)" : "Aggiungi costo consegna (+2,00 €)";
}
function riferimentoExtra(elemento) {
    const nome = typeof elemento === "string" ? elemento : elemento?.nome;
    const id = typeof elemento === "string" ? "" : elemento?.id;
    return extra.find(item => (id && item.id === id) || item.nome === nome)
        || (typeof elemento === "string" ? undefined : elemento);
}
function copertoCorrente() {
    const tipo = document.getElementById("tipo-ordine").value;
    const numeroPersone = Number(document.getElementById("numero-persone").value);
    const invariato = tipo === tipoOrdineOriginale && numeroPersone === numeroPersoneOriginale;
    if (invariato && Number(copertoOrdine?.prezzoUnitario) > 0) {
        return calcolaCoperto(tipo, numeroPersone, copertoOrdine.prezzoUnitario);
    }
    if (!prodottoCoperto || prodottoCoperto.disponibile === false || prodottoCoperto.archiviato === true) return null;
    const prezzo = prodottoCoperto.prezzo;
    return calcolaCoperto(tipo, numeroPersone, prezzo);
}
function aggiornaTotale() {
    const righeOrdine = Array.from(document.querySelectorAll(".riga-edit"));
    const totaleRighe = righeOrdine.reduce((somma, riga) => {
        const prodotto = menu.find(item => item.nome === riga.querySelector(".prodotto")?.value);
        const selezionati = JSON.parse(riga.querySelector(".extra-selezionati")?.dataset.extra || "[]");
        return (
            somma +
            Number(prodotto?.prezzo || 0) +
            selezionati.reduce((extraTotale, item) => extraTotale + Number(item.prezzo || 0), 0)
        );
    }, 0);
    const coperto = copertoCorrente();
    const totale = totaleRighe
        + (document.getElementById("tipo-ordine").value === "consegna" ? costoConsegna : 0)
        + (coperto?.totale || 0);
    const riepilogoCoperto = document.getElementById("coperto-modifica");
    const copertoVisibile = coperto
        && prodottoCoperto
        && prodottoCoperto.disponibile !== false
        && prodottoCoperto.archiviato !== true;
    riepilogoCoperto.hidden = !copertoVisibile;
    riepilogoCoperto.textContent = copertoVisibile
        ? `Coperto ${coperto.persone} × ${euro.format(coperto.prezzoUnitario)} = ${euro.format(coperto.totale)}`
        : "";
    document.getElementById("totale-modifica").textContent = `Totale: ${euro.format(totale)}`;
    aggiornaConteggioProdotti(conteggioModifica, righeOrdine.length);
}
function aggiornaCampiConsegna() {
    const tipo = document.getElementById("tipo-ordine").value;
    const consegna = tipo === "consegna";
    const tavolo = tipo === "tavolo";
    const ritiro = tipo === "ritiro";
    const banco = tipo === "banco";
    const orario = document.getElementById("orario");
    document.getElementById("campo-banco").hidden = !banco;
    const destinazione = document.getElementById("tavolo");
    const numeroTavolo = document.getElementById("numero-tavolo");
    document.getElementById("campo-numero-tavolo").hidden = !tavolo;
    document.getElementById("destinazione-label").hidden = !ritiro;
    document.getElementById("campo-persone").hidden = !tavolo;
    numeroTavolo.required = tavolo;
    destinazione.required = ritiro;
    document.getElementById("campi-ritiro").hidden = !ritiro;
    document.getElementById("campi-consegna").hidden = !consegna;
    document.getElementById("campo-orario").hidden = tavolo;
    document.getElementById("campo-pagamento").hidden = !ritiro && !consegna;
    document.querySelector('#stato-pagamento option[value="pos"]').hidden = !consegna;
    orario.required = !tavolo;
    document.getElementById("numero-persone").required = tavolo;
    document.getElementById("telefono-ritiro").required = ritiro;
    document.getElementById("cognome-banco").required = banco;
    document.getElementById("indirizzo-consegna").required = consegna;
    document.getElementById("telefono-consegna").required = consegna;
    aggiornaBottoneCostoConsegna();
}
function renderExtraSelezionati(container, selezionati, onChange) {
    container.innerHTML = "";
    container.dataset.extra = JSON.stringify(selezionati);
    selezionati.forEach(item => {
        const card = document.createElement("article");
        card.className = "extra-card extra-selezionato";
        card.innerHTML = `<strong>${escapeHtml(item.nome)}</strong><span>${escapeHtml(euro.format(Number(item.prezzo)))}</span><button type="button" class="extra-rimuovi">Rimuovi</button>`;
        card.querySelector(".extra-rimuovi").onclick = () => {
            onChange(selezionati.filter(selected => selected.id !== item.id));
        };
        container.appendChild(card);
    });
}
function opzioniExtra(selezionati) {
    const container = document.createElement("div");
    container.className = "extra-selettore";
    const label = document.createElement("label");
    label.textContent = "Extra";
    const select = document.createElement("select");
    select.className = "extra-aggiungi";
    select.innerHTML = '<option value="">Seleziona un extra</option>';
    const lista = document.createElement("div");
    lista.className = "extra-selezionati";
    function aggiorna(nuoviSelezionati) {
        selezionati = nuoviSelezionati;
        renderExtraSelezionati(lista, selezionati, aggiorna);
        select.innerHTML = '<option value="">Seleziona un extra</option>';
        extra
            .filter(item => item.disponibile !== false
                && !selezionati.some(selected => selected.id === item.id))
            .forEach(item => {
                const opzione = document.createElement("option");
                opzione.value = item.id;
                opzione.textContent = `${item.nome} - ${euro.format(Number(item.prezzo))}`;
                select.appendChild(opzione);
            });
        select.value = "";
        aggiornaTotale();
    }
    select.addEventListener("change", () => {
        const scelto = extra.find(item => item.id === select.value);
        if (scelto) aggiorna([...selezionati, scelto]);
    });
    label.appendChild(select);
    container.append(label, lista);
    aggiorna(selezionati);
    return container;
}
function rigaEdit(riga = { prodotto: menu[0]?.nome || "", extra: [] }) {
    const div = document.createElement("div");
    div.className = "riga-edit";
    const prodottoMenu = menu.find(p => p.nome === riga.prodotto);
    riga.ingredienti = riga.ingredienti || prodottoMenu?.ingredienti || [];
    const senza = Array.isArray(riga.senza) ? riga.senza : [];
    div.dataset.senza = JSON.stringify(senza);
    const extraSelezionati = riga.extra.map(riferimentoExtra).filter(Boolean);
    div.innerHTML = `<label>Prodotto<select class="prodotto">${menu.map(p => `<option value="${escapeHtml(p.nome)}" ${p.nome === riga.prodotto ? "selected" : ""} ${p.disponibile === false && p.nome !== riga.prodotto ? "disabled" : ""}>${escapeHtml(p.nome)}${p.disponibile === false ? " (Esaurito)" : ""}</option>`).join("")}</select><small class="prodotto-ingredienti"></small><small class="prodotto-senza"></small></label><div class="extra-editor" ${prodottoMenu?.ammetteExtra === true ? "" : "hidden"}></div><button class="rimuovi" type="button">Rimuovi</button>`;
    const extraEditor = div.querySelector(".extra-editor");
    const descrizione = div.querySelector(".prodotto-ingredienti");
    const senzaDescrizione = div.querySelector(".prodotto-senza");
    function aggiornaDescrizione(prodotto, ingredientiSenza) {
        descrizione.textContent = prodotto?.ingredienti?.length ? prodotto.ingredienti.join(", ") : "";
        senzaDescrizione.textContent = ingredientiSenza.length
            ? `senza ${ingredientiSenza.join(", ")}`
            : "";
    }
    aggiornaDescrizione(prodottoMenu, senza);
    if (!extraEditor.hidden) extraEditor.appendChild(opzioniExtra(extraSelezionati));
    div.querySelector(".rimuovi").onclick = () => {
        div.remove();
        aggiornaTotale();
    };
    div.querySelector(".prodotto").onchange = event => {
        const nuovo = menu.find(p => p.nome === event.target.value);
        div.dataset.senza = "[]";
        aggiornaDescrizione(nuovo, []);
        extraEditor.hidden = nuovo?.ammetteExtra !== true || nuovo.disponibile === false;
        extraEditor.innerHTML = "";
        if (!extraEditor.hidden) extraEditor.appendChild(opzioniExtra([]));
        aggiornaTotale();
    };
    righe.appendChild(div);
    aggiornaTotale();
}
function applicaMenu(menuNuovo, extraNuovi) {
    menu = menuNuovo;
    prodottoCoperto = menu.find(prodotto => isCoperto(prodotto)) || null;
    menu = menu.filter(prodotto => !isCoperto(prodotto));
    extra = extraNuovi.sort((primo, secondo) =>
        primo.nome.localeCompare(secondo.nome, "it", { sensitivity: "base" })
    );
    if (ordineCaricato) {
        const righeCorrenti = Array.from(righe.querySelectorAll(".riga-edit")).map(div => ({
            prodotto: div.querySelector(".prodotto").value,
            extra: JSON.parse(div.querySelector(".extra-selezionati")?.dataset.extra || "[]"),
            senza: JSON.parse(div.dataset.senza || "[]")
        }));
        righe.replaceChildren();
        righeCorrenti.forEach(rigaEdit);
        aggiornaTotale();
    }
}
async function recuperaMenu() {
    const risposte = await Promise.all([fetch("/api/menu"), fetch("/api/extra")]);
    if (risposte.some(risposta => !risposta.ok)) throw new Error("Menu non disponibile.");
    const [menuRisposta, extraRisposta] = await Promise.all(risposte.map(risposta => risposta.json()));
    const versioneMenu = risposte[0].headers.get("X-Menu-Version");
    const versioneExtra = risposte[1].headers.get("X-Menu-Version");
    return {
        menu: menuRisposta,
        extra: extraRisposta,
        versione: versioneMenu !== null && versioneMenu === versioneExtra ? Number(versioneMenu) : null
    };
}
function mostraOrdine(ordine) {
    ordineCaricato = ordine;
    document.getElementById("numero").textContent = `#${ordine.numero}`;
    document.getElementById("tipo-ordine").value =
        ordine.tipo === "consegna"
            ? "consegna"
            : ordine.tipo === "banco"
              ? "banco"
              : ordine.tipo === "ritiro"
                ? "ritiro"
                : "tavolo";
    tipoOrdineOriginale = ordine.tipo === "sala" ? "tavolo" : ordine.tipo || "tavolo";
    document.getElementById("tavolo").value = ordine.tipo === "ritiro" ? ordine.tavoloOCliente || "" : "";
    document.getElementById("numero-tavolo").value =
        ordine.tipo === "consegna" || ordine.tipo === "banco"
            ? ""
            : numeroTavoloDaNome(ordine.tavoloOCliente);
    document.getElementById("numero-persone").value =
        Number.isInteger(ordine.numeroPersone) && ordine.numeroPersone > 0 ? ordine.numeroPersone : 1;
    numeroPersoneOriginale = Number(document.getElementById("numero-persone").value);
    copertoOrdine = ordine.coperto || null;
    const righeCopertoLegacy = ordine.righe.filter(riga => isCoperto({ nome: riga.prodotto }));
    if (!copertoOrdine && tipoOrdineOriginale === "tavolo" && righeCopertoLegacy.length) {
        const totaleCopertoLegacy = righeCopertoLegacy.reduce(
            (totale, riga) => totale + Number(riga.totale ?? riga.prezzoBase ?? 0),
            0
        );
        const prezzoLegacy = totaleCopertoLegacy / numeroPersoneOriginale;
        copertoOrdine = calcolaCoperto("tavolo", numeroPersoneOriginale, prezzoLegacy);
    }
    document.getElementById("indirizzo-consegna").value = ordine.indirizzoConsegna || "";
    document.getElementById("telefono-consegna").value = ordine.telefonoConsegna || "";
    document.getElementById("telefono-ritiro").value = ordine.telefonoRitiro || "";
    document.getElementById("cognome-banco").value = ordine.cognomeBanco || "";
    document.getElementById("note").value = ordine.note || "";
    document.getElementById("orario").value = ordine.tipo === "tavolo" ? "" : ordine.orario || oraLocale();
    document.getElementById("stato-pagamento").value = ordine.statoPagamento || "";
    costoConsegna = Number(ordine.costoConsegna) === 2 ? 2 : 0;
    aggiornaCampiConsegna();
    ordine.righe.filter(riga => !isCoperto({ nome: riga.prodotto })).forEach(rigaEdit);
    aggiornaTotale();
}
async function recuperaOrdine() {
    const risposta = await fetch("/api/ordini");
    const dati = await risposta.json();
    if (!risposta.ok) throw new Error(dati.errore || "Impossibile caricare l'ordine.");
    const ordine = dati.ordini.find(o => String(o.numero) === String(numero));
    if (!ordine) throw new Error("Ordine non trovato.");
    return ordine;
}
async function avvia() {
    const caricamentoMenu = window.prodottiUI.caricaMenuConCache(recuperaMenu, applicaMenu);
    caricamentoMenu.aggiornamento.catch(errore => {
        if (!caricamentoMenu.cache) stato(errore.message);
    });
    try {
        const ordine = caricamentoMenu.cache
            ? await recuperaOrdine()
            : (await Promise.all([caricamentoMenu.aggiornamento, recuperaOrdine()]))[1];
        mostraOrdine(ordine);
    } catch (errore) {
        stato(errore.message);
    }
}
document.getElementById("aggiungi").onclick = () => rigaEdit();
document.getElementById("tipo-ordine").addEventListener("change", () => {
    const tipo = document.getElementById("tipo-ordine").value;
    const statoPagamento = document.getElementById("stato-pagamento");
    if (tipo !== "consegna") costoConsegna = 0;
    if (tipo !== "consegna" && statoPagamento.value === "pos") {
        statoPagamento.value = "non_pagato";
    }
    if (["ritiro", "consegna"].includes(tipo) && !statoPagamento.value) {
        statoPagamento.value = "non_pagato";
    }
    aggiornaCampiConsegna();
    aggiornaTotale();
});
document.getElementById("numero-persone").addEventListener("input", aggiornaTotale);
bottoneCostoConsegna.addEventListener("click", () => {
    costoConsegna = costoConsegna === 2 ? 0 : 2;
    aggiornaBottoneCostoConsegna();
    aggiornaTotale();
});
document.getElementById("salva").onclick = async () => {
    const pulsante = document.getElementById("salva");
    const tipo = document.getElementById("tipo-ordine").value;
    const consegna = tipo === "consegna";
    const tavolo = tipo === "tavolo";
    const ritiro = tipo === "ritiro";
    const banco = tipo === "banco";
    if (!tavolo && !document.getElementById("orario").reportValidity()) return;
    if (banco && !document.getElementById("cognome-banco").reportValidity()) return;
    const destinazione = document.getElementById("tavolo");
    const numeroTavolo = document.getElementById("numero-tavolo");
    if (tavolo && !numeroTavolo.reportValidity()) return;
    if (ritiro && !destinazione.reportValidity()) return;
    if (ritiro && !document.getElementById("telefono-ritiro").reportValidity()) return;
    if (tavolo && !document.getElementById("numero-persone").reportValidity()) return;
    if (
        consegna &&
        (!document.getElementById("indirizzo-consegna").reportValidity() ||
            !document.getElementById("telefono-consegna").reportValidity())
    )
        return;
    pulsante.disabled = true;
    stato("Salvataggio in corso...");
    const payload = {
        tipo,
        orario: tavolo ? "" : document.getElementById("orario").value,
        statoPagamento: ritiro || consegna ? document.getElementById("stato-pagamento").value || null : null,
        cognomeBanco: banco ? document.getElementById("cognome-banco").value : "",
        tavoloOCliente: tavolo
            ? nomeTavoloDaNumero(numeroTavolo.value)
            : ritiro
              ? destinazione.value
              : "",
        numeroPersone: tavolo ? Number(document.getElementById("numero-persone").value) : null,
        indirizzoConsegna: consegna ? document.getElementById("indirizzo-consegna").value : "",
        telefonoConsegna: consegna ? document.getElementById("telefono-consegna").value : "",
        costoConsegna: consegna ? costoConsegna : 0,
        telefonoRitiro: ritiro ? document.getElementById("telefono-ritiro").value : "",
        note: document.getElementById("note").value,
        righe: Array.from(document.querySelectorAll(".riga-edit")).map(riga => ({
            prodotto: riga.querySelector(".prodotto").value,
            extra: JSON.parse(riga.querySelector(".extra-selezionati")?.dataset.extra || "[]"),
            senza: JSON.parse(riga.dataset.senza || "[]")
        }))
    };
    const risposta = await fetch(`/api/ordini/${numero}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!risposta.ok) {
        const errore = await risposta.json();
        pulsante.disabled = false;
        stato(errore.errore || "Salvataggio non riuscito.");
        return;
    }
    window.location.href = "/gestionale.html";
};
avvia();
