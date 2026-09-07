const numero = new URLSearchParams(window.location.search).get("numero");
const righe = document.getElementById("righe");
let menu = [];
let extra = [];
const CATEGORIE_CON_EXTRA = ["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"];
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const stato = testo => document.getElementById("stato").textContent = testo;
function riferimentoExtra(elemento) { return typeof elemento === "string" ? extra.find(item => item.nome === elemento) : elemento; }
function aggiornaTotale() {
	const totale = Array.from(document.querySelectorAll(".riga-edit")).reduce((somma, riga) => {
		const prodotto = menu.find(item => item.nome === riga.querySelector(".prodotto")?.value);
		const selezionati = JSON.parse(riga.querySelector(".extra-selezionati")?.dataset.extra || "[]");
		return somma + Number(prodotto?.prezzo || 0) + selezionati.reduce((extraTotale, item) => extraTotale + Number(item.prezzo || 0), 0);
	}, 0);
	document.getElementById("totale-modifica").textContent = `Totale: ${euro.format(totale)}`;
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
async function avvia() { try { const risposte = await Promise.all([fetch("/api/menu"), fetch("/api/extra"), fetch("/api/ordini")]); menu = await risposte[0].json(); extra = (await risposte[1].json()).sort((primo, secondo) => primo.nome.localeCompare(secondo.nome, "it", { sensitivity: "base" })); const ordine = (await risposte[2].json()).find(o => String(o.numero) === String(numero)); if (!ordine) throw new Error("Ordine non trovato."); document.getElementById("numero").textContent = `#${ordine.numero}`; document.getElementById("tavolo").value = ordine.tavoloOCliente; document.getElementById("note").value = ordine.note || ""; ordine.righe.forEach(rigaEdit); } catch (errore) { stato(errore.message); } }
document.getElementById("aggiungi").onclick = () => rigaEdit();
document.getElementById("salva").onclick = async () => { const pulsante = document.getElementById("salva"); pulsante.disabled = true; stato("Salvataggio in corso..."); const payload = { tavoloOCliente: document.getElementById("tavolo").value, note: document.getElementById("note").value, righe: Array.from(document.querySelectorAll(".riga-edit")).map(riga => ({ prodotto: riga.querySelector(".prodotto").value, extra: JSON.parse(riga.querySelector(".extra-selezionati")?.dataset.extra || "[]") })) }; const risposta = await fetch(`/api/ordini/${numero}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!risposta.ok) { const errore = await risposta.json(); pulsante.disabled = false; stato(errore.errore || "Salvataggio non riuscito."); return; } window.location.href = "/gestionale.html"; };
avvia();