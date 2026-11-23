const orderCard = (() => {
    const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
    const serviceNames = {
        banco: "Banco",
        consegna: "Consegna",
        ritiro: "Ritiro",
        tavolo: "Tavolo"
    };
    const expandedOrderState = createExpansionState();

    function createExpansionState() {
        let openOrderNumber = null;
        return {
            isOpen(number) {
                return openOrderNumber !== null && openOrderNumber === String(number);
            },
            toggle(number) {
                const normalized = String(number);
                openOrderNumber = openOrderNumber === normalized ? null : normalized;
                return openOrderNumber;
            }
        };
    }

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

    function orderReference(order, type) {
        if (type === "tavolo") {
            const table = String(order.tavoloOCliente || "").trim();
            if (!table) return "Tavolo";
            return /^tavolo\b/i.test(table) ? table : `Tavolo ${table}`;
        }
        if (type === "banco") return String(order.cognomeBanco || "").trim() || "Banco";
        if (type === "ritiro") return String(order.tavoloOCliente || "").trim() || "Ritiro";
        return String(order.indirizzoConsegna || "").trim() || "Consegna";
    }

    function expandedHeading(order, type) {
        const reference = orderReference(order, type);
        let heading = reference;
        if (type === "consegna") heading = "Consegna";
        else if (type !== "tavolo" && reference !== serviceNames[type]) {
            heading = `${serviceNames[type] || serviceNames.tavolo} ${reference}`;
        }
        return `${heading} · ordine #${Number(order.numero)}`;
    }

    function formatTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.valueOf())
            ? "—"
            : date.toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Rome"
            });
    }

    function compactPrintStatus(order) {
        const message = String(order.messaggioStampa || "").trim();
        const normalizedMessage = message.toLocaleLowerCase("it");
        if (/errore|non riusc|fallit/.test(normalizedMessage)) {
            return { state: "error", icon: "!", label: message || "Errore di stampa" };
        }
        if (order.stampaInCoda) {
            return { state: "queued", icon: "◷", label: message || "In coda" };
        }
        if (order.stampaCompletata) {
            return { state: "printed", icon: "✓", label: message || "Stampata" };
        }
        if (/aggiunta|ristampa/.test(normalizedMessage)) {
            return { state: "queued", icon: "◷", label: message };
        }
        return null;
    }

    function renderCompactPrintStatus(order) {
        const status = compactPrintStatus(order);
        if (!status) return "";
        return `<span class="order-card__compact-print order-card__compact-print--${status.state}" role="img" aria-label="${escapeHtml(status.label)}" title="${escapeHtml(status.label)}">${status.icon}</span>`;
    }

    function renderPaymentDot(order, type) {
        if (!["ritiro", "consegna"].includes(type)) return "";
        const state = order.statoPagamento === "pagato"
            ? "paid"
            : order.statoPagamento === "pos" ? "pos" : "unpaid";
        const label = state === "paid" ? "Pagato" : state === "pos" ? "POS" : "Non pagato";
        return `<span class="order-card__payment-dot order-card__payment-dot--${state}" role="img" aria-label="${label}" title="${label}"></span>`;
    }

    function fieldsForOrder(order, type, deliveryMode) {
        if (type === "consegna") {
            return [
                {
                    label: "Telefono",
                    value: order.telefonoConsegna || "—",
                    kind: "telephone",
                    deliveryAction: deliveryMode
                },
                {
                    label: "Indirizzo",
                    value: order.indirizzoConsegna || "—",
                    kind: "address",
                    deliveryAction: deliveryMode
                }
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
            if (field.deliveryAction) {
                return `<div class="order-card__delivery-contact"><a class="order-card__delivery-action order-card__delivery-action--call" href="tel:${escapeHtml(phone)}">Chiama</a><small>${escapeHtml(value)}</small></div>`;
            }
            return `<a class="order-card__field-link" href="tel:${escapeHtml(phone)}">${escapeHtml(value)}</a>`;
        }
        if (field.kind === "address" && value !== "—") {
            if (field.deliveryAction) {
                return `<div class="order-card__delivery-contact"><button class="order-card__delivery-action order-card__delivery-action--map" type="button" data-indirizzo="${escapeHtml(value)}" aria-haspopup="dialog" aria-label="Apri la mappa: ${escapeHtml(value)}">Apri mappa</button><small>${escapeHtml(value)}</small></div>`;
            }
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
        const groups = new Map();
        (Array.isArray(rows) ? rows : []).forEach(row => {
            const extras = (Array.isArray(row.extra) ? row.extra : []).map(extra => (
                typeof extra === "string" ? extra : extra?.nome
            )).filter(Boolean);
            const senza = (Array.isArray(row.senza) ? row.senza : [])
                .filter(ingrediente => typeof ingrediente === "string" && ingrediente.trim());
            const price = Number(row.totale ?? row.prezzoBase ?? 0);
            const identity = JSON.stringify([
                row.prodotto,
                extras.slice().sort(),
                senza.slice().sort(),
                price
            ]);
            const group = groups.get(identity);
            if (group) {
                group.quantity += 1;
            } else {
                groups.set(identity, { row, extras, senza, price, quantity: 1 });
            }
        });

        return [...groups.values()].map(({ row, extras, senza, price, quantity }) => {
            const ingredients = menu.find(product => product.nome === row.prodotto)?.ingredienti || [];
            const ingredientMarkup = ingredients.length
                ? `<small class="order-card__ingredients">${escapeHtml(ingredients.join(", "))}</small>`
                : "";
            const senzaMarkup = senza.length
                ? `<small class="order-card__without-ingredients">senza ${escapeHtml(senza.join(", "))}</small>`
                : "";
            const extraMarkup = extras.length
                ? `<span class="order-card__extra">Extra: ${escapeHtml(extras.join(", "))}</span>`
                : "";
            const productName = quantity > 1 ? `${quantity}× ${row.prodotto}` : row.prodotto;
            return `<li><div class="order-card__product-row"><div><strong>${escapeHtml(productName)}</strong>${ingredientMarkup}${senzaMarkup}</div><span>${euro.format(price * quantity)}</span></div>${extraMarkup}</li>`;
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

    function deliveryStatus(order) {
        return ["da_consegnare", "in_consegna", "consegnata"].includes(order.statoConsegna)
            ? order.statoConsegna
            : "da_consegnare";
    }

    function renderDeliveryCompactStatus(order) {
        const status = deliveryStatus(order);
        const numero = escapeHtml(order.numero);
        if (status === "consegnata") {
            const time = order.consegnataAlle ? ` ${formatTime(order.consegnataAlle)}` : "";
            return `<span class="order-card__delivery-status order-card__delivery-status--consegnata" aria-label="Consegnata${escapeHtml(time)}"><span aria-hidden="true">✓</span><small>consegnata${escapeHtml(time)}</small></span>`;
        }
        const nextStatus = status === "da_consegnare" ? "in_consegna" : "consegnata";
        const label = status === "da_consegnare" ? "Parti" : "Consegnata";
        return `<button class="order-card__delivery-status order-card__delivery-status--${status}" type="button" data-stato-consegna="${nextStatus}" data-numero="${numero}">${label}</button>`;
    }

    function renderDeliveryUndo(order, deliveryMode) {
        if (!deliveryMode || deliveryStatus(order) !== "consegnata") return "";
        return `<button class="order-card__delivery-undo" type="button" data-stato-consegna="in_consegna" data-numero="${escapeHtml(order.numero)}">Annulla consegnata</button>`;
    }

    function currentDate() {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Rome",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    }

    function bindDateFilter(input, button) {
        const label = button.querySelector("[data-date-label]");
        if (!input.value) input.value = currentDate();
        function aggiornaEtichetta() {
            const today = currentDate();
            const isToday = !input.value || input.value === today;
            const [, month, day] = (input.value || today).split("-");
            const dateLabel = isToday ? "Oggi" : `${day}/${month}`;
            button.classList.toggle("selezionata", !isToday);
            input.setAttribute("aria-label", isToday ? "Data ordini, oggi" : `Data ordini, ${dateLabel}`);
            button.title = isToday ? "Oggi" : dateLabel;
            label.textContent = dateLabel;
        }
        input.addEventListener("change", aggiornaEtichetta);
        aggiornaEtichetta();
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
            const button = event.target.closest(".order-card__toggle");
            if (!button || !container.contains(button)) return;
            expandedOrderState.toggle(button.dataset.orderNumber);
            container.querySelectorAll(".order-card").forEach(card => {
                const toggle = card.querySelector(".order-card__toggle");
                const expanded = card.querySelector(".order-card__expanded");
                const isOpen = expandedOrderState.isOpen(card.dataset.orderNumber);
                toggle.setAttribute("aria-expanded", String(isOpen));
                expanded.hidden = !isOpen;
                card.classList.toggle("order-card--expanded", isOpen);
            });
        });
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
        const reference = orderReference(order, type);
        const heading = expandedHeading(order, type);
        const orderNumber = String(order.numero ?? "");
        const detailId = `order-detail-${escapeHtml(orderNumber)}`;
        const expansionState = options.expansionState || expandedOrderState;
        const expanded = expansionState.isOpen(order.numero);
        const deliveryMode = options.deliveryMode === true && type === "consegna";
        const isRider = options.isRider === true;
        const serviceLabel = options.showServiceTypeLabel === true
            ? `<span class="order-card__type order-card__type--${escapeHtml(type)}">${escapeHtml(serviceNames[type] || serviceNames.tavolo)}</span>`
            : "";
        const date = new Date(order.dataOra);
        const dateText = Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("it-IT");
        const serviceTime = type !== "tavolo" && order.orario
            ? ` | Orario: ${escapeHtml(order.orario)}`
            : "";
        const time = order.orario || formatTime(order.dataOra);
        const people = type === "tavolo" && Number.isInteger(Number(order.numeroPersone))
            && Number(order.numeroPersone) > 0
            ? `${Number(order.numeroPersone)} pers`
            : "";
        const paymentState = order.statoPagamento === "pagato"
            ? "Pagato"
            : order.statoPagamento === "pos" ? "POS" : "Non pagato";
        const deliveryAmount = isRider && order.statoPagamento === "pagato"
            ? 0
            : Number(order.totale || 0);
        const metadata = deliveryMode
            ? [`#${escapeHtml(orderNumber)}`, order.orario ? `ore ${escapeHtml(order.orario)}` : "", `${paymentState} ${euro.format(deliveryAmount)}`]
                .filter(Boolean).join(" · ")
            : [`#${escapeHtml(orderNumber)}`, people, escapeHtml(time)].filter(Boolean).join(" · ");
        const menu = Array.isArray(options.menu) ? options.menu : [];
        const canEdit = options.canEdit === true;
        const hideTotalForStaff = options.hideTotalForStaff === true;
        const isStaff = typeof window !== "undefined" && window.currentAccount?.staff === true;
        const compactTotalAttributes = hideTotalForStaff
            ? ` data-hide-for-staff${isStaff ? " hidden" : ""}`
            : "";
        const note = order.note
            ? `<p class="order-card__note"><strong>Note:</strong> ${escapeHtml(order.note)}</p>`
            : "";
        const deliveryFee = type === "consegna" && Number(order.costoConsegna) > 0
            ? `<p class="order-card__delivery-fee">Costo consegna: ${euro.format(Number(order.costoConsegna))}</p>`
            : "";
        const coverCharge = type === "tavolo" && Number(order.coperto?.totale) > 0
            ? `<p class="order-card__cover-charge">Coperto ${Number(order.coperto.persone)} × ${euro.format(Number(order.coperto.prezzoUnitario))}</p>`
            : "";
        const printStatus = renderPrintStatus(order);
        const compactRow = deliveryMode
            ? `<div class="order-card__compact-row">
                <button class="order-card__toggle" type="button" data-order-number="${escapeHtml(orderNumber)}" aria-expanded="${String(expanded)}" aria-controls="${detailId}">
                    <span class="order-card__compact-copy">
                        ${serviceLabel}
                        <span class="order-card__reference order-card__reference--delivery">${escapeHtml(reference)}</span>
                        <span class="order-card__meta">${metadata}</span>
                    </span>
                </button>
                <span class="order-card__compact-status">${renderDeliveryCompactStatus(order)}</span>
            </div>`
            : `<button class="order-card__toggle" type="button" data-order-number="${escapeHtml(orderNumber)}" aria-expanded="${String(expanded)}" aria-controls="${detailId}">
                <span class="order-card__compact-copy">
                    ${serviceLabel}
                    <span class="order-card__reference">${escapeHtml(reference)}</span>
                    <span class="order-card__meta">${metadata}</span>
                </span>
                <span class="order-card__compact-status">
                    <span class="order-card__compact-total"${compactTotalAttributes}>${euro.format(Number(order.totale || 0))}</span>
                    ${renderCompactPrintStatus(order)}
                    ${renderPaymentDot(order, type)}
                </span>
            </button>`;

        return `
            <article class="order-card${expanded ? " order-card--expanded" : ""}${deliveryMode ? " order-card--delivery-mode" : ""}" data-order-type="${escapeHtml(type)}" data-order-number="${escapeHtml(orderNumber)}">
                ${compactRow}
                <div class="order-card__expanded" id="${detailId}"${expanded ? "" : " hidden"}>
                    <header class="order-card__header">
                        <div class="order-card__heading">
                            <h2 class="order-card__number">${escapeHtml(heading)}</h2>
                        </div>
                        <div class="order-card__totals">
                            ${renderPayment(order, canEdit)}
                            <div class="order-card__total">${euro.format(Number(order.totale || 0))}</div>
                        </div>
                    </header>
                    ${printStatus}
                    <p class="order-card__date">${dateText}${serviceTime}</p>
                    ${renderFields(fieldsForOrder(order, type, deliveryMode))}
                    ${renderDeliveryUndo(order, deliveryMode)}
                    <section class="order-card__details">
                        <ul class="order-card__products">${renderProducts(order.righe, menu)}</ul>
                        ${coverCharge}
                        ${deliveryFee}
                        ${note}
                    </section>
                    ${renderActions(order, canEdit)}
                </div>
            </article>
        `;
    }

    return Object.freeze({ bindDateFilter, bindReprints, createExpansionState, render });
})();

if (typeof module !== "undefined" && module.exports) module.exports = orderCard;
if (typeof window !== "undefined") window.orderCard = orderCard;
