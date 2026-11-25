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
    }
});

if (typeof module !== "undefined" && module.exports) module.exports = htmlUtils;
if (typeof window !== "undefined") window.htmlUtils = htmlUtils;
