const RESET_LOCK_MILLISECONDS = 5 * 60 * 1000;
const PRINTER_NAMES = Object.freeze(["Cucina", "Sala"]);

function jobId(numero, progressivo) {
    const orderNumber = Number(numero);
    if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) {
        throw new TypeError("Numero ordine non valido.");
    }
    if (typeof progressivo === "undefined") {
        return String(orderNumber).padStart(12, "0");
    }
    if (!Number.isSafeInteger(progressivo) || progressivo < 1) {
        throw new TypeError("Progressivo stampa non valido.");
    }
    return `${String(orderNumber).padStart(12, "0")}-${String(progressivo).padStart(2, "0")}`;
}

function isValidPrinterSelection(stampanti) {
    return Array.isArray(stampanti)
        && stampanti.length > 0
        && new Set(stampanti).size === stampanti.length
        && stampanti.every(stampante => PRINTER_NAMES.includes(stampante));
}

function isActivePrintingJob(job) {
    if (!job || job.status !== "printing") return false;
    const leaseUntil = job.leaseUntil;
    if (!leaseUntil || typeof leaseUntil.toMillis !== "function") return true;
    const expiresAt = leaseUntil.toMillis();
    return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function isPrinterQueuePaused(control) {
    return control?.paused === true
        && Number.isFinite(control.pausedUntil)
        && control.pausedUntil > Date.now();
}

function hasExpiredPrinterQueuePause(control) {
    return control?.paused === true && !isPrinterQueuePaused(control);
}

module.exports = {
    PRINTER_NAMES,
    RESET_LOCK_MILLISECONDS,
    hasExpiredPrinterQueuePause,
    isActivePrintingJob,
    isPrinterQueuePaused,
    isValidPrinterSelection,
    jobId
};
