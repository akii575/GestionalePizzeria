(() => {
    async function initializeNavigation() {
        if (window.authReady && !(await window.authReady)) return;

        const account = window.currentAccount || {};
        const isDelivery = account.delivery === true;
        const main = document.querySelector("main");
        if (!main) return;

        const header = main.querySelector(":scope > header") || document.createElement("header");
        const title = main.querySelector("h1");
        if (!header.parentElement) main.prepend(header);
        header.classList.add("app-page-header");
        if (title && title.parentElement !== header) {
            const previousParent = title.parentElement;
            header.prepend(title);
            if (previousParent !== main && previousParent !== header && !previousParent.children.length) previousParent.remove();
        }

        const sourceNavigation = header.querySelector("nav");
        const refreshButton = document.getElementById("aggiorna");
        const resetButton = document.getElementById("reset-numeri");
        let logoutButton = document.querySelector(".account-toolbar .auth-logout, nav .auth-logout");
        if (logoutButton && logoutButton.closest(".account-toolbar")) {
            logoutButton.closest(".account-toolbar").remove();
        }

        const actions = document.createElement("div");
        actions.className = "app-header-actions";
        if (refreshButton) {
            refreshButton.classList.add("app-refresh");
            actions.append(refreshButton);
        }

        const searchTarget = document.getElementById("btn-ricerca") || document.getElementById("filtro");
        if (searchTarget) {
            const searchButton = document.createElement("button");
            searchButton.type = "button";
            searchButton.className = "app-search";
            searchButton.setAttribute("aria-label", "Cerca");
            searchButton.title = "Cerca";
            searchButton.append(createIcon("search"));
            searchButton.addEventListener("click", () => {
                if (searchTarget.tagName === "BUTTON") searchTarget.click();
                else searchTarget.focus({ preventScroll: true });
            });
            actions.append(searchButton);
        }
        header.append(actions);
        if (sourceNavigation) sourceNavigation.remove();

        if (!logoutButton) logoutButton = createLogoutButton();
        logoutButton.classList.add("app-logout");

        const isHome = window.location.pathname === "/" || window.location.pathname === "/index.html";
        if (isHome && title) title.textContent = "Civico7";
        const links = isDelivery
            ? [{ label: "Consegne", href: "/consegne.html", icon: "delivery" }]
            : [
                { label: "Home", href: "/", icon: "home" },
                { label: "Tavoli", href: "/tavoli.html", icon: "tables" },
                { label: "Nuova comanda", href: "/ordini.html", icon: "add" },
                { label: "Consegne", href: "/consegne.html", icon: "delivery" },
                { label: "Ritiri", href: "/ritiri.html", icon: "pickup" },
                { label: "Banco", href: "/banco.html", icon: "counter" },
                { label: "Tutti gli ordini", href: "/gestionale.html", icon: "orders" },
                { label: "Stato stampanti", href: "/#printer-title", icon: "printer" }
            ];
        const currentHref = currentPageHref(isHome);
        const primaryLinks = isDelivery ? links : links.slice(0, 4);
        const secondaryLinks = isDelivery ? [] : links.slice(4);
        document.body.classList.add("app-shell");
        if (isDelivery) document.body.classList.add("app-shell--delivery");

        const sidebar = document.createElement("aside");
        sidebar.className = "app-sidebar";
        sidebar.setAttribute("aria-label", "Navigazione principale");
        const brand = document.createElement("a");
        brand.className = "app-brand";
        brand.href = "/";
        brand.textContent = "Civico7";
        brand.setAttribute("aria-label", "CIVICO7 - Home");
        sidebar.append(brand);

        const sideNav = document.createElement("nav");
        sideNav.className = "app-sidebar-links";
        sideNav.setAttribute("aria-label", "Pagine");
        for (const link of primaryLinks) sideNav.append(createLink(link, currentHref));
        if (secondaryLinks.length) {
            const divider = document.createElement("span");
            divider.className = "app-sidebar-divider";
            divider.setAttribute("aria-hidden", "true");
            sideNav.append(divider);
            for (const link of secondaryLinks) sideNav.append(createLink(link, currentHref));
        }
        sidebar.append(sideNav);

        const sidebarActions = document.createElement("div");
        sidebarActions.className = "app-sidebar-actions";
        if (resetButton) {
            resetButton.classList.add("app-reset");
            sidebarActions.append(resetButton);
        }
        sidebarActions.append(logoutButton);
        sidebar.append(sidebarActions);
        document.body.prepend(sidebar);

        let setMoreOpen = () => {};
        const bottomNav = document.createElement("nav");
        bottomNav.className = "app-bottom-nav";
        bottomNav.setAttribute("aria-label", "Navigazione rapida");
        if (isDelivery) {
            bottomNav.append(createLink(primaryLinks[0], currentHref));
            bottomNav.append(createButtonLink("Esci", "logout", () => logoutButton.click()));
        } else {
            for (const link of primaryLinks) {
                if (link.icon === "add") {
                    const create = createLink(link, currentHref);
                    create.classList.add("app-bottom-create");
                    create.setAttribute("aria-label", "Nuova comanda");
                    bottomNav.append(create);
                } else {
                    bottomNav.append(createLink(link, currentHref));
                }
            }
            const moreButton = createButtonLink("Altro", "more", () => setMoreOpen(true));
            moreButton.classList.add("app-bottom-more");
            moreButton.setAttribute("aria-expanded", "false");
            bottomNav.append(moreButton);
        }
        document.body.append(bottomNav);

        if (!isDelivery) {
            const backdrop = document.createElement("div");
            backdrop.className = "app-more-backdrop";
            backdrop.hidden = true;
            backdrop.addEventListener("click", event => {
                if (event.target === backdrop) setMoreOpen(false);
            });

            const sheet = document.createElement("section");
            sheet.className = "app-more-sheet";
            sheet.setAttribute("role", "dialog");
            sheet.setAttribute("aria-modal", "true");
            sheet.setAttribute("aria-label", "Altre pagine");
            const sheetHandle = document.createElement("span");
            sheetHandle.className = "app-sheet-handle";
            sheetHandle.setAttribute("aria-hidden", "true");
            const sheetTitle = document.createElement("h2");
            sheetTitle.textContent = "Altro";
            const sheetLinks = document.createElement("nav");
            sheetLinks.className = "app-more-links";
            sheetLinks.setAttribute("aria-label", "Altre pagine");
            for (const link of secondaryLinks) sheetLinks.append(createLink(link, currentHref));
            if (resetButton) {
                const resetCopy = createButtonLink("Reset ordini", "reset", () => resetButton.click());
                resetCopy.hidden = resetButton.hidden;
                sheetLinks.append(resetCopy);
                new MutationObserver(() => {
                    resetCopy.hidden = resetButton.hidden;
                }).observe(resetButton, { attributes: true, attributeFilter: ["hidden"] });
            }
            sheetLinks.append(createButtonLink("Esci", "logout", () => logoutButton.click()));
            const closeButton = document.createElement("button");
            closeButton.type = "button";
            closeButton.className = "app-sheet-close";
            closeButton.textContent = "Chiudi";
            closeButton.addEventListener("click", () => setMoreOpen(false));
            sheet.append(sheetHandle, sheetTitle, sheetLinks, closeButton);
            backdrop.append(sheet);
            document.body.append(backdrop);

            const moreToggle = bottomNav.querySelector(".app-bottom-more");
            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && !backdrop.hidden) setMoreOpen(false);
            });

            setMoreOpen = open => {
                backdrop.hidden = !open;
                moreToggle.setAttribute("aria-expanded", String(open));
                document.body.classList.toggle("app-more-open", open);
                if (open) closeButton.focus();
            };
        }
    }

    function currentPageHref(isHome) {
        if (isHome) return "/";
        if (window.location.pathname === "/modifica.html") return "/gestionale.html";
        return window.location.pathname;
    }

    function createLink(link, currentHref) {
        const anchor = document.createElement("a");
        anchor.href = link.href;
        anchor.className = "app-nav-item";
        anchor.append(createIcon(link.icon));
        const label = document.createElement("span");
        label.textContent = link.label;
        anchor.append(label);
        if (link.href === currentHref) {
            anchor.classList.add("is-active");
            anchor.setAttribute("aria-current", "page");
        }
        return anchor;
    }

    function createButtonLink(label, iconName, action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "app-nav-item";
        button.append(createIcon(iconName));
        const text = document.createElement("span");
        text.textContent = label;
        button.append(text);
        button.addEventListener("click", action);
        return button;
    }

    function createIcon(name) {
        const paths = {
            home: ["M3 10.5 12 3l9 7.5", "M5.5 9.5V21h13V9.5", "M9 21v-7h6v7"],
            tables: ["M4 5h16v14H4z", "M4 11h16", "M10 5v14"],
            add: ["M12 5v14", "M5 12h14"],
            delivery: ["M3 6h11v12H3z", "M14 10h4l3 3v5h-7z", "M7 18.5a1.5 1.5 0 1 0 0 .01", "M18 18.5a1.5 1.5 0 1 0 0 .01"],
            pickup: ["M4 8h16l-1 13H5L4 8z", "M8 8a4 4 0 0 1 8 0"],
            counter: ["M4 10h16v10H4z", "M3 10l2-6h14l2 6", "M9 20v-6h6v6"],
            orders: ["M6 4h12v17H6z", "M9 8h6", "M9 12h6", "M9 16h4"],
            printer: ["M6 8V3h12v5", "M5 18H3V9h18v9h-2", "M6 14h12v7H6z", "M17 11h.01"],
            more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
            logout: ["M10 5H5v14h5", "M14 8l4 4-4 4", "M8 12h10"],
            reset: ["M4 12a8 8 0 1 0 2.4-5.7", "M4 4v5h5"],
            search: ["M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15", "m16 16 5 5"]
        };
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        for (const pathData of paths[name] || []) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "currentColor");
            path.setAttribute("stroke-width", "1.8");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            svg.append(path);
        }
        return svg;
    }

    function createLogoutButton() {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "auth-logout";
        button.textContent = "Esci";
        button.addEventListener("click", async () => {
            await window.fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
            window.location.replace("/login.html");
        });
        return button;
    }

    void initializeNavigation();
})();
