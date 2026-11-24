const orderCard = (() => {
    const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
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

    function peopleLabel(order) {
        const people = Number(order.numeroPersone);
        if (!Number.isInteger(people) || people < 1) return "";
        return `${people} ${people === 1 ? "persona" : "persone"}`;
    }

    function orderName(order, type) {
        const reference = orderReference(order, type);
        if (type === "tavolo") {
            const people = peopleLabel(order);
            return [reference, people].filter(Boolean).join(" · ");
        }
        if (type === "banco") return reference === "Banco" ? reference : `Banco · ${reference}`;
        if (type === "ritiro") return reference === "Ritiro" ? reference : `Ritiro · ${reference}`;
        return reference;
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

    function printSummary(order) {
        const status = compactPrintStatus(order);
        if (!status || status.state === "error") return { state: "not-printed", label: "non stampata" };
        if (status.state === "queued") return { state: "queued", label: "in coda" };
        return { state: "printed", label: "stampata" };
    }

    function compactState(order, type) {
        if (type === "tavolo" && order.tavoloChiuso === true) {
            return {
                state: "paid-table",
                label: `pagato · ${formatTime(order.chiusoAlle)}`
            };
        }
        if (type === "consegna" && order.statoPagamento !== "pagato" && order.statoPagamento !== "pos") {
            const print = printSummary(order);
            if (print.state !== "printed") return print;
        }
        if (type === "consegna" || type === "ritiro") {
            const paid = order.statoPagamento === "pagato";
            const pos = order.statoPagamento === "pos";
            return {
                state: paid ? "paid" : pos ? "pos" : "unpaid",
                label: paid ? "pagato" : pos ? "POS" : "non pagato"
            };
        }
        return printSummary(order);
    }

    function renderCompactState(order, type) {
        const status = compactState(order, type);
        return `<span class="order-card__compact-state order-card__compact-state--${status.state}">${status.label}</span>`;
    }

    function fieldsForOrder(order, type) {
        if (type === "consegna") {
            return [
                {
                    value: order.telefonoConsegna || "—",
                    kind: "telephone"
                },
                {
                    value: order.indirizzoConsegna || "—",
                    kind: "address"
                }
            ];
        }
        return [];
    }

    function renderFieldValue(field) {
        const value = String(field.value ?? "—");
        const icon = field.kind === "telephone"
            ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.6 3.8 9.1 3l2 4.7-1.8 1.6a14 14 0 0 0 5.4 5.4l1.6-1.8 4.7 2-.8 2.5a2 2 0 0 1-2 1.4A15.5 15.5 0 0 1 4.2 5.8a2 2 0 0 1 1.4-2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
        if (field.kind === "telephone") {
            const action = value === "—"
                ? ""
                : `<a class="order-card__delivery-action order-card__delivery-action--call" href="tel:${escapeHtml(value.replace(/[^\d+]/g, ""))}">Chiama</a>`;
            return `<div class="order-card__delivery-contact"><span class="order-card__delivery-icon">${icon}</span><span class="order-card__delivery-value">${escapeHtml(value)}</span>${action}</div>`;
        }
        if (field.kind === "address") {
            const action = value === "—"
                ? ""
                : `<button class="order-card__delivery-action order-card__delivery-action--map" type="button" data-indirizzo="${escapeHtml(value)}" aria-haspopup="dialog">Mappa</button>`;
            return `<div class="order-card__delivery-contact"><span class="order-card__delivery-icon">${icon}</span><span class="order-card__delivery-value">${escapeHtml(value)}</span>${action}</div>`;
        }
        return escapeHtml(value);
    }

    function renderFields(fields) {
        if (!fields.length) return "";
        return `<div class="order-card__contacts">${fields.map(renderFieldValue).join("")}</div>`;
    }

    function extraIdentity(row) {
        return (Array.isArray(row.extra) ? row.extra : [])
            .map(extra => typeof extra === "string" ? extra : extra?.id || extra?.nome || "")
            .sort();
    }

    function rowNotes(row) {
        return (Array.isArray(row.note) ? row.note : typeof row.note === "string" ? [row.note] : [])
            .map(note => typeof note === "string" ? note.trim() : "")
            .filter(Boolean)
            .sort((first, second) => first.localeCompare(second, "it-IT"));
    }

    function groupProducts(rows) {
        const groups = new Map();
        (Array.isArray(rows) ? rows : []).forEach(row => {
            const extras = (Array.isArray(row.extra) ? row.extra : []).map(extra => (
                typeof extra === "string" ? extra : extra?.nome
            )).filter(Boolean);
            const senza = (Array.isArray(row.senza) ? row.senza : [])
                .filter(ingrediente => typeof ingrediente === "string" && ingrediente.trim());
            const price = Number(row.totale ?? row.prezzoBase ?? 0);
            const identity = JSON.stringify([row.prodotto, extraIdentity(row), senza.slice().sort(), rowNotes(row)]);
            const group = groups.get(identity);
            if (group) {
                group.quantity += 1;
                group.total += price;
            } else {
                groups.set(identity, {
                    row,
                    extras,
                    senza,
                    notes: rowNotes(row),
                    quantity: 1,
                    total: price
                });
            }
        });
        return [...groups.values()];
    }

    function renderProducts(rows) {
        return groupProducts(rows).map(({ row, extras, senza, notes, quantity, total }) => {
            const senzaMarkup = senza.length
                ? `<small class="order-card__without-ingredients">senza ${escapeHtml(senza.join(", "))}</small>`
                : "";
            const extraMarkup = extras.length
                ? `<small class="order-card__extra">+ ${escapeHtml(extras.join(", "))}</small>`
                : "";
            const noteMarkup = notes.map(note => (
                `<small class="order-card__product-note">${escapeHtml(note)}</small>`
            )).join("");
            return `<li><div class="order-card__product-row"><span class="order-card__product-quantity">${quantity}×</span><div class="order-card__product-name"><strong>${escapeHtml(row.prodotto)}</strong>${senzaMarkup}${extraMarkup}${noteMarkup}</div><span class="order-card__product-price">${euro.format(total)}</span></div></li>`;
        }).join("");
    }

    function renderPayment(order, canEdit, type) {
        if (!["ritiro", "consegna"].includes(type)) return "";
        const paymentUI = typeof window !== "undefined" ? window.paymentUI : null;
        return paymentUI?.badgeMarkup(order, canEdit) || "";
    }

    function renderPrintStatus(order) {
        const status = printSummary(order);
        return `<span class="order-card__print-status order-card__print-status--${status.state}">${status.label}</span>`;
    }

    function renderExpandedStatus(order, type, canEdit) {
        const items = [];
        const payment = renderPayment(order, canEdit, type);
        const requestedTime = ["consegna", "ritiro"].includes(type)
            ? String(order.orario || "").trim()
            : "";
        const print = printSummary(order);

        if (payment) items.push(payment);
        if (requestedTime) {
            items.push(`<span class="order-card__requested-time">Orario richiesto ${escapeHtml(requestedTime)}</span>`);
        }
        if (print.state !== "printed") items.push(renderPrintStatus(order));
        return items.length ? `<div class="order-card__detail-status">${items.join("")}</div>` : "";
    }

    function renderActions(order, type, canEdit) {
        if (!canEdit) return "";
        const number = Number(order.numero);
        const path = typeof window === "undefined" || !window.location ? "" : window.location.pathname;
        const origine = /^\/(gestionale|consegne|tavoli|ritiri|banco)(?:\.html)?$/.exec(path)?.[1] || "gestionale";
        const tableAction = type === "tavolo"
            ? `<button type="button" data-tavolo-chiuso="${String(order.tavoloChiuso !== true)}" data-numero="${number}">${order.tavoloChiuso === true ? "Riapri tavolo" : "Pagato e libero"}</button>`
            : "";
        const tableActionClass = type === "tavolo" ? " order-card__actions--table" : "";
        return `<div class="order-card__actions${tableActionClass}"><a href="/ordini.html?modifica=${number}&amp;da=${origine}" data-modifica="${number}">Modifica</a><button type="button" data-ristampa="${number}" aria-haspopup="dialog">Ristampa</button>${tableAction}<button type="button" data-elimina="${number}" class="pericolo" aria-label="Elimina ordine"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
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

    function renderServiceTile(order, type, time) {
        if (type === "tavolo") {
            let table = String(order.tavoloOCliente || "").trim();
            table = table.replace(/^tavolo\s*[:#-]?\s*/i, "");
            const label = /^t/i.test(table) ? table : `T${table}`;
            return `<span class="order-card__service-tile order-card__service-tile--tavolo"><strong>${escapeHtml(label || "T")}</strong><small>tavolo</small></span>`;
        }
        const icons = {
            consegna: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 6.5h11v10h-11zM13.5 10h4l4 4v2.5h-8zM6.5 19a1.5 1.5 0 1 0 0 .01M18 19a1.5 1.5 0 1 0 0 .01" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            ritiro: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 8h14l-1 13H6L5 8zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            banco: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 10h16v11H4zM3 10l2-6h14l2 6M8 14h4v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        };
        return `<span class="order-card__service-tile order-card__service-tile--${escapeHtml(type)}">${icons[type] || icons.tavolo}<small>${escapeHtml(time)}</small></span>`;
    }

    function renderCompactPreview(rows) {
        const counts = new Map();
        groupProducts(rows).forEach(group => {
            const name = String(group.row.prodotto || "");
            counts.set(name, (counts.get(name) || 0) + group.quantity);
        });
        return [...counts].map(([name, quantity]) => (
            `${quantity > 1 ? `${quantity}× ` : ""}${name}`
        )).join(", ") || "Nessun prodotto";
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

    function bindReprints(container, expansionState = expandedOrderState) {
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
            expansionState.toggle(button.dataset.orderNumber);
            container.querySelectorAll(".order-card").forEach(card => {
                const toggle = card.querySelector(".order-card__toggle");
                const expanded = card.querySelector(".order-card__expanded");
                const isOpen = expansionState.isOpen(card.dataset.orderNumber);
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
        const orderNumber = String(order.numero ?? "");
        const detailId = `order-detail-${escapeHtml(orderNumber)}`;
        const expansionState = options.expansionState || expandedOrderState;
        const expanded = expansionState.isOpen(order.numero);
        const deliveryMode = options.deliveryMode === true && type === "consegna";
        const name = orderName(order, type);
        const serviceTime = ["consegna", "ritiro"].includes(type)
            ? String(order.orario || "—")
            : formatTime(order.dataOra);
        const metadata = ["consegna", "ritiro"].includes(type)
            ? `#${escapeHtml(orderNumber)} · ${escapeHtml(renderCompactPreview(order.righe))}`
            : `#${escapeHtml(orderNumber)} · ${escapeHtml(formatTime(order.dataOra))} · ${escapeHtml(renderCompactPreview(order.righe))}`;
        const canEdit = options.canEdit === true;
        const hideTotalForStaff = options.hideTotalForStaff === true;
        const isStaff = typeof window !== "undefined" && window.currentAccount?.staff === true;
        const compactTotalAttributes = hideTotalForStaff
            ? ` data-hide-for-staff${isStaff ? " hidden" : ""}`
            : "";
        const note = order.note
            ? `<p class="order-card__note"><strong>Note ordine:</strong> ${escapeHtml(order.note)}</p>`
            : "";
        const deliveryFee = type === "consegna" && Number(order.costoConsegna) > 0
            ? `<p class="order-card__delivery-fee">Costo consegna <span>${euro.format(Number(order.costoConsegna))}</span></p>`
            : "";
        const coverCharge = type === "tavolo" && Number(order.coperto?.totale) > 0
            ? `<p class="order-card__cover-charge">Coperto <span>${Number(order.coperto.persone)} × ${euro.format(Number(order.coperto.prezzoUnitario))}</span></p>`
            : "";
        const compactStatus = deliveryMode
            ? renderDeliveryCompactStatus(order)
            : renderCompactState(order, type);
        const deliveryAmount = options.isRider === true && order.statoPagamento === "pagato"
            ? 0
            : Number(order.totale || 0);
        const compactTotal = deliveryMode
            ? euro.format(deliveryAmount)
            : euro.format(Number(order.totale || 0));
        const closedTable = type === "tavolo" && order.tavoloChiuso === true;
        return `
            <article class="order-card${expanded ? " order-card--expanded" : ""}${deliveryMode ? " order-card--delivery-mode" : ""}${closedTable ? " order-card--closed" : ""}" data-order-type="${escapeHtml(type)}" data-order-number="${escapeHtml(orderNumber)}">
                <div class="order-card__compact-row">
                    <button class="order-card__toggle" type="button" data-order-number="${escapeHtml(orderNumber)}" aria-expanded="${String(expanded)}" aria-controls="${detailId}">
                        ${renderServiceTile(order, type, serviceTime)}
                        <span class="order-card__compact-copy">
                            <span class="order-card__reference">${escapeHtml(name)}</span>
                            <span class="order-card__meta">${metadata}</span>
                        </span>
                    </button>
                    <span class="order-card__compact-status">
                        <span class="order-card__compact-total${closedTable ? " order-card__compact-total--closed" : ""}"${compactTotalAttributes}>${compactTotal}</span>
                        ${compactStatus}
                    </span>
                </div>
                <div class="order-card__expanded" id="${detailId}"${expanded ? "" : " hidden"}>
                    ${renderExpandedStatus(order, type, canEdit)}
                    ${renderFields(fieldsForOrder(order, type))}
                    ${renderDeliveryUndo(order, deliveryMode)}
                    <section class="order-card__details">
                        <ul class="order-card__products">${renderProducts(order.righe)}</ul>
                        ${coverCharge}
                        ${deliveryFee}
                        ${note}
                    </section>
                    ${renderActions(order, type, canEdit)}
                </div>
            </article>
        `;
    }

    return Object.freeze({ bindDateFilter, bindReprints, createExpansionState, render });
})();

if (typeof module !== "undefined" && module.exports) module.exports = orderCard;
if (typeof window !== "undefined") window.orderCard = orderCard;
