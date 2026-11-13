const stato = { ordini: [], menu: [], timer: null };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const lista = document.getElementById("lista-consegne");
const statoPagina = document.getElementById("stato");
window.orderCard.bindReprints(lista);

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
        lista.insertAdjacentHTML("beforeend", window.orderCard.render(ordine, {
            canEdit: window.currentAccount.admin === true || window.currentAccount.staff === true,
            menu: stato.menu
        }));
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

async function caricaConsegne() {
    mostraStato("Caricamento consegne...", "loading");
    try {
        const data = document.getElementById("data").value;
        const url = data ? `/api/consegne?data=${encodeURIComponent(data)}` : "/api/consegne";
        const risposta = await fetch(url, { cache: "no-store" });
        if (!risposta.ok) throw new Error("Impossibile caricare le consegne.");
        stato.ordini = await risposta.json();
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
    if (document.visibilityState === "visible") stato.timer = setInterval(caricaConsegne, 30_000);
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
document.getElementById("data").addEventListener("change", caricaConsegne);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") caricaConsegne();
    configuraAggiornamento();
});
if (window.paymentUI) {
    window.paymentUI.bind(lista, {
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
