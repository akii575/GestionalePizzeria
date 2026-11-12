const orderCard = (() => {
    const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
    const serviceNames = {
        banco: "Banco",
        consegna: "Consegna",
        ritiro: "Ritiro",
        tavolo: "Tavolo"
    };

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function normalizeType(type) {
        return type === "sala" ? "tavolo" : type || "tavolo";
    }

    function fieldsForOrder(order, type) {
        if (type === "consegna") {
            return [
                { label: "Telefono", value: order.telefonoConsegna || "—", kind: "telephone" },
                { label: "Indirizzo", value: order.indirizzoConsegna || "—", kind: "address" }
            ];
        }
        if (type === "ritiro") {
            return [
                { label: "Nome", value: order.tavoloOCliente || "—" },
                { label: "Telefono", value: order.telefonoRitiro || "—", kind: "telephone" }
            ];
        }
        if (type === "banco") {
            return [{ label: "Nome", value: order.cognomeBanco || "—", full: true }];
        }

        const table = String(order.tavoloOCliente || "—").replace(/^tavolo\s*[:#-]?\s*/i, "") || "—";
        return [
            { label: "Tavolo", value: table },
            { label: "Persone", value: order.numeroPersone || "—" }
        ];
    }

    function renderFieldValue(field) {
        const value = String(field.value ?? "—");
        if (field.kind === "telephone" && value !== "—") {
            const phone = value.replace(/[^\d+]/g, "");
            return `<a class="order-card__field-link" href="tel:${escapeHtml(phone)}">${escapeHtml(value)}</a>`;
        }
        if (field.kind === "address" && value !== "—") {
            return `<button class="order-card__field-action" type="button" data-indirizzo="${escapeHtml(value)}" aria-haspopup="dialog"><span title="${escapeHtml(value)}">${escapeHtml(value)}</span><span class="order-card__field-hint">Apri nelle mappe</span></button>`;
        }
        return escapeHtml(value);
    }

    function renderFields(fields) {
        const fieldMarkup = fields.map(field => `
            <div class="order-card__field${field.full ? " order-card__field--full" : ""}">
                <strong class="order-card__field-label">${escapeHtml(field.label)}</strong>
                <div class="order-card__field-value">${renderFieldValue(field)}</div>
            </div>
        `).join("");
        return `<div class="order-card__fields">${fieldMarkup}</div>`;
    }

    function renderProducts(rows, menu) {
        return (Array.isArray(rows) ? rows : []).map(row => {
            const extras = (Array.isArray(row.extra) ? row.extra : []).map(extra => (
                typeof extra === "string" ? extra : extra?.nome
            )).filter(Boolean);
            const ingredients = menu.find(product => product.nome === row.prodotto)?.ingredienti || [];
            const ingredientMarkup = ingredients.length
                ? `<small class="order-card__ingredients">${escapeHtml(ingredients.join(", "))}</small>`
                : "";
            const extraMarkup = extras.length
                ? `<span class="order-card__extra">Extra: ${escapeHtml(extras.join(", "))}</span>`
                : "";
            const price = euro.format(Number(row.totale ?? row.prezzoBase ?? 0));
            return `<li><div class="order-card__product-row"><div><strong>${escapeHtml(row.prodotto)} x1</strong>${ingredientMarkup}</div><span>${price}</span></div>${extraMarkup}</li>`;
        }).join("");
    }

    function renderPayment(order, canEdit) {
        const paymentUI = typeof window !== "undefined" ? window.paymentUI : null;
        const badge = paymentUI?.badgeMarkup(order, canEdit) || "";
        return badge || '<span class="stato-pagamento stato-pagamento--non-applicabile" role="status">N/A</span>';
    }

    function renderPrintStatus(order) {
        const message = String(order.messaggioStampa || "").trim();
        if (!message && !order.stampaCompletata && !order.stampaInCoda) {
            return '<span class="order-card__print-status order-card__print-status--empty" aria-hidden="true"></span>';
        }
        const normalizedMessage = message.toLocaleLowerCase("it");
        const state = /errore|non riusc|fallit/.test(normalizedMessage)
            ? "error"
            : /aggiunta|ristampa/.test(normalizedMessage)
                ? "addition"
                : order.stampaCompletata
                    ? "printed"
                    : "queued";
        const label = message || (order.stampaCompletata ? "Stampata" : "In coda");
        return `<span class="order-card__print-status order-card__print-status--${state}" role="status" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    }

    function renderActions(order, canEdit) {
        if (!canEdit) return "";
        const number = Number(order.numero);
        return `<div class="order-card__actions"><button type="button" data-modifica="${number}">Modifica ordine</button><button type="button" data-ristampa="${number}" aria-haspopup="dialog">Ristampa</button><button type="button" data-elimina="${number}" class="pericolo">Elimina</button></div>`;
    }

    function bindReprints(container) {
        let triggerButton = null;
        const dialog = document.createElement("dialog");
        dialog.className = "app-mappe-dialog app-ristampa-dialog";
        dialog.setAttribute("aria-labelledby", "app-ristampa-titolo");
        dialog.innerHTML = `
            <form method="dialog" class="app-mappe-chiudi"><button type="submit" aria-label="Chiudi">×</button></form>
            <h2 id="app-ristampa-titolo">Ristampa comanda</h2>
            <p>Scegli la stampante su cui inviare la ristampa.</p>
            <div class="app-ristampa-opzioni">
                <button class="app-ristampa-opzione" type="button" data-stampanti="Cucina">Cucina</button>
                <button class="app-ristampa-opzione" type="button" data-stampanti="Sala">Sala</button>
                <button class="app-ristampa-opzione" type="button" data-stampanti="Entrambe">Entrambe</button>
            </div>
            <p class="app-ristampa-stato" role="status" aria-live="polite"></p>
        `;
        const status = dialog.querySelector(".app-ristampa-stato");
        const options = dialog.querySelectorAll("[data-stampanti]");
        dialog.addEventListener("click", async event => {
            const option = event.target.closest("[data-stampanti]");
            if (!option || !triggerButton || option.disabled) return;
            const stampanti = option.dataset.stampanti === "Entrambe"
                ? ["Cucina", "Sala"]
                : [option.dataset.stampanti];
            const numero = triggerButton.dataset.ristampa;
            triggerButton.disabled = true;
            options.forEach(button => { button.disabled = true; });
            status.className = "app-ristampa-stato";
            status.textContent = "Invio ristampa...";
            try {
                const response = await fetch(`/api/ordini/${encodeURIComponent(numero)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ azione: "ristampa", stampanti })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.errore || "Ristampa non riuscita.");
                status.textContent = result.messaggioStampa || "Ristampa in coda.";
                if (window.themeToast) window.themeToast(status.textContent);
            } catch (error) {
                status.classList.add("errore");
                status.textContent = error.message || "Ristampa non riuscita.";
            } finally {
                triggerButton.disabled = false;
                options.forEach(button => { button.disabled = false; });
            }
        });
        document.body.append(dialog);
        container.addEventListener("click", event => {
            const button = event.target.closest("[data-ristampa]");
            if (!button || !container.contains(button)) return;
            triggerButton = button;
            status.className = "app-ristampa-stato";
            status.textContent = "";
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
        });
    }

    function render(order, options = {}) {
        const type = normalizeType(order.tipo);
        const serviceName = serviceNames[type] || serviceNames.tavolo;
        const date = new Date(order.dataOra);
        const dateText = Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("it-IT");
        const serviceTime = type !== "tavolo" && order.orario
            ? ` | Orario: ${escapeHtml(order.orario)}`
            : "";
        const menu = Array.isArray(options.menu) ? options.menu : [];
        const canEdit = options.canEdit === true;
        const note = order.note
            ? `<p class="order-card__note"><strong>Note:</strong> ${escapeHtml(order.note)}</p>`
            : "";
        const deliveryFee = type === "consegna" && Number(order.costoConsegna) > 0
            ? `<p class="order-card__delivery-fee">Costo consegna: ${euro.format(Number(order.costoConsegna))}</p>`
            : "";
        const printStatus = renderPrintStatus(order);

        return `
            <article class="order-card" data-order-type="${escapeHtml(type)}">
                <header class="order-card__header">
                    <div class="order-card__heading">
                        <h2 class="order-card__number">${serviceName} #${Number(order.numero)}</h2>
                    </div>
                    <div class="order-card__totals">
                        ${renderPayment(order, canEdit)}
                        <div class="order-card__total">${euro.format(Number(order.totale || 0))}</div>
                    </div>
                </header>
                ${printStatus}
                <p class="order-card__date">${dateText}${serviceTime}</p>
                ${renderFields(fieldsForOrder(order, type))}
                <details class="order-card__details">
                    <summary>Apri il dettaglio dell'ordine</summary>
                    <ul class="order-card__products">${renderProducts(order.righe, menu)}</ul>
                    ${deliveryFee}
                    ${note}
                </details>
                ${renderActions(order, canEdit)}
            </article>
        `;
    }

    return Object.freeze({ bindReprints, render });
})();

if (typeof module !== "undefined" && module.exports) module.exports = orderCard;
if (typeof window !== "undefined") window.orderCard = orderCard;
