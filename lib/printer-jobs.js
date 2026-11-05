const RESET_LOCK_MILLISECONDS = 5 * 60 * 1000;

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
    RESET_LOCK_MILLISECONDS,
    hasExpiredPrinterQueuePause,
    isActivePrintingJob,
    isPrinterQueuePaused
};
