const htmlUtils = Object.freeze({
    escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[character]);
    },
    compareMenuItemsByName(first, second) {
        const nameComparison = String(first?.nome ?? "").localeCompare(
            String(second?.nome ?? ""),
            "it",
            { sensitivity: "base", numeric: true }
        );
        return nameComparison || String(first?.id ?? "").localeCompare(String(second?.id ?? ""));
    },
    numeroWhatsApp(telefono) {
        let digits = String(telefono ?? "").replace(/\D/g, "");
        if (digits.startsWith("00")) digits = digits.slice(2);
        if (digits.length < 8) return null;
        if (/^3\d{8,9}$/.test(digits) || digits.startsWith("0")) return `39${digits}`;
        return digits;
    }
});

if (typeof module !== "undefined" && module.exports) module.exports = htmlUtils;
if (typeof window !== "undefined") window.htmlUtils = htmlUtils;
