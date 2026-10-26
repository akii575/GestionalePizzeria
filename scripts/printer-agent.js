const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");
const { listNetworkPrinters, sendEscPosReceipt } = require("./network-printer");
const menu = require("../lib/menu.json");

const PROJECT_ID = "gestionalecivico7";
const LEASE_MILLISECONDS = 120_000;
const POLL_MILLISECONDS = 10_000;
const RECEIPT_WIDTH = 28;
const PRODUCT_CATEGORIES = [...new Set(menu.map(product => product.categoria))];
const CATEGORY_BY_PRODUCT = new Map(menu.map(product => [product.nome, product.categoria]));

function initializeFirestore() {
    let serviceAccount;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
        try {
            serviceAccount = JSON.parse(serviceAccountJson);
        } catch {
            throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON non contiene JSON valido.");
        }
    } else {
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
            || path.join(__dirname, "..", "service-account.json");
        if (!fs.existsSync(credentialsPath)) {
            throw new Error("Manca service-account.json o GOOGLE_APPLICATION_CREDENTIALS.");
        }
        try {
            serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
        } catch {
            throw new Error("Il file delle credenziali Firebase non contiene JSON valido.");
        }
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
    if (projectId !== PROJECT_ID || serviceAccount.project_id !== PROJECT_ID
            || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("Le credenziali Firebase non corrispondono al progetto atteso.");
    }

    const appName = `printer-terminal-${randomUUID()}`;
    const app = initializeApp({
        credential: cert({
            projectId,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key.replace(/\\n/g, "\n")
        }),
        projectId
    }, appName);
    return getFirestore(app);
}

function wrapReceiptText(value, width = RECEIPT_WIDTH) {
    const paragraphs = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
    const lines = [];
    for (const paragraph of paragraphs) {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
            lines.push("");
            continue;
        }
        let line = "";
        for (const word of words) {
            const characters = Array.from(word);
            if (characters.length > width) {
                if (line) lines.push(line);
                for (let index = 0; index < characters.length; index += width) {
                    lines.push(characters.slice(index, index + width).join(""));
                }
                line = "";
            } else if (line && Array.from(line).length + 1 + characters.length > width) {
                lines.push(line);
                line = word;
            } else {
                line = line ? `${line} ${word}` : word;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

function centerReceiptText(value) {
    return wrapReceiptText(value).map(line => {
        const padding = Math.max(0, Math.floor((RECEIPT_WIDTH - Array.from(line).length) / 2));
        return `${" ".repeat(padding)}${line}`;
    });
}

function formatReceipt(order) {
    const divider = "=".repeat(RECEIPT_WIDTH);
    const date = new Date(order.dataOra).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
    const destination = order.tipo === "consegna"
        ? [
            ...wrapReceiptText(`CONSEGNA: ${order.tavoloOCliente}`),
            ...wrapReceiptText(`TEL: ${order.telefonoConsegna || ""}`),
            ...wrapReceiptText(`INDIRIZZO: ${order.indirizzoConsegna || ""}`)
        ]
        : wrapReceiptText(`TAVOLO / CLIENTE: ${order.tavoloOCliente}`);
    const lines = [
        divider,
        ...centerReceiptText(`COMANDA #${order.numero}`),
        divider,
        ...destination,
        ...wrapReceiptText(`DATA: ${date}`),
        divider
    ];
    const rowsByCategory = new Map();
    for (const row of order.righe || []) {
        const category = row.categoria || CATEGORY_BY_PRODUCT.get(row.prodotto) || "altro";
        if (!rowsByCategory.has(category)) rowsByCategory.set(category, []);
        rowsByCategory.get(category).push(row);
    }
    const categories = [
        ...PRODUCT_CATEGORIES.filter(category => rowsByCategory.has(category)),
        ...Array.from(rowsByCategory.keys()).filter(category => !PRODUCT_CATEGORIES.includes(category))
    ];
    for (const category of categories) {
        lines.push("", `@@SECTION:${category.toLocaleUpperCase("it-IT")}@@`);
        for (const row of rowsByCategory.get(category)) {
            lines.push(...wrapReceiptText(`1 x ${row.prodotto}`));
            for (const extra of row.extra || []) {
                const name = typeof extra === "string" ? extra : extra.nome;
                const prefix = "  + ";
                const wrappedExtra = wrapReceiptText(name, RECEIPT_WIDTH - prefix.length);
                lines.push(...wrappedExtra.map((line, index) => (
                    `${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`
                )));
            }
        }
    }
    if (order.note) {
        lines.push(
            divider,
            "NOTE",
            ...wrapReceiptText(order.note)
        );
    }
    const amount = `EUR ${Number(order.totale || 0).toFixed(2).replace(".", ",")}`;
    const totalGap = RECEIPT_WIDTH - "TOTALE".length - amount.length;
    lines.push(divider);
    if (totalGap > 0) {
        lines.push(`TOTALE${" ".repeat(totalGap)}${amount}`);
    } else {
        lines.push(...wrapReceiptText(`TOTALE ${amount}`));
    }
    lines.push("", "");
    return lines.join("\r\n");
}

async function sendToPrinter(order, printer) {
    await sendEscPosReceipt(printer, formatReceipt(order));
}

function createPrinterAgent(db, { getPrinters, printOrder } = {}) {
    const queryPrinters = getPrinters || listNetworkPrinters;
    const submitPrint = printOrder || sendToPrinter;
    const instanceId = randomUUID();
    const jobs = db.collection("printerJobs");
    const orders = db.collection("orders");
    const metadata = db.collection("metadata");
    const lockRef = metadata.doc("printerAgentLock");
    const controlRef = metadata.doc("printerControl");
    let active = true;
    let workerState = "starting";
    let lastPrintedOrder = null;
    let lastError = null;

    async function acquireLock() {
        return db.runTransaction(async transaction => {
            const snapshot = await transaction.get(lockRef);
            const lock = snapshot.exists ? snapshot.data() : {};
            const leaseUntil = lock.leaseUntil && lock.leaseUntil.toMillis();
            if (lock.instanceId && lock.instanceId !== instanceId && leaseUntil > Date.now()) {
                return false;
            }
            transaction.set(lockRef, {
                instanceId,
                leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MILLISECONDS)
            });
            return true;
        });
    }

    async function selectedPrinter() {
        const printers = await queryPrinters();
        const printer = printers.find(item => item.isDefault);
        if (!printer || printer.isVirtual || printer.state === "unavailable") return null;
        return printer;
    }

    async function recoverExpiredJob() {
        const snapshot = await jobs.where("status", "==", "printing").limit(1).get();
        if (snapshot.empty) return false;
        const jobRef = snapshot.docs[0].ref;
        return db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(controlRef);
            const lockSnapshot = await transaction.get(lockRef);
            const jobSnapshot = await transaction.get(jobRef);
            if (controlSnapshot.data()?.paused || lockSnapshot.data()?.instanceId !== instanceId
                    || !jobSnapshot.exists || jobSnapshot.data().status !== "printing") {
                return true;
            }
            const job = jobSnapshot.data();
            if (job.leaseUntil && job.leaseUntil.toMillis() > Date.now()) return true;
            const orderRef = orders.doc(String(job.numero));
            const orderSnapshot = await transaction.get(orderRef);
            if (!orderSnapshot.exists) {
                transaction.update(jobRef, {
                    status: "cancelled",
                    lastError: "ordine_eliminato",
                    leaseUntil: FieldValue.delete()
                });
                return true;
            }
            transaction.update(jobRef, {
                status: "queued",
                leaseUntil: FieldValue.delete(),
                claimedBy: FieldValue.delete(),
                lastError: "stampa_interrotta"
            });
            transaction.update(orderRef, {
                stampaCompletata: false,
                stampaInCoda: true,
                messaggioStampa: "Stampa interrotta; la comanda verra' ritentata automaticamente."
            });
            return true;
        });
    }

    async function claimNextJob() {
        const snapshot = await jobs
            .where("status", "==", "queued")
            .orderBy(FieldPath.documentId())
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const jobRef = snapshot.docs[0].ref;
        return db.runTransaction(async transaction => {
            const controlSnapshot = await transaction.get(controlRef);
            const lockSnapshot = await transaction.get(lockRef);
            const jobSnapshot = await transaction.get(jobRef);
            if (controlSnapshot.data()?.paused || lockSnapshot.data()?.instanceId !== instanceId
                    || !jobSnapshot.exists || jobSnapshot.data().status !== "queued") {
                return null;
            }
            const job = jobSnapshot.data();
            const orderRef = orders.doc(String(job.numero));
            const orderSnapshot = await transaction.get(orderRef);
            if (!orderSnapshot.exists) {
                transaction.update(jobRef, { status: "cancelled", lastError: "ordine_eliminato" });
                return null;
            }
            transaction.update(jobRef, {
                status: "printing",
                claimedBy: instanceId,
                leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MILLISECONDS),
                attemptCount: (job.attemptCount || 0) + 1,
                lastError: FieldValue.delete()
            });
            transaction.update(orderRef, {
                stampaCompletata: false,
                stampaInCoda: false,
                messaggioStampa: "Comanda inviata alla stampante."
            });
            return { jobRef, orderRef, order: orderSnapshot.data(), numero: job.numero };
        });
    }

    async function finishJob(job, error) {
        await db.runTransaction(async transaction => {
            const jobSnapshot = await transaction.get(job.jobRef);
            const orderSnapshot = await transaction.get(job.orderRef);
            if (!jobSnapshot.exists || jobSnapshot.data().claimedBy !== instanceId) return;
            const completed = !error;
            transaction.update(job.jobRef, {
                status: completed ? "printed" : "failed",
                printedAt: completed ? Timestamp.now() : FieldValue.delete(),
                failedAt: completed ? FieldValue.delete() : Timestamp.now(),
                leaseUntil: FieldValue.delete(),
                claimedBy: FieldValue.delete(),
                lastError: error ? "invio_stampante_non_riuscito" : FieldValue.delete()
            });
            if (orderSnapshot.exists) {
                transaction.update(job.orderRef, {
                    stampaCompletata: completed,
                    stampaInCoda: false,
                    messaggioStampa: completed
                        ? "Comanda stampata."
                        : "Stampa automatica non riuscita. Verifica la stampante e premi Riprova sulla Home."
                });
            }
        });
    }

    async function processOneJob(printer) {
        if (await recoverExpiredJob()) return;
        const job = await claimNextJob();
        if (!job) return;
        try {
            await submitPrint(job.order, printer.name);
        } catch (error) {
            await finishJob(job, error);
            lastError = "La stampante ha rifiutato una comanda.";
            console.error(`Printing order #${job.numero} failed:`, error.code || error.name || "unknown");
            return;
        }
        try {
            await finishJob(job, null);
            lastPrintedOrder = job.numero;
            lastError = null;
            console.log(`Order #${job.numero} sent to the Windows print queue.`);
        } catch (error) {
            lastError = "Comanda inviata, ma non e' stato possibile confermare la stampa.";
            console.error("Unable to acknowledge printed order:", error.code || error.name || "unknown");
        }
    }

    async function tick() {
        const control = await controlRef.get();
        if (control.data()?.paused) {
            workerState = "paused";
            return;
        }
        if (!await acquireLock()) {
            workerState = "another_terminal_active";
            return;
        }
        const printer = await selectedPrinter();
        if (!printer) {
            workerState = "printer_unavailable";
            return;
        }
        workerState = "ready";
        await processOneJob(printer);
    }

    async function countsFor(status) {
        const result = await jobs.where("status", "==", status).count().get();
        return result.data().count;
    }

    async function summary() {
        const [queued, printing, failed] = await Promise.all([
            countsFor("queued"),
            countsFor("printing"),
            countsFor("failed")
        ]);
        return {
            workerState,
            queued,
            printing,
            failed,
            lastPrintedOrder,
            lastError
        };
    }

    async function retryFailed() {
        const snapshot = await jobs.where("status", "==", "failed").limit(200).get();
        if (snapshot.empty) return 0;
        const batch = db.batch();
        for (const document of snapshot.docs) {
            const job = document.data();
            const orderRef = orders.doc(String(job.numero));
            const order = await orderRef.get();
            if (!order.exists) {
                batch.delete(document.ref);
                continue;
            }
            batch.update(document.ref, {
                status: "queued",
                attemptCount: 0,
                lastError: FieldValue.delete(),
                failedAt: FieldValue.delete(),
                leaseUntil: FieldValue.delete(),
                claimedBy: FieldValue.delete()
            });
            batch.update(orderRef, {
                stampaCompletata: false,
                stampaInCoda: true,
                messaggioStampa: "Comanda in coda per un nuovo tentativo di stampa."
            });
        }
        await batch.commit();
        return snapshot.size;
    }

    async function run() {
        while (active) {
            try {
                await tick();
            } catch (error) {
                workerState = "cloud_unavailable";
                lastError = "Connessione alla coda di stampa non disponibile.";
                console.error("Printer agent poll failed:", error.code || error.name || "unknown");
            }
            await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
        }
    }

    async function stop() {
        active = false;
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(lockRef);
            if (snapshot.data()?.instanceId === instanceId) {
                transaction.set(lockRef, { instanceId, leaseUntil: Timestamp.fromMillis(0) });
            }
        });
    }

    return {
        run,
        stop,
        summary,
        retryFailed,
        status: async () => ({ ...(await summary()), running: active })
    };
}

module.exports = { createPrinterAgent, formatReceipt, initializeFirestore };
