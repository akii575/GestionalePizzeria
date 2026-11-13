const htmlUtils = Object.freeze({
    escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[character]);
    }
});

if (typeof module !== "undefined" && module.exports) module.exports = htmlUtils;
if (typeof window !== "undefined") window.htmlUtils = htmlUtils;
