(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll(".home-links a, .ordine, .metriche div, .riga-edit").forEach(elemento => {
        elemento.classList.add("reveal");
    });

    const osservatore = new IntersectionObserver(elementi => {
        elementi.forEach(({ target, isIntersecting }) => {
            if (isIntersecting) {
                target.classList.add("is-visible");
                osservatore.unobserve(target);
            }
        });
    }, { threshold: .08 });
    document.querySelectorAll(".reveal").forEach(elemento => osservatore.observe(elemento));
    const domObserver = new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const elementi = node.matches(".ordine, .metriche div, .riga-edit") ? [node] : node.querySelectorAll(".ordine, .metriche div, .riga-edit");
        elementi.forEach(elemento => { elemento.classList.add("reveal"); osservatore.observe(elemento); });
    })));
    domObserver.observe(document.body, { childList: true, subtree: true });

    if (!reducedMotion) {
        document.addEventListener("click", evento => {
            const bottone = evento.target.closest("button");
            if (!bottone || bottone.disabled) return;
            const effetto = document.createElement("span");
            effetto.className = "ripple";
            effetto.style.left = `${evento.offsetX}px`;
            effetto.style.top = `${evento.offsetY}px`;
            bottone.appendChild(effetto);
            window.setTimeout(() => effetto.remove(), 520);
        });
    }

    window.themeToast = (testo, tipo = "successo") => {
        const precedente = document.querySelector(".toast");
        if (precedente) precedente.remove();
        const toast = document.createElement("div");
        toast.className = `toast ${tipo}`;
        toast.setAttribute("role", "status");
        toast.textContent = testo;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3400);
    };
})();
