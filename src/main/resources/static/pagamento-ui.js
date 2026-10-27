const paymentUI = Object.freeze({
    confermaInPagina(messaggio) {
        let dialog = document.getElementById("payment-confirm-dialog");
        if (!dialog) {
            dialog = document.createElement("dialog");
            dialog.id = "payment-confirm-dialog";
            dialog.className = "payment-confirm-dialog";
            dialog.setAttribute("aria-labelledby", "payment-confirm-message");
            dialog.innerHTML = `
                <form method="dialog">
                    <p id="payment-confirm-message" class="payment-confirm-dialog__message"></p>
                    <div class="payment-confirm-dialog__actions">
                        <button type="submit" value="cancel">Annulla</button>
                        <button type="submit" value="confirm" autofocus>Conferma</button>
                    </div>
                </form>
            `;
            document.body.append(dialog);
            dialog.addEventListener("click", evento => {
                if (evento.target === dialog && typeof dialog.close === "function") dialog.close();
            });
        }

        dialog.querySelector("#payment-confirm-message").textContent = messaggio;
        if (dialog.open) return Promise.resolve(false);
        return new Promise(resolve => {
            dialog.addEventListener("close", () => {
                resolve(dialog.returnValue === "confirm");
            }, { once: true });
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
        });
    },

    badgeMarkup(order, editable = true) {
        const tipo = order.tipo === "sala" ? "tavolo" : order.tipo || "tavolo";
        if (!["ritiro", "consegna"].includes(tipo)) return "";

        const numero = Number(order.numero);
        if (!Number.isSafeInteger(numero) || numero < 1) {
            throw new Error("Numero ordine non valido per il pagamento.");
        }

        if (order.statoPagamento === "non_pagato") {
            return editable
                ? `<button type="button" class="stato-pagamento stato-pagamento--non-pagato" data-numero="${numero}" data-stato-pagamento="pagato" aria-label="Cambia il pagamento dell'ordine ${numero} in pagato">Non pagato</button>`
                : '<span class="stato-pagamento stato-pagamento--non-pagato">Non pagato</span>';
        }
        if (order.statoPagamento === "pagato") {
            return editable
                ? `<button type="button" class="stato-pagamento stato-pagamento--pagato" data-numero="${numero}" data-stato-pagamento="non_pagato" aria-label="Cambia il pagamento dell'ordine ${numero} in non pagato">Pagato</button>`
                : '<span class="stato-pagamento stato-pagamento--pagato" role="status">Pagato</span>';
        }
        if (order.statoPagamento === "pos" && tipo === "consegna") {
            return '<span class="stato-pagamento stato-pagamento--pos" role="status">POS</span>';
        }
        if (!editable) {
            return '<span class="stato-pagamento stato-pagamento--da-verificare" role="status">Da verificare</span>';
        }
        return `<button type="button" class="stato-pagamento stato-pagamento--da-verificare" data-numero="${numero}" data-stato-pagamento="non_pagato" aria-label="Imposta il pagamento dell'ordine ${numero} come non pagato">Da verificare</button>`;
    },

    async aggiorna(numero, statoPagamento) {
        const risposta = await fetch(`/api/ordini/${encodeURIComponent(numero)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statoPagamento })
        });
        const ordine = await risposta.json();
        if (!risposta.ok) {
            throw new Error(ordine.errore || "Aggiornamento pagamento non riuscito.");
        }
        return ordine;
    },

    async confermaAggiornamento(numero, statoPagamento, conferma, onConfirm = () => {}) {
        const descrizione = statoPagamento === "pagato" ? "pagato" : "non pagato";
        if (!await conferma(`Confermi di voler segnare l'ordine come ${descrizione}?`)) return null;
        onConfirm();
        return paymentUI.aggiorna(numero, statoPagamento);
    },

    bind(container, callbacks) {
        container.addEventListener("click", async evento => {
            const target = evento.target;
            const pulsante = target && typeof target.closest === "function"
                ? target.closest("[data-stato-pagamento]")
                : null;
            if (!pulsante || !callbacks.canEdit()) return;

            try {
                const ordine = await paymentUI.confermaAggiornamento(
                    pulsante.dataset.numero,
                    pulsante.dataset.statoPagamento,
                    messaggio => paymentUI.confermaInPagina(messaggio),
                    () => { pulsante.disabled = true; }
                );
                if (ordine) callbacks.onUpdated(ordine);
            } catch (errore) {
                pulsante.disabled = false;
                callbacks.onError(errore);
            }
        });
    }
});

if (typeof module !== "undefined" && module.exports) module.exports = paymentUI;
if (typeof window !== "undefined") window.paymentUI = paymentUI;
