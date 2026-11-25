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

    function rowDiscountCents(discount, grossCents) {
        if (!discount || typeof discount !== "object") return 0;
        if (discount.tipo === "omaggio") return grossCents;
        if (discount.tipo === "percentuale") {
            return percentageDiscountCents(grossCents, Number(discount.valore));
        }
        if (discount.tipo === "importo") return toCents(discount.valore);
        return 0;
    }

    function calculateMenuConvention(items) {
        const pizzas = [];
        const drinks = [];
        (Array.isArray(items) ? items : []).forEach((item, index) => {
            if (!item || item.scontata) return;
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

    return Object.freeze({
        CONVENZIONE_PERCENTUALE,
        CONVENZIONE_PREZZO_MENU,
        CONVENZIONE_PREZZO_MENU_CENTESIMI,
        calculateMenuConvention,
        percentageDiscountCents,
        rowDiscountCents,
        toCents
    });
}));
