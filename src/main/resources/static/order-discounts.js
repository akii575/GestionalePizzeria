(function exposeOrderDiscounts(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.orderDiscounts = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createOrderDiscounts() {
    const CONVENZIONE_PERCENTUALE = 10;
    const CONVENZIONE_PREZZO_MENU = 6;
    const CONVENZIONE_PREZZO_MENU_CENTESIMI = 600;

    function toCents(value) {
        const amount = Number(value);
        return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) : 0;
    }

    function percentageDiscountCents(baseCents, percentage) {
        return Math.round(baseCents * percentage / 100);
    }

    function calculateMenuConvention(items) {
        const pizzas = [];
        const drinks = [];
        (Array.isArray(items) ? items : []).forEach((item, index) => {
            if (!item) return;
            const candidate = { ...item, index };
            if (item.tipo === "pizza") pizzas.push(candidate);
            if (item.tipo === "bibita") drinks.push(candidate);
        });
        const byPrice = (first, second) => second.prezzoCentesimi - first.prezzoCentesimi
            || first.index - second.index;
        pizzas.sort(byPrice);
        drinks.sort(byPrice);
        const menu = Math.min(pizzas.length, drinks.length);
        const importo = pizzas.slice(0, menu).reduce((sum, pizza, index) => (
            sum + Math.max(
                0,
                pizza.prezzoCentesimi + drinks[index].prezzoCentesimi - CONVENZIONE_PREZZO_MENU_CENTESIMI
            )
        ), 0);
        return { menu, importo };
    }

    function calculateExplicitMenuConvention(items) {
        const groups = new Map();
        (Array.isArray(items) ? items : []).forEach(item => {
            if (!item || typeof item.menuConvenzione !== "string") return;
            if (!groups.has(item.menuConvenzione)) groups.set(item.menuConvenzione, []);
            groups.get(item.menuConvenzione).push(item);
        });

        let valid = true;
        let importo = 0;
        for (const group of groups.values()) {
            const pizzas = group.filter(item => item.tipo === "pizza");
            const drinks = group.filter(item => item.tipo === "bibita");
            if (group.length !== 2 || pizzas.length !== 1 || drinks.length !== 1) {
                valid = false;
                continue;
            }
            importo += Math.max(
                0,
                pizzas[0].prezzoBaseCentesimi
                    + drinks[0].prezzoBaseCentesimi
                    - CONVENZIONE_PREZZO_MENU_CENTESIMI
            );
        }
        return { valid, menu: groups.size, importo };
    }

    return Object.freeze({
        CONVENZIONE_PERCENTUALE,
        CONVENZIONE_PREZZO_MENU,
        CONVENZIONE_PREZZO_MENU_CENTESIMI,
        calculateMenuConvention,
        calculateExplicitMenuConvention,
        percentageDiscountCents,
        toCents
    });
}));
