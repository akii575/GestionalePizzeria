(() => {
    const { escapeHtml } = window.htmlUtils;
    const content = document.getElementById("menu-content");
    const archivedContent = document.getElementById("menu-archived-content");
    const search = document.getElementById("menu-search");
    const status = document.getElementById("menu-status");
    const undoToast = document.getElementById("menu-undo-toast");
    const undoButton = document.getElementById("menu-undo");
    const backdrop = document.getElementById("menu-editor-backdrop");
    const editor = document.getElementById("menu-editor");
    const form = document.getElementById("menu-form");
    const formError = document.getElementById("menu-form-error");
    const categorySelect = document.getElementById("menu-category");
    const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
    const state = {
        resource: "prodotti",
        menu: { categorie: [], prodotti: [], extra: [] },
        id: null,
        focusReturn: null,
        saving: false,
        undo: null,
        undoTimer: null
    };

    function sortByOrder(items) {
        return [...items].sort((first, second) => Number(first.ordine || 0) - Number(second.ordine || 0)
            || first.id.localeCompare(second.id));
    }

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle("is-error", isError);
    }

    function hideUndoToast() {
        window.clearTimeout(state.undoTimer);
        state.undoTimer = null;
        state.undo = null;
        undoToast.hidden = true;
        undoButton.disabled = false;
    }

    function showUndoToast(resource, id) {
        window.clearTimeout(state.undoTimer);
        state.undo = { resource, id };
        undoToast.hidden = false;
        undoButton.disabled = false;
        state.undoTimer = window.setTimeout(hideUndoToast, 6000);
    }

    function matchesSearch(...values) {
        const query = search.value.trim().toLocaleLowerCase("it-IT");
        return !query || values.some(value => String(value || "").toLocaleLowerCase("it-IT").includes(query));
    }

    function categoryFor(product) {
        return state.menu.categorie.find(category => category.id === product.categoriaId);
    }

    function activeCategories() {
        return sortByOrder(state.menu.categorie.filter(category => category.archiviata !== true));
    }

    function rowMain(name, meta = "") {
        return `<div class="menu-row-main"><span class="menu-row-title">${escapeHtml(name)}</span>${meta ? `<span class="menu-row-meta">${escapeHtml(meta)}</span>` : ""}</div>`;
    }

    function orderButtons(id, index, length, resource, categoryId = "") {
        const escapedId = escapeHtml(id);
        const escapedCategoryId = escapeHtml(categoryId);
        return `<div class="menu-row-actions"><button class="menu-order-button" type="button" data-action="up" data-resource="${resource}" data-id="${escapedId}" data-category="${escapedCategoryId}" aria-label="Sposta su" ${index === 0 ? "disabled" : ""}>↑</button><button class="menu-order-button" type="button" data-action="down" data-resource="${resource}" data-id="${escapedId}" data-category="${escapedCategoryId}" aria-label="Sposta giù" ${index === length - 1 ? "disabled" : ""}>↓</button></div>`;
    }

    function editButton(resource, id) {
        return `<button class="menu-edit-button" type="button" data-action="edit" data-resource="${resource}" data-id="${escapeHtml(id)}">Modifica</button>`;
    }

    function archiveButton(resource, id) {
        return `<button class="menu-edit-button" type="button" data-action="archive" data-resource="${resource}" data-id="${escapeHtml(id)}">Archivia</button>`;
    }

    function deleteButton(resource, id, permanent = false) {
        const action = permanent ? "delete-permanently" : "delete";
        const label = permanent ? "Elimina definitivamente" : "Elimina";
        return `<button class="menu-delete-button" type="button" data-action="${action}" data-resource="${resource}" data-id="${escapeHtml(id)}">${label}</button>`;
    }

    function renderProductRow(product, products) {
        const index = products.findIndex(item => item.id === product.id);
        const ingredientText = Array.isArray(product.ingredienti) ? product.ingredienti.join(", ") : "";
        const meta = [
            euro.format(Number(product.prezzo)),
            ingredientText
        ].filter(Boolean).join(" · ");
        const available = product.disponibile !== false;
        return `<div class="menu-row" data-id="${escapeHtml(product.id)}">
            ${rowMain(product.nome, meta)}
            <div class="menu-row-end"><button class="menu-availability${available ? "" : " is-unavailable"}" type="button" data-action="availability" data-resource="prodotti" data-id="${escapeHtml(product.id)}" aria-pressed="${available}">${available ? "Disponibile" : "Esaurito"}</button>${editButton("prodotti", product.id)}${deleteButton("prodotti", product.id)}</div>
            ${orderButtons(product.id, index, products.length, "prodotti", product.categoriaId)}
        </div>`;
    }

    function renderProducts() {
        const categories = activeCategories();
        const sections = [];
        for (const category of categories) {
            const products = sortByOrder(state.menu.prodotti.filter(product => (
                product.categoriaId === category.id && product.archiviato !== true
            )));
            const visible = products.filter(product => matchesSearch(
                product.nome,
                category.nome,
                ...(product.ingredienti || [])
            ));
            if (!visible.length) continue;
            sections.push(`<section class="menu-section">
                <header class="menu-section-header"><h2>${escapeHtml(category.nome)}</h2><span>${visible.length} prodotti</span></header>
                ${visible.map(product => renderProductRow(product, products)).join("")}
            </section>`);
        }
        content.innerHTML = sections.join("") || `<div class="menu-empty">Nessun prodotto trovato.</div>`;
    }

    function renderCategories() {
        const categories = activeCategories();
        const visible = categories.filter(category => matchesSearch(category.nome));
        content.innerHTML = visible.length ? `<section class="menu-section">
            ${visible.map(category => {
                const index = categories.findIndex(item => item.id === category.id);
                const productCount = state.menu.prodotti.filter(product => (
                    product.categoriaId === category.id && product.archiviato !== true
                )).length;
                return `<div class="menu-row" data-id="${escapeHtml(category.id)}">
                    ${rowMain(category.nome, `${productCount} prodotti · ${category.ammetteExtra ? "Ammette extra" : "Senza extra"}${category.stampaCucina === false ? " · Non in cucina" : ""}${(category.stampaVariazioni === undefined ? category.stampaCucina !== false : category.stampaVariazioni === true) ? "" : " · Non nelle variazioni"}`)}
                    <div class="menu-row-end">${editButton("categorie", category.id)}${archiveButton("categorie", category.id)}${deleteButton("categorie", category.id)}</div>
                    ${orderButtons(category.id, index, categories.length, "categorie")}
                </div>`;
            }).join("")}
        </section>` : `<div class="menu-empty">Nessuna categoria trovata.</div>`;
    }

    function renderExtras() {
        const extras = sortByOrder(state.menu.extra.filter(extra => extra.archiviato !== true));
        const visible = extras.filter(extra => matchesSearch(extra.nome));
        content.innerHTML = visible.length ? `<section class="menu-section">
            ${visible.map(extra => {
                const available = extra.disponibile !== false;
                return `<div class="menu-row" data-id="${escapeHtml(extra.id)}">
                    ${rowMain(extra.nome, euro.format(Number(extra.prezzo)))}
                    <div class="menu-row-end"><button class="menu-availability${available ? "" : " is-unavailable"}" type="button" data-action="availability" data-resource="extra" data-id="${escapeHtml(extra.id)}" aria-pressed="${available}">${available ? "Disponibile" : "Esaurito"}</button>${editButton("extra", extra.id)}${archiveButton("extra", extra.id)}${deleteButton("extra", extra.id)}</div>
                </div>`;
            }).join("")}
        </section>` : `<div class="menu-empty">Nessun extra trovato.</div>`;
    }

    function renderArchivedRow(resource, item, meta, canRestore = true) {
        return `<div class="menu-row is-archived">
            ${rowMain(item.nome, meta)}
            <div class="menu-row-end">${canRestore ? `<button class="menu-restore" type="button" data-action="restore" data-resource="${resource}" data-id="${escapeHtml(item.id)}">Ripristina</button>${deleteButton(resource, item.id, true)}` : ""}</div>
        </div>`;
    }

    function renderArchived() {
        const sections = [];
        if (state.resource === "categorie") {
            const archived = state.menu.categorie.filter(item => item.archiviata === true && matchesSearch(item.nome));
            sections.push(...archived.map(item => renderArchivedRow("categorie", item, item.ammetteExtra ? "Ammette extra" : "Senza extra")));
        } else if (state.resource === "prodotti") {
            const archivedCategories = new Set(
                state.menu.categorie.filter(category => category.archiviata === true).map(category => category.id)
            );
            const archived = state.menu.prodotti.filter(item => (
                (item.archiviato === true || archivedCategories.has(item.categoriaId))
                && matchesSearch(item.nome, categoryFor(item)?.nome, ...(item.ingredienti || []))
            ));
            sections.push(...archived.map(item => {
                const categoryArchived = archivedCategories.has(item.categoriaId);
                const meta = [
                    euro.format(Number(item.prezzo)),
                    categoryFor(item)?.nome,
                    categoryArchived ? "Categoria archiviata" : "Prodotto archiviato"
                ].filter(Boolean).join(" · ");
                return renderArchivedRow("prodotti", item, meta, !categoryArchived);
            }));
        } else {
            const archived = state.menu.extra.filter(item => item.archiviato === true && matchesSearch(item.nome));
            sections.push(...archived.map(item => renderArchivedRow("extra", item, euro.format(Number(item.prezzo)))));
        }
        archivedContent.innerHTML = sections.join("") || `<p class="menu-empty">Nessun elemento archiviato.</p>`;
    }

    function render() {
        if (state.resource === "prodotti") renderProducts();
        else if (state.resource === "categorie") renderCategories();
        else renderExtras();
        renderArchived();
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.errore || "Impossibile completare l'operazione.");
        return body;
    }

    async function loadMenu(message = "") {
        try {
            state.menu = await request("/api/menu-admin");
            render();
            setStatus(message);
        } catch (error) {
            setStatus(error.message, true);
        }
    }

    function closeEditor() {
        if (state.saving) return;
        backdrop.hidden = true;
        document.body.classList.remove("menu-editor-open");
        state.id = null;
        formError.textContent = "";
        state.focusReturn?.focus({ preventScroll: true });
    }

    function setFieldVisibility(resource) {
        document.getElementById("menu-category-field").hidden = resource !== "prodotti";
        document.getElementById("menu-price-field").hidden = resource === "categorie";
        document.getElementById("menu-ingredients-field").hidden = resource !== "prodotti";
        document.getElementById("menu-composable-field").hidden = resource !== "prodotti";
        document.getElementById("menu-extra-allowed-field").hidden = resource !== "categorie";
        document.getElementById("menu-kitchen-print-field").hidden = resource !== "categorie";
        document.getElementById("menu-variation-print-field").hidden = resource !== "categorie";
        document.getElementById("menu-available-field").hidden = resource === "categorie";
        categorySelect.innerHTML = activeCategories().map(category => (
            `<option value="${escapeHtml(category.id)}">${escapeHtml(category.nome)}</option>`
        )).join("");
        document.getElementById("menu-price").required = resource !== "categorie";
        categorySelect.required = resource === "prodotti";
    }

    function openEditor(resource, item = null, trigger = document.activeElement) {
        state.resource = resource;
        state.id = item?.id || null;
        state.focusReturn = trigger;
        form.reset();
        setFieldVisibility(resource);
        document.getElementById("menu-editor-title").textContent = item
            ? `Modifica ${resource === "prodotti" ? "prodotto" : resource === "categorie" ? "categoria" : "extra"}`
            : `Nuovo ${resource === "prodotti" ? "prodotto" : resource === "categorie" ? "categoria" : "extra"}`;
        document.getElementById("menu-name").value = item?.nome || "";
        document.getElementById("menu-price").value = item?.prezzo ?? "";
        document.getElementById("menu-ingredients").value = item?.ingredienti?.join(", ") || "";
        document.getElementById("menu-composable").checked = item?.componibile === true;
        document.getElementById("menu-extra-allowed").checked = item?.ammetteExtra === true;
        document.getElementById("menu-kitchen-print").checked = item?.stampaCucina !== false;
        document.getElementById("menu-variation-print").checked = item?.stampaVariazioni
            ?? (item?.stampaCucina !== false);
        document.getElementById("menu-available").checked = item?.disponibile !== false;
        if (item?.categoriaId) categorySelect.value = item.categoriaId;
        document.getElementById("menu-archive").hidden = !item;
        document.getElementById("menu-archive").textContent = "Archivia";
        backdrop.hidden = false;
        document.body.classList.add("menu-editor-open");
        document.getElementById("menu-name").focus({ preventScroll: true });
    }

    function setSaving(value) {
        state.saving = value;
        backdrop.classList.toggle("is-saving", value);
        editor.querySelectorAll("button, input, select, textarea").forEach(control => {
            control.disabled = value;
        });
    }

    function editorPayload() {
        const payload = {
            nome: document.getElementById("menu-name").value,
            risorsa: state.resource
        };
        if (state.resource === "prodotti") {
            payload.categoriaId = categorySelect.value;
            payload.prezzo = Number(document.getElementById("menu-price").value);
            payload.ingredienti = document.getElementById("menu-ingredients").value
                .split(",").map(value => value.trim()).filter(Boolean);
            payload.componibile = document.getElementById("menu-composable").checked;
            payload.disponibile = document.getElementById("menu-available").checked;
        } else if (state.resource === "extra") {
            payload.prezzo = Number(document.getElementById("menu-price").value);
            payload.disponibile = document.getElementById("menu-available").checked;
        } else {
            payload.ammetteExtra = document.getElementById("menu-extra-allowed").checked;
            payload.stampaCucina = document.getElementById("menu-kitchen-print").checked;
            payload.stampaVariazioni = document.getElementById("menu-variation-print").checked;
        }
        return payload;
    }

    function recordFor(resource, id) {
        return state.menu[resource].find(item => item.id === id);
    }

    async function updateItem(resource, id, fields, successMessage = "Salvato") {
        const body = { ...fields, risorsa: resource, id };
        await request("/api/menu-admin", { method: "PATCH", body: JSON.stringify(body) });
        await loadMenu(successMessage);
    }

    async function moveItem(button) {
        const resource = button.dataset.resource;
        const categoryId = button.dataset.category;
        const list = resource === "categorie"
            ? activeCategories()
            : sortByOrder(state.menu.prodotti.filter(item => (
                item.categoriaId === categoryId && item.archiviato !== true
            )));
        const index = list.findIndex(item => item.id === button.dataset.id);
        const direction = button.dataset.action === "up" ? -1 : 1;
        const target = index + direction;
        if (index < 0 || target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        await request("/api/menu-admin", {
            method: "PUT",
            body: JSON.stringify({
                risorsa: resource,
                azione: "ordine",
                categoriaId: categoryId,
                ids: list.map(item => item.id)
            })
        });
        await loadMenu("Ordine aggiornato.");
    }

    async function handleItemAction(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const { action, resource, id } = button.dataset;
        try {
            if (action === "edit") {
                openEditor(resource, recordFor(resource, id), button);
            } else if (action === "availability") {
                const item = recordFor(resource, id);
                await updateItem(resource, id, { disponibile: item.disponibile === false }, "Disponibilita' aggiornata.");
            } else if (action === "archive") {
                if (!window.confirm("Archiviare questo elemento?")) return;
                await updateItem(resource, id, { [resource === "categorie" ? "archiviata" : "archiviato"]: true }, "Elemento archiviato.");
            } else if (action === "delete") {
                const item = recordFor(resource, id);
                if (!item || !window.confirm(`Eliminare '${item.nome}' dal menu?`)) return;
                await updateItem(
                    resource,
                    id,
                    { [resource === "categorie" ? "archiviata" : "archiviato"]: true },
                    "Eliminato."
                );
                showUndoToast(resource, id);
            } else if (action === "restore") {
                await updateItem(resource, id, { [resource === "categorie" ? "archiviata" : "archiviato"]: false }, "Elemento ripristinato.");
            } else if (action === "delete-permanently") {
                const item = recordFor(resource, id);
                if (!item || !window.confirm(
                    `Eliminare definitivamente '${item.nome}' dal menu? Questa operazione non si può annullare.`
                )) return;
                await request("/api/menu-admin", {
                    method: "DELETE",
                    body: JSON.stringify({ risorsa: resource, id })
                });
                await loadMenu("Elemento eliminato definitivamente.");
            } else if (action === "up" || action === "down") {
                button.disabled = true;
                await moveItem(button);
            }
        } catch (error) {
            button.disabled = false;
            setStatus(error.message, true);
        }
    }

    document.querySelectorAll(".menu-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            state.resource = tab.dataset.tab;
            document.querySelectorAll(".menu-tab").forEach(item => {
                const active = item === tab;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-selected", String(active));
            });
            render();
        });
    });
    search.addEventListener("input", render);
    document.getElementById("menu-new").addEventListener("click", event => (
        openEditor(state.resource, null, event.currentTarget)
    ));
    content.addEventListener("click", handleItemAction);
    archivedContent.addEventListener("click", handleItemAction);
    undoButton.addEventListener("click", async () => {
        if (!state.undo) return;
        const undo = state.undo;
        window.clearTimeout(state.undoTimer);
        undoButton.disabled = true;
        try {
            await updateItem(
                undo.resource,
                undo.id,
                { [undo.resource === "categorie" ? "archiviata" : "archiviato"]: false },
                "Elemento ripristinato."
            );
            hideUndoToast();
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            undoButton.disabled = false;
        }
    });
    document.getElementById("menu-editor-close").addEventListener("click", closeEditor);
    document.getElementById("menu-cancel").addEventListener("click", closeEditor);
    backdrop.addEventListener("click", event => {
        if (event.target === backdrop) closeEditor();
    });
    document.addEventListener("keydown", event => {
        if (backdrop.hidden) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeEditor();
            return;
        }
        if (event.key === "Tab") {
            const controls = [...editor.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")];
            if (!controls.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    document.getElementById("menu-archive").addEventListener("click", async () => {
        if (!state.id || !window.confirm("Archiviare questo elemento?")) return;
        setSaving(true);
        let saved = false;
        try {
            await updateItem(
                state.resource,
                state.id,
                { [state.resource === "categorie" ? "archiviata" : "archiviato"]: true },
                "Elemento archiviato."
            );
            saved = true;
        } catch (error) {
            formError.textContent = error.message;
        } finally {
            setSaving(false);
        }
        if (saved) closeEditor();
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        setSaving(true);
        formError.textContent = "";
        let saved = false;
        try {
            const payload = editorPayload();
            const body = state.id ? { ...payload, id: state.id } : payload;
            await request("/api/menu-admin", {
                method: state.id ? "PUT" : "POST",
                body: JSON.stringify(body)
            });
            await loadMenu("Salvato");
            saved = true;
        } catch (error) {
            formError.textContent = error.message;
        } finally {
            setSaving(false);
        }
        if (saved) closeEditor();
    });

    void loadMenu();
})();
