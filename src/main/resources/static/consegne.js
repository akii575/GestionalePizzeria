const stato = { ordini: [], timer: null };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-consegne");
const statoPagina = document.getElementById("stato");

function testoSicuro(valore) {
    const elemento = document.createElement("span");
    elemento.textContent = valore == null ? "" : valore;
    return elemento.innerHTML;
}

function mostraStato(testo, classe = "") {
    statoPagina.textContent = testo;
    statoPagina.className = classe;
}

function linkMappa(indirizzo) {
    const query = encodeURIComponent(indirizzo);
    const dispositivoApple = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return dispositivoApple
        ? `https://maps.apple.com/?q=${query}`
        : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function ordiniFiltrati() {
    const testo = document.getElementById("filtro").value.trim().toLocaleLowerCase("it-IT");
    const data = document.getElementById("data").value;
    return stato.ordini.filter(ordine => {
        const corrispondeTesto = !testo || [
            ordine.tavoloOCliente,
            ordine.indirizzoConsegna,
            ordine.telefonoConsegna
        ].some(valore => String(valore || "").toLocaleLowerCase("it-IT").includes(testo));
        return corrispondeTesto && (!data || ordine.dataOra.substring(0, 10) === data);
    });
}

function render() {
    const ordini = ordiniFiltrati();
    document.getElementById("numero-consegne").textContent = ordini.length;
    document.getElementById("totale-consegne").textContent = euro.format(
        ordini.reduce((somma, ordine) => somma + Number(ordine.totale || 0), 0)
    );
    lista.replaceChildren();
    if (!ordini.length) {
        lista.innerHTML = '<div class="vuoto">Nessuna consegna corrisponde ai filtri.</div>';
        return;
    }

    ordini.forEach(ordine => {
        const dataOra = new Date(ordine.dataOra);
        const telefono = String(ordine.telefonoConsegna || "");
        const telefonoLink = telefono.replace(/[^\d+]/g, "");
        const indirizzo = String(ordine.indirizzoConsegna || "");
        const indirizzoSicuro = testoSicuro(indirizzo);
        const telefonoSicuro = testoSicuro(telefono);
        const mappaPrincipale = linkMappa(indirizzo);
        const prodotti = (ordine.righe || []).map(riga => {
            const extra = (riga.extra || []).map(elemento => (
                typeof elemento === "string" ? elemento : elemento.nome
            ));
            return `<li><strong>${testoSicuro(riga.prodotto)}</strong>${extra.length ? `<span> — Extra: ${testoSicuro(extra.join(", "))}</span>` : ""}</li>`;
        }).join("");
        const note = ordine.note
            ? `<p class="consegna-note"><strong>Note:</strong> ${testoSicuro(ordine.note)}</p>`
            : "";
        const azioni = window.currentAccount.admin
            ? `<div class="consegna-azioni"><button type="button" data-modifica="${ordine.numero}">Modifica ordine</button><button type="button" data-elimina="${ordine.numero}" class="pericolo">Elimina</button></div>`
            : "";
        lista.insertAdjacentHTML("beforeend", `
            <article class="consegna">
                <header class="consegna-testa">
                    <div><span class="consegna-numero">Consegna #${Number(ordine.numero)}</span><h2>${testoSicuro(ordine.tavoloOCliente)}</h2><p>${dataOra.toLocaleString("it-IT")}</p></div>
                    <div class="consegna-totale">${euro.format(Number(ordine.totale || 0))}</div>
                </header>
                <div class="consegna-recapiti">
                    <div><strong>Telefono</strong><br><a class="consegna-telefono" href="tel:${telefonoLink}">${telefonoSicuro}</a></div>
                    <div><strong>Indirizzo</strong><a class="consegna-indirizzo" href="${mappaPrincipale}" target="_blank" rel="noopener noreferrer">${indirizzoSicuro}</a><div class="mappe-link"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}" target="_blank" rel="noopener noreferrer">Google Maps</a><a href="https://maps.apple.com/?q=${encodeURIComponent(indirizzo)}" target="_blank" rel="noopener noreferrer">Mappe Apple</a></div></div>
                </div>
                <details class="consegna-dettagli">
                    <summary>Apri il dettaglio dell'ordine</summary>
                    <ul class="consegna-prodotti">${prodotti}</ul>
                    ${note}
                </details>
                ${azioni}
            </article>
        `);
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
    if (!window.currentAccount.admin || !window.confirm(`Eliminare la consegna #${numero}?`)) return;
    try {
        const risposta = await fetch(`/api/ordini/${encodeURIComponent(numero)}`, { method: "DELETE" });
        if (!risposta.ok) throw new Error("Eliminazione non riuscita.");
        stato.ordini = stato.ordini.filter(ordine => String(ordine.numero) !== String(numero));
        render();
        mostraStato(`Consegna #${numero} eliminata.`);
    } catch (errore) {
        mostraStato(errore.message, "errore");
    }
}

async function caricaConsegne() {
    mostraStato("Caricamento consegne...", "loading");
    try {
        const risposta = await fetch("/api/consegne", { cache: "no-store" });
        if (!risposta.ok) throw new Error("Impossibile caricare le consegne.");
        stato.ordini = await risposta.json();
        document.getElementById("ultimo-aggiornamento").textContent = new Date().toLocaleTimeString("it-IT");
        render();
        mostraStato("");
    } catch (errore) {
        mostraStato(errore.message, "errore");
    }
}

async function avvia() {
    if (!await window.authReady) return;
    if (!window.currentAccount) return;
    await caricaConsegne();
    stato.timer = setInterval(caricaConsegne, 30_000);
}

document.getElementById("aggiorna").addEventListener("click", caricaConsegne);
document.getElementById("filtro").addEventListener("input", render);
document.getElementById("data").addEventListener("change", render);
avvia();
