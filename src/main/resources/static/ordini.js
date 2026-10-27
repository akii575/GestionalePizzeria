const stato = { categoria: "pizze", menu: [], extra: [], righe: [], extraSelezionati: [] };
const prodotti = document.getElementById("prodotti");
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
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const CATEGORIE_CON_EXTRA = ["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"];

function categoriaConExtra() { return CATEGORIE_CON_EXTRA.includes(stato.categoria); }
function mostraMessaggio(testo, classe) { messaggio.textContent = testo; messaggio.className = classe; }
function testoSicuro(valore) { const elemento = document.createElement("span"); elemento.textContent = valore == null ? "" : valore; return elemento.innerHTML; }
function oraLocale() {
    const adesso = new Date();
    return `${String(adesso.getHours()).padStart(2, "0")}:${String(adesso.getMinutes()).padStart(2, "0")}`;
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
}
function nomiExtra(extra) { return (extra || []).map(elemento => typeof elemento === "string" ? elemento : elemento.nome); }
function prezzoRiga(riga) { return Number(riga.prezzo || 0) + nomiExtra(riga.extra).reduce((somma, nome) => somma + Number(stato.extra.find(extra => extra.nome === nome)?.prezzo || 0), 0); }
function renderExtra(container, selezionati, onChange) {
    container.innerHTML = "";
    stato.extra.forEach(extra => {
        const bottone = document.createElement("button"); bottone.type = "button"; bottone.className = "extra-card";
        bottone.classList.toggle("selezionato", selezionati.some(elemento => elemento.id === extra.id));
        bottone.innerHTML = `<strong>${extra.nome}</strong><span>${euro.format(Number(extra.prezzo))}</span>`;
        bottone.addEventListener("click", () => { const presenti = selezionati.some(elemento => elemento.id === extra.id); selezionati = presenti ? selezionati.filter(elemento => elemento.id !== extra.id) : [...selezionati, extra]; onChange(selezionati); renderExtra(container, selezionati, onChange); });
        container.appendChild(bottone);
    });
}
function renderProdotti() {
    sezioneExtra.hidden = !categoriaConExtra(); prodotti.innerHTML = "";
    const disponibili = stato.menu.filter(prodotto => prodotto.categoria === stato.categoria).sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    for (let inizio = 0; inizio < disponibili.length; inizio += 9) {
        const pagina = document.createElement("div"); pagina.className = "pagina-prodotti";
        disponibili.slice(inizio, inizio + 9).forEach(prodotto => { const bottone = document.createElement("button"); bottone.className = "prodotto-btn"; bottone.type = "button"; const ingredienti = prodotto.ingredienti?.length ? `<span class="ingredienti">${testoSicuro(prodotto.ingredienti.join(", "))}</span>` : ""; bottone.innerHTML = `<strong>${testoSicuro(prodotto.nome)}</strong><span class="prezzo-prodotto">${euro.format(Number(prodotto.prezzo))}</span>${ingredienti}`; bottone.addEventListener("click", () => { stato.righe.push({ prodotto: prodotto.nome, prezzo: prodotto.prezzo, categoria: prodotto.categoria, ingredienti: prodotto.ingredienti || [], extra: stato.extraSelezionati }); stato.extraSelezionati = []; renderExtra(document.getElementById("extra-lista"), stato.extraSelezionati, selezionati => stato.extraSelezionati = selezionati); renderRiepilogo(); }); pagina.appendChild(bottone); });
        prodotti.appendChild(pagina);
    }
}
function aggiornaGestioneExtra() {
    const riga = stato.righe[Number(selettoreRigaExtra.value)]; const modificabile = riga && CATEGORIE_CON_EXTRA.includes(riga.categoria); extraRiepilogo.hidden = !modificabile;
    if (modificabile) renderExtra(document.getElementById("extra-riepilogo-lista"), nomiExtra(riga.extra).map(nome => stato.extra.find(extra => extra.nome === nome)).filter(Boolean), selezionati => { riga.extra = selezionati; });
}
function aggiornaSelettoreRighe() { const scelto = selettoreRigaExtra.value; selettoreRigaExtra.innerHTML = '<option value="">Seleziona un prodotto</option>'; stato.righe.forEach((riga, indice) => { const opzione = document.createElement("option"); opzione.value = indice; opzione.textContent = `${riga.prodotto}${riga.extra.length ? ` + ${nomiExtra(riga.extra).join(", ")}` : ""}`; selettoreRigaExtra.appendChild(opzione); }); selettoreRigaExtra.disabled = !stato.righe.length; selettoreRigaExtra.value = scelto < stato.righe.length ? scelto : ""; aggiornaGestioneExtra(); }
function renderRiepilogo() { riepilogo.innerHTML = ""; stato.righe.forEach((riga, indice) => { const voce = document.createElement("div"); voce.className = "riepilogo-item"; const descrizione = riga.ingredienti?.length ? `<small class="riepilogo-descrizione">${testoSicuro(riga.ingredienti.join(", "))}</small>` : ""; voce.innerHTML = `<div><strong>${testoSicuro(riga.prodotto)}</strong>${descrizione}<span>${riga.extra.length ? `Extra: ${testoSicuro(nomiExtra(riga.extra).join(", "))}` : "Nessun extra"}</span></div><button class="rimuovi" type="button" data-indice="${indice}">Rimuovi</button>`; riepilogo.appendChild(voce); }); if (!stato.righe.length) riepilogo.innerHTML = "<p>Nessun prodotto selezionato</p>"; riepilogo.querySelectorAll(".rimuovi").forEach(button => button.addEventListener("click", () => { stato.righe.splice(Number(button.dataset.indice), 1); renderRiepilogo(); })); document.getElementById("riepilogo-totale").textContent = `Totale: ${euro.format(stato.righe.reduce((totale, riga) => totale + prezzoRiga(riga), 0))}`; invia.disabled = !stato.righe.length; aggiornaSelettoreRighe(); }
function apriConferma() {
    if (!stato.righe.length) return;
    const consegna = tipoOrdine.value === "consegna";
    const ritiro = tipoOrdine.value === "ritiro";
    if (tipoOrdine.value === "tavolo"
        && (!document.getElementById("tavolo").reportValidity() || !numeroPersone.reportValidity())) return;
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
    const dettagliServizio = tipoOrdine.value === "consegna"
        ? `<div class="conferma-consegna"><strong>Consegna</strong><span>${testoSicuro(document.getElementById("indirizzo-consegna").value.trim())}</span><span>${testoSicuro(document.getElementById("telefono-consegna").value.trim())}</span></div>`
        : tipoOrdine.value === "ritiro"
            ? `<div class="conferma-consegna"><strong>Ritiro: ${testoSicuro(document.getElementById("cliente-ritiro").value.trim())}</strong><span>${testoSicuro(document.getElementById("telefono-ritiro").value.trim())}</span></div>`
            : tipoOrdine.value === "banco"
                ? `<div class="conferma-consegna"><strong>Banco · ${testoSicuro(document.getElementById("cognome-banco").value.trim())}</strong></div>`
                : `<div class="conferma-consegna"><strong>${testoSicuro(document.getElementById("tavolo").value)} · ${testoSicuro(numeroPersone.value)} persone</strong></div>`;
    const dettaglioOrario = tipoOrdine.value === "tavolo"
        ? ""
        : `<div class="conferma-consegna"><span>Orario richiesto: ${testoSicuro(orario.value)}</span>${ritiro ? `<span>Pagamento: ${testoSicuro(pagamentoRitiro.selectedOptions[0].textContent)}</span>` : consegna ? `<span>Pagamento: ${testoSicuro(pagamentoConsegna.selectedOptions[0].textContent)}</span>` : ""}</div>`;
    confermaRiepilogo.innerHTML = dettagliServizio + dettaglioOrario + stato.righe.map(riga => {
        const extra = nomiExtra(riga.extra).map(nome => {
            const dato = stato.extra.find(item => item.nome === nome);
            return `${testoSicuro(nome)} (${euro.format(Number(dato?.prezzo || 0))})`;
        }).join(", ");
        return `<div class="conferma-riga"><strong>${testoSicuro(riga.prodotto)} - ${euro.format(Number(riga.prezzo))}</strong>${riga.ingredienti?.length ? `<span>${testoSicuro(riga.ingredienti.join(", "))}</span>` : ""}${extra ? `<span>Extra: ${extra}</span>` : ""}<span>Totale riga: ${euro.format(prezzoRiga(riga))}</span></div>`;
    }).join("");
    confermaTotale.textContent = `Totale: ${euro.format(stato.righe.reduce((totale, riga) => totale + prezzoRiga(riga), 0))}`;
    confermaModale.hidden = false;
    document.body.classList.add("modale-aperta");
    document.getElementById("conferma-invio").focus();
}
function chiudiConferma() { confermaModale.hidden = true; document.body.classList.remove("modale-aperta"); }
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
                    : ritiro ? document.getElementById("cliente-ritiro").value : "",
                numeroPersone: tavolo ? Number(numeroPersone.value) : null,
                indirizzoConsegna: consegna ? document.getElementById("indirizzo-consegna").value : "",
                telefonoConsegna: consegna ? document.getElementById("telefono-consegna").value : "",
                telefonoRitiro: ritiro ? document.getElementById("telefono-ritiro").value : "",
                note: document.getElementById("note").value,
                righe: stato.righe.map(riga => ({ prodotto: riga.prodotto, extra: riga.extra }))
            })
        });
        const dati = await risposta.json();
        if (!risposta.ok) throw new Error(dati.errore || "Invio non riuscito.");
        mostraMessaggio(`Ordine #${dati.numero} salvato. ${dati.messaggioStampa}`, dati.stampaCompletata || dati.stampaInCoda ? "successo" : "errore");
        stato.righe = [];
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
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => { stato.categoria = tab.dataset.tab; document.querySelectorAll(".tab").forEach(elemento => elemento.classList.toggle("active", elemento === tab)); renderProdotti(); }));
tipoOrdine.addEventListener("change", aggiornaTipoOrdine);
orario.value = oraLocale();
aggiornaTipoOrdine();
selettoreRigaExtra.addEventListener("change", aggiornaGestioneExtra); document.getElementById("applica-extra").addEventListener("click", () => { renderRiepilogo(); mostraMessaggio("Extra aggiornati.", "successo"); }); invia.addEventListener("click", apriConferma); document.getElementById("conferma-invio").addEventListener("click", inviaOrdine); document.getElementById("annulla-invio").addEventListener("click", chiudiConferma); document.getElementById("btn-annulla").addEventListener("click", () => { stato.righe = []; renderRiepilogo(); mostraMessaggio("Ordine annullato.", ""); });
document.addEventListener("keydown", evento => { if (evento.key === "Escape" && !confermaModale.hidden) chiudiConferma(); });
Promise.all([fetch("/api/menu"), fetch("/api/extra")]).then(async risposte => { stato.menu = await risposte[0].json(); stato.extra = (await risposte[1].json()).sort((primo, secondo) => primo.nome.localeCompare(secondo.nome, "it", { sensitivity: "base" })); renderExtra(document.getElementById("extra-lista"), stato.extraSelezionati, selezionati => stato.extraSelezionati = selezionati); renderProdotti(); }).catch(errore => mostraMessaggio(errore.message, "errore"));
