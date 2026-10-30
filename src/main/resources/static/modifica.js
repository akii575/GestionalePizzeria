const numero = new URLSearchParams(window.location.search).get("numero");
const righe = document.getElementById("righe");
let menu = [];
let extra = [];
let posFisso = false;
let costoConsegna = 0;
const bottoneCostoConsegna = document.getElementById("btn-costo-consegna");
const CATEGORIE_CON_EXTRA = ["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"];
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const stato = testo => document.getElementById("stato").textContent = testo;
function oraLocale() {
	const adesso = new Date();
	return `${String(adesso.getHours()).padStart(2, "0")}:${String(adesso.getMinutes()).padStart(2, "0")}`;
}
function aggiornaBottoneCostoConsegna() {
	const attivo = costoConsegna === 2;
	bottoneCostoConsegna.hidden = document.getElementById("tipo-ordine").value !== "consegna";
	bottoneCostoConsegna.setAttribute("aria-pressed", String(attivo));
	bottoneCostoConsegna.textContent = attivo
		? "Rimuovi costo consegna (2,00 €)"
		: "Aggiungi costo consegna (+2,00 €)";
}
function riferimentoExtra(elemento) { return typeof elemento === "string" ? extra.find(item => item.nome === elemento) : elemento; }
function aggiornaTotale() {
	const totaleRighe = Array.from(document.querySelectorAll(".riga-edit")).reduce((somma, riga) => {
		const prodotto = menu.find(item => item.nome === riga.querySelector(".prodotto")?.value);
		const selezionati = JSON.parse(riga.querySelector(".extra-selezionati")?.dataset.extra || "[]");
		return somma + Number(prodotto?.prezzo || 0) + selezionati.reduce((extraTotale, item) => extraTotale + Number(item.prezzo || 0), 0);
	}, 0);
	const totale = totaleRighe + (document.getElementById("tipo-ordine").value === "consegna" ? costoConsegna : 0);
	document.getElementById("totale-modifica").textContent = `Totale: ${euro.format(totale)}`;
}
function aggiornaCampiConsegna() {
	const tipo = document.getElementById("tipo-ordine").value;
	const consegna = tipo === "consegna";
	const tavolo = tipo === "tavolo";
	const ritiro = tipo === "ritiro";
	const banco = tipo === "banco";
	const orario = document.getElementById("orario");
	const statoPagamento = document.getElementById("stato-pagamento");
	document.getElementById("campo-banco").hidden = !banco;
	const destinazione = document.getElementById("tavolo");
	document.getElementById("destinazione-label").hidden = !tavolo && !ritiro;
	document.getElementById("campo-persone").hidden = !tavolo;
	destinazione.required = tavolo || ritiro;
	document.getElementById("campi-ritiro").hidden = !ritiro;
	document.getElementById("campi-consegna").hidden = !consegna;
	document.getElementById("campo-orario").hidden = tavolo;
	document.getElementById("campo-pagamento").hidden = !ritiro && !consegna;
	document.querySelector('#stato-pagamento option[value="pos"]').hidden = !consegna;
	orario.required = !tavolo;
	statoPagamento.disabled = posFisso;
	document.getElementById("tipo-ordine").disabled = posFisso;
	document.querySelector("#destinazione-label span").textContent = ritiro
		? "Nome cliente"
		: "Tavolo";
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
		const card = document.createElement("article"); card.className = "extra-card extra-selezionato";
		card.innerHTML = `<strong>${item.nome}</strong><span>${euro.format(Number(item.prezzo))}</span><button type="button" class="extra-rimuovi">Rimuovi</button>`;
		card.querySelector(".extra-rimuovi").onclick = () => { onChange(selezionati.filter(selected => selected.id !== item.id)); };
		container.appendChild(card);
	});
}
function opzioniExtra(selezionati) {
	const container = document.createElement("div"); container.className = "extra-selettore";
	const label = document.createElement("label"); label.textContent = "Extra";
	const select = document.createElement("select"); select.className = "extra-aggiungi";
	select.innerHTML = '<option value="">Seleziona un extra</option>';
	const lista = document.createElement("div"); lista.className = "extra-selezionati";
	function aggiorna(nuoviSelezionati) {
		selezionati = nuoviSelezionati;
		renderExtraSelezionati(lista, selezionati, aggiorna);
		select.innerHTML = '<option value="">Seleziona un extra</option>';
		extra.filter(item => !selezionati.some(selected => selected.id === item.id)).forEach(item => {
			const opzione = document.createElement("option"); opzione.value = item.id; opzione.textContent = `${item.nome} - ${euro.format(Number(item.prezzo))}`; select.appendChild(opzione);
		});
		select.value = "";
		aggiornaTotale();
	}
	select.addEventListener("change", () => { const scelto = extra.find(item => item.id === select.value); if (scelto) aggiorna([...selezionati, scelto]); });
	label.appendChild(select); container.append(label, lista); aggiorna(selezionati); return container;
}
function rigaEdit(riga = { prodotto: menu[0]?.nome || "", extra: [] }) {
	const div = document.createElement("div"); div.className = "riga-edit";
	const prodottoMenu = menu.find(p => p.nome === riga.prodotto); const categoria = prodottoMenu?.categoria || "";
	riga.ingredienti = riga.ingredienti || prodottoMenu?.ingredienti || [];
	const extraSelezionati = riga.extra.map(riferimentoExtra).filter(Boolean);
	div.innerHTML = `<label>Prodotto<select class="prodotto">${menu.map(p => `<option value="${p.nome}" ${p.nome === riga.prodotto ? "selected" : ""}>${p.nome}</option>`).join("")}</select><small class="prodotto-ingredienti"></small></label><div class="extra-editor" ${CATEGORIE_CON_EXTRA.includes(categoria) ? "" : "hidden"}></div><button class="rimuovi" type="button">Rimuovi</button>`;
	const extraEditor = div.querySelector(".extra-editor");
	const descrizione = div.querySelector(".prodotto-ingredienti");
	function aggiornaDescrizione(prodotto) { descrizione.textContent = prodotto?.ingredienti?.length ? prodotto.ingredienti.join(", ") : ""; }
	aggiornaDescrizione(prodottoMenu);
	if (!extraEditor.hidden) extraEditor.appendChild(opzioniExtra(extraSelezionati));
	div.querySelector(".rimuovi").onclick = () => { div.remove(); aggiornaTotale(); };
	div.querySelector(".prodotto").onchange = event => { const nuovo = menu.find(p => p.nome === event.target.value); aggiornaDescrizione(nuovo); extraEditor.hidden = !CATEGORIE_CON_EXTRA.includes(nuovo?.categoria); extraEditor.innerHTML = ""; if (!extraEditor.hidden) extraEditor.appendChild(opzioniExtra([])); aggiornaTotale(); };
	righe.appendChild(div);
	aggiornaTotale();
}
async function avvia() {
	try {
		const risposte = await Promise.all([fetch("/api/menu"), fetch("/api/extra"), fetch("/api/ordini")]);
		menu = await risposte[0].json();
		extra = (await risposte[1].json()).sort((primo, secondo) => primo.nome.localeCompare(secondo.nome, "it", { sensitivity: "base" }));
		const ordine = (await risposte[2].json()).find(o => String(o.numero) === String(numero));
		if (!ordine) throw new Error("Ordine non trovato.");
		document.getElementById("numero").textContent = `#${ordine.numero}`;
		document.getElementById("tipo-ordine").value = ordine.tipo === "consegna"
			? "consegna"
			: ordine.tipo === "banco" ? "banco" : ordine.tipo === "ritiro" ? "ritiro" : "tavolo";
		document.getElementById("tavolo").value = ordine.tipo === "consegna" || ordine.tipo === "banco"
			? ""
			: ordine.tavoloOCliente || "";
		document.getElementById("numero-persone").value = Number.isInteger(ordine.numeroPersone)
			&& ordine.numeroPersone > 0 ? ordine.numeroPersone : 1;
		document.getElementById("indirizzo-consegna").value = ordine.indirizzoConsegna || "";
		document.getElementById("telefono-consegna").value = ordine.telefonoConsegna || "";
		document.getElementById("telefono-ritiro").value = ordine.telefonoRitiro || "";
		document.getElementById("cognome-banco").value = ordine.cognomeBanco || "";
		document.getElementById("note").value = ordine.note || "";
		document.getElementById("orario").value = ordine.tipo === "tavolo"
			? ""
			: ordine.orario || oraLocale();
		document.getElementById("stato-pagamento").value = ordine.statoPagamento || "";
		costoConsegna = Number(ordine.costoConsegna) === 2 ? 2 : 0;
		posFisso = ordine.statoPagamento === "pos";
		aggiornaCampiConsegna();
		ordine.righe.forEach(rigaEdit);
	} catch (errore) {
		stato(errore.message);
	}
}
document.getElementById("aggiungi").onclick = () => rigaEdit();
document.getElementById("tipo-ordine").addEventListener("change", () => {
	const tipo = document.getElementById("tipo-ordine").value;
	const statoPagamento = document.getElementById("stato-pagamento");
	if (tipo !== "consegna") costoConsegna = 0;
	if (["ritiro", "consegna"].includes(tipo) && !statoPagamento.value && !posFisso) {
		statoPagamento.value = "non_pagato";
	}
	aggiornaCampiConsegna();
	aggiornaTotale();
});
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
	if ((tavolo || ritiro) && !document.getElementById("tavolo").reportValidity()) return;
	if (ritiro && !document.getElementById("telefono-ritiro").reportValidity()) return;
	if (tavolo && !document.getElementById("numero-persone").reportValidity()) return;
	if (consegna && (!document.getElementById("indirizzo-consegna").reportValidity()
		|| !document.getElementById("telefono-consegna").reportValidity())) return;
	pulsante.disabled = true;
	stato("Salvataggio in corso...");
	const payload = {
		tipo,
		orario: tavolo ? "" : document.getElementById("orario").value,
		statoPagamento: ritiro || consegna
			? document.getElementById("stato-pagamento").value || null
			: null,
		cognomeBanco: banco ? document.getElementById("cognome-banco").value : "",
		tavoloOCliente: tavolo || ritiro ? document.getElementById("tavolo").value : "",
		numeroPersone: tavolo ? Number(document.getElementById("numero-persone").value) : null,
		indirizzoConsegna: consegna ? document.getElementById("indirizzo-consegna").value : "",
		telefonoConsegna: consegna ? document.getElementById("telefono-consegna").value : "",
		costoConsegna: consegna ? costoConsegna : 0,
		telefonoRitiro: ritiro ? document.getElementById("telefono-ritiro").value : "",
		note: document.getElementById("note").value,
		righe: Array.from(document.querySelectorAll(".riga-edit")).map(riga => ({
			prodotto: riga.querySelector(".prodotto").value,
			extra: JSON.parse(riga.querySelector(".extra-selezionati")?.dataset.extra || "[]")
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