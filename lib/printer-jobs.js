function isActivePrintingJob(job) {
    if (!job || job.status !== "printing") return false;
    const leaseUntil = job.leaseUntil;
    if (!leaseUntil || typeof leaseUntil.toMillis !== "function") return true;
    const expiresAt = leaseUntil.toMillis();
    return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

module.exports = { isActivePrintingJob };
