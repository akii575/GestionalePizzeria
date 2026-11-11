const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { cert, initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");
const { DEFAULT_RECEIPT_WIDTH, listNetworkPrinters, sendEscPosReceipt } = require("./network-printer");
const menu = require("../lib/menu.json");
const extras = require("../lib/extras.json");

const PROJECT_ID = "gestionalecivico7";
const LEASE_MILLISECONDS = 120_000;
const POLL_MILLISECONDS = 10_000;
const RECEIPT_WIDTH_58_MM = 16;
const PRODUCT_CATEGORIES = [...new Set(menu.map(product => product.categoria))];
const CATEGORY_BY_PRODUCT = new Map(menu.map(product => [product.nome, product.categoria]));
const PRODUCT_BY_NAME = new Map(menu.map(product => [product.nome, product]));
const EXTRA_BY_NAME = new Map(extras.map(extra => [extra.nome, extra]));

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

function wrapReceiptText(value, width = DEFAULT_RECEIPT_WIDTH) {
    const paragraphs = String(value ?? "").toLocaleUpperCase("it-IT").replace(/\r\n?/g, "\n").split("\n");
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

function receiptExtra(extra) {
    const name = typeof extra === "string" ? extra : extra.nome || "";
    const catalogExtra = EXTRA_BY_NAME.get(name);
    const price = Number(typeof extra === "string" ? catalogExtra?.prezzo : extra.prezzo ?? catalogExtra?.prezzo ?? 0);
    return { name, price: Number.isFinite(price) ? price : 0 };
}

function receiptUnitPrice(row) {
    if (row.totale !== undefined && row.totale !== null && Number.isFinite(Number(row.totale))) {
        return Number(row.totale);
    }
    const basePrice = Number(row.prezzoBase ?? row.prezzo ?? PRODUCT_BY_NAME.get(row.prodotto)?.prezzo ?? 0);
    return basePrice + (row.extra || []).reduce((sum, extra) => sum + receiptExtra(extra).price, 0);
}

function wrapReceiptItem(description, price, width) {
    const amount = `EUR ${price.toFixed(2).replace(".", ",")}`;
    const descriptionWidth = Math.max(1, width - amount.length - 1);
    const wrapped = [];
    let line = "";
    const words = String(description).toLocaleUpperCase("it-IT").split(/\s+/).filter(Boolean);
    for (const word of words) {
        const wordLength = Array.from(word).length;
        if (wordLength > width) {
            if (line) wrapped.push(line);
            line = "";
            wrapped.push(...wrapReceiptText(word, width));
        } else if (line && Array.from(line).length + 1 + wordLength > descriptionWidth) {
            wrapped.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) wrapped.push(line);
    const lastLine = wrapped.pop() || "";
    if (Array.from(lastLine).length + amount.length + 1 > width) {
        if (lastLine) wrapped.push(lastLine);
        return [...wrapped, `${" ".repeat(Math.max(0, width - amount.length))}${amount}`];
    }
    const gap = Math.max(1, width - Array.from(lastLine).length - amount.length);
    return [...wrapped, `${lastLine}${" ".repeat(gap)}${amount}`];
}

function formatReceipt(order, paperWidthMm = 80, options = {}) {
    const receiptWidth = paperWidthMm === 58 ? RECEIPT_WIDTH_58_MM : DEFAULT_RECEIPT_WIDTH;
    const divider = "-".repeat(receiptWidth);
    const date = new Date(order.dataOra).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Rome"
    });
    const tipo = ["banco", "ritiro", "consegna"].includes(order.tipo) ? order.tipo : "tavolo";
    const serviceTitle = tipo === "tavolo"
        ? `TAVOLO${Number.isInteger(order.numeroPersone) && order.numeroPersone > 0 ? ` X${order.numeroPersone}` : ""}`
        : tipo.toLocaleUpperCase("it-IT");
    const paymentTitle = {
        pos: "POS",
        pagato: "PAGATO",
        non_pagato: "NON PAGATO"
    }[order.statoPagamento];
    const title = [serviceTitle, paymentTitle].filter(Boolean).join(" - ");
    const receiptTitle = options.tipoStampa === "ristampa"
        ? `${options.motivo === "modificata" ? "RISTAMPA MODIFICATA" : "RISTAMPA"} - ${title}`
        : options.tipoStampa === "aggiunta" ? `AGGIUNTA - ${title}` : title;
    const lines = [`@@TITLE:${receiptTitle}@@`, divider];
    if (order.orario) {
        lines.push(...wrapReceiptText(`ORARIO RICHIESTO ${order.orario}`, receiptWidth)
            .map(line => `@@BOLD:${line}@@`));
    }
    lines.push(...wrapReceiptText(`DATA: ${date}`, receiptWidth));
    if (tipo === "consegna") {
        lines.push(...wrapReceiptText(`TEL: ${order.telefonoConsegna || ""}`, receiptWidth));
        lines.push("INDIRIZZO:");
        if (order.indirizzoConsegna) {
            lines.push(...wrapReceiptText(order.indirizzoConsegna, receiptWidth)
                .map(line => `@@BOLD:${line}@@`));
        }
    } else if (tipo === "ritiro") {
        if (order.telefonoRitiro) lines.push(...wrapReceiptText(`TEL: ${order.telefonoRitiro}`, receiptWidth));
        if (order.tavoloOCliente) lines.push(...wrapReceiptText(`CLIENTE: ${order.tavoloOCliente}`, receiptWidth));
    } else if (tipo === "tavolo") {
        if (order.tavoloOCliente) lines.push(...wrapReceiptText(`TAVOLO: ${order.tavoloOCliente}`, receiptWidth));
        if (Number.isInteger(order.numeroPersone) && order.numeroPersone > 0) {
            lines.push(...wrapReceiptText(`PERSONE: ${order.numeroPersone}`, receiptWidth));
        }
    } else if (tipo === "banco" && order.cognomeBanco) {
        lines.push(...wrapReceiptText(`COGNOME: ${order.cognomeBanco}`, receiptWidth));
    }
    lines.push(divider);
    if (typeof order.note === "string" && order.note.trim()) {
        lines.push("NOTE:", ...wrapReceiptText(order.note, receiptWidth), divider);
    }
    const rowsByCategory = new Map();
    const receiptRows = options.tipoStampa === "aggiunta" ? options.righe || [] : order.righe || [];
    for (const row of receiptRows) {
        const category = row.categoria || CATEGORY_BY_PRODUCT.get(row.prodotto) || "altro";
        if (!rowsByCategory.has(category)) rowsByCategory.set(category, []);
        rowsByCategory.get(category).push(row);
    }
    const categories = [
        ...PRODUCT_CATEGORIES.filter(category => rowsByCategory.has(category)),
        ...Array.from(rowsByCategory.keys()).filter(category => !PRODUCT_CATEGORIES.includes(category))
    ];
    for (const category of categories) {
        lines.push(`@@SECTION:${category.toLocaleUpperCase("it-IT")}@@`);
        const groupedRows = new Map();
        for (const row of rowsByCategory.get(category)) {
            const rowExtras = (row.extra || []).map(receiptExtra);
            const price = receiptUnitPrice(row);
            const key = JSON.stringify([
                row.prodotto,
                rowExtras.map(extra => [extra.name, extra.price]).sort((first, second) => first[0].localeCompare(second[0], "it")),
                price
            ]);
            const existing = groupedRows.get(key);
            if (existing) {
                existing.quantity++;
            } else {
                groupedRows.set(key, { row, rowExtras, price, quantity: 1 });
            }
        }
        for (const { row, rowExtras, price, quantity } of groupedRows.values()) {
            const lineTotal = Math.round(price * quantity * 100) / 100;
            lines.push(...wrapReceiptItem(`${quantity}x ${row.prodotto}`, lineTotal, receiptWidth));
            for (const extra of rowExtras) {
                const name = extra.name;
                const prefix = "  + ";
                const wrappedExtra = wrapReceiptText(name, receiptWidth - prefix.length);
                lines.push(...wrappedExtra.map((line, index) => (
                    `${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`
                )));
            }
        }
        lines.push("", "", divider);
    }
    if (options.tipoStampa === "aggiunta") {
        const totalAdded = Math.round(receiptRows.reduce((sum, row) => sum + receiptUnitPrice(row), 0) * 100) / 100;
        lines.push(...wrapReceiptItem("TOTALE AGGIUNTA", totalAdded, receiptWidth));
        lines.push(...wrapReceiptItem("NUOVO TOTALE", Number(order.totale || 0), receiptWidth));
    } else if (tipo === "consegna" && Number(order.costoConsegna) > 0) {
        lines.push(...wrapReceiptItem("COSTO CONSEGNA", Number(order.costoConsegna), receiptWidth));
    }
    const amount = `EUR ${Number(order.totale || 0).toFixed(2).replace(".", ",")}`;
    const totalGap = receiptWidth - "TOTALE".length - amount.length;
    if (categories.length === 0) lines.push(divider);
    if (options.tipoStampa !== "aggiunta" && totalGap > 0) {
        lines.push(`TOTALE${" ".repeat(totalGap)}${amount}`);
    } else if (options.tipoStampa !== "aggiunta") {
        lines.push(...wrapReceiptText(`TOTALE ${amount}`, receiptWidth));
    }
    lines.push(divider);
    return lines.join("\r\n");
}

async function sendToPrinter(order, printer, receipt = formatReceipt(order, printer.paperWidthMm)) {
    await sendEscPosReceipt(printer, receipt);
}

async function sendOrderToPrinters(order, printers, {
    alreadyPrinted = [],
    print = sendToPrinter,
    onPrinterPrinted = async () => {},
    receiptOptions = {}
} = {}) {
    if (!Array.isArray(printers) || printers.length === 0) {
        throw new Error("printer_configuration_empty");
    }
    const completed = new Set(alreadyPrinted);
    for (const printer of printers) {
        if (completed.has(printer.name)) continue;
        const receipt = formatReceipt(order, printer.paperWidthMm, receiptOptions);
        await print(order, printer, receipt);
        await onPrinterPrinted(printer.name);
        completed.add(printer.name);
    }
    return [...completed];
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

    async function selectedPrinters() {
        const printers = await queryPrinters();
        return Array.isArray(printers) ? printers : [];
    }

    function printersForJob(job, printers) {
        if (typeof job.stampanti === "undefined") return printers;
        if (!Array.isArray(job.stampanti)) return [];
        return printers.filter(printer => job.stampanti.includes(printer.name));
    }

    function hasMissingPrinter(job, selected) {
        return typeof job.stampanti !== "undefined"
            && (!Array.isArray(job.stampanti) || selected.length !== job.stampanti.length);
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

    async function claimNextJob(printers) {
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
            const selected = printersForJob(job, printers);
            if (!hasMissingPrinter(job, selected)
                    && ((typeof job.stampanti === "undefined" && selected.length === 0)
                        || selected.some(printer => printer.isVirtual || printer.state !== "ready"))) {
                workerState = "printer_unavailable";
                return null;
            }
            const orderRef = orders.doc(String(job.numero));
            const orderSnapshot = await transaction.get(orderRef);
            if (!orderSnapshot.exists) {
                transaction.update(jobRef, { status: "cancelled", lastError: "ordine_eliminato" });
                return null;
            }
            const relatedJobs = await transaction.get(jobs.where("numero", "==", job.numero));
            const anotherQueuedJob = relatedJobs.docs.some(document => (
                document.ref.id !== jobRef.id && document.data().status === "queued"
            ));
            if (selected.length > 0) workerState = "ready";
            transaction.update(jobRef, {
                status: "printing",
                claimedBy: instanceId,
                leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MILLISECONDS),
                attemptCount: (job.attemptCount || 0) + 1,
                lastError: FieldValue.delete()
            });
            transaction.update(orderRef, {
                stampaCompletata: false,
                stampaInCoda: anotherQueuedJob,
                messaggioStampa: anotherQueuedJob
                    ? "Comanda in attesa di stampa automatica."
                    : job.tipoStampa === "ristampa"
                        ? "Ristampa inviata alla stampante."
                        : job.tipoStampa === "aggiunta"
                            ? "Aggiunta inviata alla stampante."
                        : "Comanda inviata alla stampante."
            });
            return {
                jobRef,
                orderRef,
                order: orderSnapshot.data(),
                numero: job.numero,
                tipoStampa: job.tipoStampa || "completa",
                stampanti: job.stampanti,
                motivo: job.motivo,
                righe: job.righe,
                printedPrinters: Array.isArray(job.printedPrinters) ? [...job.printedPrinters] : []
            };
        });
    }

    async function recordPrinterPrinted(job, printerName) {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(job.jobRef);
            if (!snapshot.exists || snapshot.data().claimedBy !== instanceId
                    || snapshot.data().status !== "printing") {
                throw new Error("printer_job_claim_lost");
            }
            transaction.update(job.jobRef, {
                printedPrinters: FieldValue.arrayUnion(printerName),
                leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MILLISECONDS)
            });
        });
        if (!job.printedPrinters.includes(printerName)) {
            job.printedPrinters.push(printerName);
        }
    }

    async function finishJob(job, error, lastError = "invio_stampante_non_riuscito") {
        await db.runTransaction(async transaction => {
            const jobSnapshot = await transaction.get(job.jobRef);
            const orderSnapshot = await transaction.get(job.orderRef);
            if (!jobSnapshot.exists || jobSnapshot.data().claimedBy !== instanceId) return;
            const relatedJobs = await transaction.get(jobs.where("numero", "==", job.numero));
            const anotherQueuedJob = relatedJobs.docs.some(document => (
                document.ref.id !== job.jobRef.id && document.data().status === "queued"
            ));
            const completed = !error;
            const label = job.tipoStampa === "ristampa"
                ? "Ristampa"
                : job.tipoStampa === "aggiunta" ? "Aggiunta" : "Comanda";
            transaction.update(job.jobRef, {
                status: completed ? "printed" : "failed",
                printedAt: completed ? Timestamp.now() : FieldValue.delete(),
                failedAt: completed ? FieldValue.delete() : Timestamp.now(),
                leaseUntil: FieldValue.delete(),
                claimedBy: FieldValue.delete(),
                lastError: error ? lastError : FieldValue.delete()
            });
            if (orderSnapshot.exists) {
                transaction.update(job.orderRef, {
                    stampaCompletata: completed,
                    stampaInCoda: anotherQueuedJob,
                    messaggioStampa: anotherQueuedJob
                        ? "Comanda in attesa di stampa automatica."
                        : job.tipoStampa === "aggiunta"
                        ? completed
                            ? "Aggiunta completata."
                            : job.printedPrinters.length > 0
                                ? "Aggiunta riuscita su almeno una stampante, ma non su tutte. Verifica la connessione e premi Riprova sulla Home."
                                : "Aggiunta non riuscita. Verifica le stampanti e premi Riprova sulla Home."
                        : completed
                            ? job.tipoStampa === "completa" ? "Comanda stampata." : `${label} completata.`
                            : job.printedPrinters.length > 0
                                ? job.tipoStampa === "completa"
                                    ? "Comanda stampata su almeno una stampante, ma non su tutte. Verifica la connessione e premi Riprova sulla Home."
                                    : `${label} riuscita su almeno una stampante, ma non su tutte. Verifica la connessione e premi Riprova sulla Home.`
                                : `${label} non riuscita. Verifica le stampanti e premi Riprova sulla Home.`
                });
            }
        });
    }

    async function processOneJob(printers) {
        const job = await claimNextJob(printers);
        if (!job) return;
        const selected = printersForJob(job, printers);
        if (hasMissingPrinter(job, selected)) {
            await finishJob(job, new Error("stampante_non_configurata"), "stampante_non_configurata");
            return;
        }
        try {
            await sendOrderToPrinters(job.order, selected, {
                alreadyPrinted: job.printedPrinters,
                print: submitPrint,
                onPrinterPrinted: printerName => recordPrinterPrinted(job, printerName),
                receiptOptions: {
                    tipoStampa: job.tipoStampa,
                    motivo: job.motivo,
                    righe: job.righe
                }
            });
        } catch (error) {
            await finishJob(job, error);
            lastError = "Una o più stampanti non hanno ricevuto la comanda.";
            console.error(`Printing order #${job.numero} failed:`, error.code || error.name || "unknown");
            return;
        }
        try {
            await finishJob(job, null);
            lastPrintedOrder = job.numero;
            lastError = null;
            console.log(`Order #${job.numero} sent to all network printers.`);
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
        if (await recoverExpiredJob()) return;
        const printers = await selectedPrinters();
        workerState = printers.length > 0
                && printers.every(printer => !printer.isVirtual && printer.state === "ready")
            ? "ready"
            : "printer_unavailable";
        await processOneJob(printers);
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

module.exports = { createPrinterAgent, formatReceipt, initializeFirestore, sendOrderToPrinters };
