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
                { label: "Nome", value: order.tavoloOCliente || "—", inline: true },
                { label: "Telefono", value: order.telefonoRitiro || "—", kind: "telephone" }
            ];
        }
        if (type === "banco") {
            return [{ label: "Nome", value: order.cognomeBanco || "—", inline: true }];
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
            return `<button class="order-card__field-action" type="button" data-indirizzo="${escapeHtml(value)}" aria-haspopup="dialog"><span>${escapeHtml(value)}</span><span class="order-card__field-hint">Apri nelle mappe</span></button>`;
        }
        return escapeHtml(value);
    }

    function renderFields(fields, type) {
        const layoutClass = type === "consegna" ? " order-card__fields--delivery" : "";
        const fieldMarkup = fields.map(field => `
            <div class="order-card__field${field.inline ? " order-card__field--inline" : ""}">
                <strong class="order-card__field-label">${escapeHtml(field.label)}</strong>
                <div class="order-card__field-value">${renderFieldValue(field)}</div>
            </div>
        `).join("");
        return `<div class="order-card__fields${layoutClass}">${fieldMarkup}</div>`;
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

    function renderActions(order, canEdit) {
        if (!canEdit) return "";
        const number = Number(order.numero);
        return `<div class="order-card__actions"><button type="button" data-modifica="${number}">Modifica ordine</button><button type="button" data-elimina="${number}" class="pericolo">Elimina</button></div>`;
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

        return `
            <article class="order-card" data-order-type="${escapeHtml(type)}">
                <header class="order-card__header">
                    <div class="order-card__heading">
                        <span class="order-card__number">${serviceName} #${Number(order.numero)}</span>
                        <h2 class="order-card__title">Dettagli ${serviceName.toLowerCase()}</h2>
                    </div>
                    <div class="order-card__totals">
                        ${renderPayment(order, canEdit)}
                        <div class="order-card__total">${euro.format(Number(order.totale || 0))}</div>
                    </div>
                    <p class="order-card__date">${dateText}${serviceTime}</p>
                </header>
                ${renderFields(fieldsForOrder(order, type), type)}
                <details class="order-card__details">
                    <summary>Apri il dettaglio dell'ordine</summary>
                    <ul class="order-card__products">${renderProducts(order.righe, menu)}</ul>
                    ${note}
                </details>
                ${renderActions(order, canEdit)}
            </article>
        `;
    }

    return Object.freeze({ render });
})();

if (typeof module !== "undefined" && module.exports) module.exports = orderCard;
if (typeof window !== "undefined") window.orderCard = orderCard;
