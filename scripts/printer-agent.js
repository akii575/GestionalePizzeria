const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { cert, initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");
const { DEFAULT_RECEIPT_WIDTH, listNetworkPrinters, sendEscPosReceipt } = require("./network-printer");

const PROJECT_ID = "gestionalecivico7";
const LEASE_MILLISECONDS = 120_000;
const POLL_MILLISECONDS = 60_000;
const LOCK_RENEW_MILLISECONDS = 60_000;
const RECEIPT_MENU_CACHE_MILLISECONDS = 60_000;
const RECEIPT_WIDTH_58_MM = 16;

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
    const name = typeof extra === "string" ? extra : extra?.nome || "";
    const price = Number(typeof extra === "string" ? 0 : extra?.prezzo ?? 0);
    return { name, price: Number.isFinite(price) ? price : 0 };
}

function receiptUnitPrice(row) {
    if (row.totale !== undefined && row.totale !== null && Number.isFinite(Number(row.totale))) {
        return Number(row.totale);
    }
    const basePrice = Number(row.prezzoBase ?? row.prezzo ?? 0);
    return basePrice + (row.extra || []).reduce((sum, extra) => sum + receiptExtra(extra).price, 0);
}

function receiptBasePrice(row) {
    const storedValue = row.prezzoBase ?? row.prezzo;
    const storedBase = Number(storedValue);
    if (storedValue !== undefined && storedValue !== null && Number.isFinite(storedBase)) {
        return storedBase;
    }
    const total = Number(row.totale);
    if (Number.isFinite(total)) {
        return total - (row.extra || []).reduce((sum, extra) => sum + receiptExtra(extra).price, 0);
    }
    return 0;
}

function receiptAmount(price) {
    const rounded = Math.round(Number(price) * 100) / 100;
    return `EUR ${rounded.toFixed(2).replace(".", ",")}`;
}

function wrapReceiptItemParts(description, price, width) {
    const name = String(description).toLocaleUpperCase("it-IT").trim();
    const amount = receiptAmount(price);
    const nameLength = Array.from(name).length;
    if (nameLength + amount.length + 1 <= width) {
        return {
            nameLines: [`${name}${" ".repeat(width - nameLength - amount.length)}${amount}`],
            amountLine: null
        };
    }
    return {
        nameLines: wrapReceiptText(name, width),
        amountLine: `${" ".repeat(Math.max(0, width - amount.length))}${amount}`
    };
}

function wrapReceiptItem(description, price, width) {
    const parts = wrapReceiptItemParts(description, price, width);
    return [...parts.nameLines, ...(parts.amountLine ? [parts.amountLine] : [])];
}

function wrapReceiptBig(value, width) {
    return wrapReceiptText(value, width).map(line => `@@BIG:${line}@@`);
}

function wrapReceiptPrefix(prefix, value, width) {
    const prefixLength = Array.from(prefix).length;
    return wrapReceiptText(value, Math.max(1, width - prefixLength)).map((line, index) => (
        `${index === 0 ? prefix : " ".repeat(prefixLength)}${line}`
    ));
}

function wrapReceiptPrefixedItem(prefix, value, price, width) {
    const name = String(value).toLocaleUpperCase("it-IT").trim();
    const prefixLength = Array.from(prefix).length;
    const nameLength = Array.from(name).length;
    const amount = receiptAmount(price);
    if (prefixLength + nameLength + amount.length + 1 <= width) {
        return [`${prefix}${name}${" ".repeat(width - prefixLength - nameLength - amount.length)}${amount}`];
    }
    const nameLines = wrapReceiptText(name, Math.max(1, width - prefixLength));
    return [
        ...nameLines.map((line, index) => `${index === 0 ? prefix : " ".repeat(prefixLength)}${line}`),
        `${" ".repeat(Math.max(0, width - amount.length))}${amount}`
    ];
}

function receiptRowsForProfile(order, options) {
    if (options.tipoStampa === "variazione") {
        if (options.profile !== "cucina") return [];
        const variation = variationRowsForKitchen(options);
        return [
            ...variation.aggiunte,
            ...variation.tolte,
            ...variation.cambiate.flatMap(change => [change.prima, change.dopo])
        ];
    }
    const rows = options.tipoStampa === "aggiunta" ? options.righe || [] : order.righe || [];
    if (options.profile !== "cucina") return rows;
    const kitchenCategories = options.kitchenCategories;
    if (!(kitchenCategories instanceof Set) && !Array.isArray(kitchenCategories)) return rows;
    const allowed = kitchenCategories instanceof Set ? kitchenCategories : new Set(kitchenCategories);
    const productCategories = options.productCategories || {};
    return rows.filter(row => {
        const category = row.categoria || productCategories[row.prodotto];
        return category === undefined || allowed.has(category);
    });
}

function variationRowsForKitchen(options) {
    const categories = options.variationCategories == null
        ? null
        : options.variationCategories instanceof Set
            ? options.variationCategories
            : new Set(Array.isArray(options.variationCategories) ? options.variationCategories : []);
    const productCategories = options.productCategories || {};
    const printable = row => {
        if (categories === null) return true;
        const category = row.categoria || productCategories[row.prodotto];
        return category === undefined || categories.has(category);
    };
    return {
        aggiunte: (options.aggiunte || []).filter(printable),
        tolte: (options.tolte || []).filter(printable),
        cambiate: (options.cambiate || []).filter(change => (
            change?.prima && change?.dopo && (printable(change.prima) || printable(change.dopo))
        ))
    };
}

function receiptRowKey(row) {
    const rowExtras = (row.extra || []).map(receiptExtra);
    const senza = (Array.isArray(row.senza) ? row.senza : [])
        .filter(ingredient => typeof ingredient === "string")
        .map(ingredient => ingredient.trim().toLocaleLowerCase("it-IT"))
        .sort((first, second) => first.localeCompare(second, "it-IT"));
    const notes = (Array.isArray(row.note) ? row.note : [])
        .filter(note => typeof note === "string")
        .map(note => note.trim().toLocaleLowerCase("it-IT"))
        .sort((first, second) => first.localeCompare(second, "it-IT"));
    return JSON.stringify([
        row.prodotto,
        rowExtras.map(extra => [extra.name, extra.price])
            .sort((first, second) => first[0].localeCompare(second[0], "it")),
        senza,
        notes,
        receiptBasePrice(row)
    ]);
}

function groupReceiptRows(rows) {
    const groupedRows = new Map();
    for (const row of rows) {
        const rowExtras = (row.extra || []).map(receiptExtra);
        const notes = (Array.isArray(row.note) ? row.note : [])
            .filter(note => typeof note === "string" && note.trim());
        const basePrice = receiptBasePrice(row);
        const key = receiptRowKey(row);
        const existing = groupedRows.get(key);
        if (existing) {
            existing.quantity++;
        } else {
            groupedRows.set(key, { row, rowExtras, basePrice, notes, quantity: 1 });
        }
    }
    return [...groupedRows.values()];
}

function formatKitchenRows(rows, options, receiptWidth) {
    const lines = [];
    for (const { row, rowExtras, notes, quantity } of groupReceiptRows(rows)) {
        lines.push(...wrapReceiptText(`${quantity}x ${row.prodotto}`, receiptWidth)
            .map(line => `@@ITEM:${line}@@`));
        const ingredients = options.productIngredients?.[row.prodotto];
        const senza = (Array.isArray(row.senza) ? row.senza : [])
            .filter(ingredient => typeof ingredient === "string" && ingredient.trim());
        const sansNames = new Set(senza.map(ingredient => ingredient.trim().toLocaleLowerCase("it-IT")));
        const productIngredients = Array.isArray(ingredients)
            ? ingredients
            : Array.isArray(row.ingredienti) ? row.ingredienti : [];
        const displayedIngredients = productIngredients.filter(ingredient =>
            typeof ingredient === "string"
            && !sansNames.has(ingredient.trim().toLocaleLowerCase("it-IT"))
        );
        if (displayedIngredients.length) {
            lines.push(...wrapReceiptPrefix("  ", displayedIngredients.join(", "), receiptWidth * 2)
                .map(line => `@@SMALL:${line}@@`));
        }
        for (const ingredient of senza) {
            lines.push(...wrapReceiptPrefix("  - SENZA ", ingredient.toLocaleUpperCase("it-IT"), receiptWidth)
                .map(line => `@@ITEM:${line}@@`));
        }
        for (const note of notes) {
            lines.push(...wrapReceiptPrefix("  ! ", note.toLocaleUpperCase("it-IT"), receiptWidth)
                .map(line => `@@ITEM:${line}@@`));
        }
        for (const extra of rowExtras) {
            lines.push(...wrapReceiptPrefix("  + ", extra.name, receiptWidth)
                .map(line => `@@ITEM:${line}@@`));
        }
    }
    return lines;
}

function formatVariationChange(change, quantity, width) {
    const { dopo } = change;
    const lines = [
        ...wrapReceiptText(`${quantity}x ${dopo.prodotto}`, width).map(line => `@@ITEM:${line}@@`)
    ];
    const senza = (Array.isArray(dopo.senza) ? dopo.senza : [])
        .filter(value => typeof value === "string" && value.trim());
    const notes = (Array.isArray(dopo.note) ? dopo.note : [])
        .filter(value => typeof value === "string" && value.trim());
    const extras = (Array.isArray(dopo.extra) ? dopo.extra : [])
        .map(receiptExtra)
        .filter(extra => extra.name.trim());
    if (senza.length || notes.length || extras.length) {
        lines.push("@@ITEM:  ORA:@@");
    }
    for (const ingredient of senza) {
        lines.push(...wrapReceiptPrefix("  - SENZA ", ingredient.toLocaleUpperCase("it-IT"), width)
            .map(line => `@@ITEM:${line}@@`));
    }
    for (const note of notes) {
        lines.push(...wrapReceiptPrefix("  ! ", note.toLocaleUpperCase("it-IT"), width)
            .map(line => `@@ITEM:${line}@@`));
    }
    for (const extra of extras) {
        lines.push(...wrapReceiptPrefix("  + ", extra.name, width)
            .map(line => `@@ITEM:${line}@@`));
    }
    return lines;
}

function groupChangedRows(changes) {
    const grouped = new Map();
    for (const change of changes) {
        const key = JSON.stringify([receiptRowKey(change.prima), receiptRowKey(change.dopo)]);
        const existing = grouped.get(key);
        if (existing) existing.quantity++;
        else grouped.set(key, { change, quantity: 1 });
    }
    return [...grouped.values()];
}

function variationDestination(order) {
    const tipo = ["banco", "ritiro", "consegna"].includes(order.tipo) ? order.tipo : "tavolo";
    if (tipo === "consegna") return order.indirizzoConsegna || order.tavoloOCliente || "CONSEGNA";
    if (tipo === "banco") return order.cognomeBanco ? `BANCO ${order.cognomeBanco}` : "BANCO";
    if (order.tavoloOCliente) return order.tavoloOCliente;
    return tipo === "ritiro" ? "RITIRO" : "TAVOLO";
}

function formatVariationReceipt(order, paperWidthMm, options) {
    const receiptWidth = paperWidthMm === 58 ? RECEIPT_WIDTH_58_MM : DEFAULT_RECEIPT_WIDTH;
    const bigWidth = Math.floor(receiptWidth * 2 / 3);
    const variation = variationRowsForKitchen(options);
    const createdAt = new Date(options.createdAt || Date.now());
    const time = (Number.isFinite(createdAt.getTime()) ? createdAt : new Date()).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "Europe/Rome"
    });
    const lines = [
        ...wrapReceiptBig(`VARIAZIONE #${order.numero ?? ""}`, bigWidth),
        ...wrapReceiptText(`${variationDestination(order)} · ${time}`, receiptWidth)
    ];
    if (variation.aggiunte.length) {
        lines.push("--- AGGIUNGERE ---", ...formatKitchenRows(variation.aggiunte, options, receiptWidth));
    }
    if (variation.tolte.length) {
        lines.push("--- TOGLIERE ---", ...formatKitchenRows(variation.tolte, options, receiptWidth));
    }
    if (variation.cambiate.length) {
        lines.push("--- CAMBIARE ---");
        for (const { change, quantity } of groupChangedRows(variation.cambiate)) {
            lines.push(...formatVariationChange(change, quantity, receiptWidth));
        }
    }
    if (order.orario) lines.push(...wrapReceiptBig(`ORARIO ${order.orario}`, bigWidth));
    return lines.join("\r\n");
}

function formatReceipt(order, paperWidthMm = 80, options = {}) {
    if (options.tipoStampa === "variazione") {
        return formatVariationReceipt(order, paperWidthMm, options);
    }
    const receiptWidth = paperWidthMm === 58 ? RECEIPT_WIDTH_58_MM : DEFAULT_RECEIPT_WIDTH;
    const bigWidth = Math.floor(receiptWidth * 2 / 3);
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
    const lines = [
        ...wrapReceiptBig(`#${order.numero ?? ""}`, bigWidth),
        `@@TITLE:${receiptTitle}@@`,
        divider
    ];
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
    const receiptOptions = { ...options, profile: options.profile === "cucina" ? "cucina" : "sala" };
    const receiptRows = receiptRowsForProfile(order, receiptOptions);
    const productCategories = options.productCategories || {};
    for (const row of receiptRows) {
        const category = row.categoria || productCategories[row.prodotto] || "altro";
        if (!rowsByCategory.has(category)) rowsByCategory.set(category, []);
        rowsByCategory.get(category).push(row);
    }
    const requestedCategoryOrder = Array.isArray(options.categoryOrder) ? options.categoryOrder : [];
    const categoryOrder = new Map(requestedCategoryOrder.map((category, index) => [category, index]));
    const categories = [...rowsByCategory.keys()].sort((first, second) => {
        const firstOrder = categoryOrder.has(first) ? categoryOrder.get(first) : Number.MAX_SAFE_INTEGER;
        const secondOrder = categoryOrder.has(second) ? categoryOrder.get(second) : Number.MAX_SAFE_INTEGER;
        return firstOrder - secondOrder;
    });
    for (const category of categories) {
        lines.push(`@@SECTION:${category.toLocaleUpperCase("it-IT")}@@`);
        const categoryRows = rowsByCategory.get(category);
        if (receiptOptions.profile === "cucina") {
            lines.push(...formatKitchenRows(categoryRows, options, receiptWidth));
            lines.push(divider);
            continue;
        }
        for (const { row, rowExtras, basePrice, notes, quantity } of groupReceiptRows(categoryRows)) {
            const baseTotal = Math.round(basePrice * quantity * 100) / 100;
            const itemParts = wrapReceiptItemParts(`${quantity}x ${row.prodotto}`, baseTotal, receiptWidth);
            lines.push(...itemParts.nameLines.map(line => `@@ITEM:${line}@@`));
            if (itemParts.amountLine) lines.push(itemParts.amountLine);
            for (const ingredient of (Array.isArray(row.senza) ? row.senza : [])
                .filter(value => typeof value === "string" && value.trim())) {
                const prefix = "  - senza ";
                lines.push(...wrapReceiptText(
                    ingredient.toLocaleLowerCase("it-IT"),
                    Math.max(1, receiptWidth - Array.from(prefix).length)
                ).map(line => `${prefix}${line.toLocaleLowerCase("it-IT")}`));
            }
            for (const note of notes) {
                const prefix = "  * ";
                lines.push(...wrapReceiptText(
                    note.toLocaleLowerCase("it-IT"),
                    Math.max(1, receiptWidth - Array.from(prefix).length)
                ).map(line => `${prefix}${line.toLocaleLowerCase("it-IT")}`));
            }
            for (const extra of rowExtras) {
                const extraTotal = Math.round(extra.price * quantity * 100) / 100;
                if (extra.price > 0) {
                    lines.push(...wrapReceiptPrefixedItem("  + ", extra.name, extraTotal, receiptWidth));
                } else {
                    lines.push(...wrapReceiptPrefix("  + ", extra.name, receiptWidth));
                }
            }
        }
        lines.push(divider);
    }
    if (receiptOptions.profile === "sala" && options.tipoStampa === "aggiunta") {
        const totalAdded = Math.round(receiptRows.reduce((sum, row) => sum + receiptUnitPrice(row), 0) * 100) / 100;
        lines.push(...wrapReceiptItem("TOTALE AGGIUNTA", totalAdded, receiptWidth));
        lines.push(...wrapReceiptItem("NUOVO TOTALE", Number(order.totale || 0), receiptWidth));
    } else if (receiptOptions.profile === "sala") {
        if (Number(order.coperto?.totale) > 0) {
            lines.push(...wrapReceiptItem(`COPERTO ${Number(order.coperto.persone) || 0}X`, Number(order.coperto.totale), receiptWidth));
        }
        if (tipo === "consegna" && Number(order.costoConsegna) > 0) {
            lines.push(...wrapReceiptItem("COSTO CONSEGNA", Number(order.costoConsegna), receiptWidth));
        }
    }
    if (receiptOptions.profile === "sala" && options.tipoStampa !== "aggiunta") {
        const amount = receiptAmount(Number(order.totale || 0));
        const totalGap = receiptWidth - "TOTALE".length - amount.length;
        if (categories.length === 0) lines.push(divider);
        if (totalGap > 0) {
            lines.push(`TOTALE${" ".repeat(totalGap)}${amount}`);
        } else {
            lines.push(...wrapReceiptText(`TOTALE ${amount}`, receiptWidth));
        }
        lines.push(divider);
    }
    if (order.orario) lines.push(...wrapReceiptBig(`ORARIO ${order.orario}`, bigWidth));
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
        const profile = printer.name.trim().toLocaleLowerCase("it-IT") === "cucina" ? "cucina" : "sala";
        const printerReceiptOptions = { ...receiptOptions, profile };
        if (receiptOptions.tipoStampa === "variazione" && profile === "sala") {
            await onPrinterPrinted(printer.name);
            completed.add(printer.name);
            continue;
        }
        if (profile === "cucina" && receiptRowsForProfile(order, printerReceiptOptions).length === 0) {
            await onPrinterPrinted(printer.name);
            completed.add(printer.name);
            continue;
        }
        const receipt = formatReceipt(order, printer.paperWidthMm, printerReceiptOptions);
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
    let printers = [];
    let ownsLock = false;
    let drainPromise = null;
    let drainRequested = false;
    let securityPromise = null;
    let lockPromise = null;
    let receiptMenuCache = null;
    let receiptMenuCacheExpiresAt = 0;
    let receiptMenuPromise = null;
    let unsubscribeQueue = null;
    let queueListenerActive = false;
    let lastQueueSnapshotHadJobs = false;
    let listenerRetryTimer = null;
    let listenerRetryAttempt = 0;
    let securityTimer = null;
    let lockTimer = null;
    let running = false;

    async function acquireLock() {
        if (lockPromise) return lockPromise;
        lockPromise = db.runTransaction(async transaction => {
            const snapshot = await transaction.get(lockRef);
            const lock = snapshot.exists ? snapshot.data() : {};
            const leaseUntil = lock.leaseUntil && lock.leaseUntil.toMillis();
            if (lock.instanceId && lock.instanceId !== instanceId && leaseUntil > Date.now()) {
                return false;
            }
            transaction.set(lockRef, {
                instanceId,
                leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MILLISECONDS),
                capabilities: ["variazione"]
            });
            return true;
        }).then(acquired => {
            ownsLock = acquired;
            return acquired;
        }).finally(() => {
            lockPromise = null;
        });
        return lockPromise;
    }

    async function refreshPrinters() {
        try {
            const available = await queryPrinters();
            printers = Array.isArray(available) ? available : [];
            workerState = printers.length > 0
                    && printers.every(printer => !printer.isVirtual && printer.state === "ready")
                ? "ready"
                : "printer_unavailable";
        } catch (error) {
            printers = [];
            workerState = "printer_unavailable";
            console.error("Unable to refresh printer status:", error.code || error.name || "unknown");
        }
        return printers;
    }

    async function getReceiptMenuData() {
        if (receiptMenuCache && Date.now() < receiptMenuCacheExpiresAt) {
            return receiptMenuCache;
        }
        if (!receiptMenuPromise) {
            receiptMenuPromise = Promise.all([
                db.collection("menuCategorie").get(),
                db.collection("menuProdotti").get()
            ])
                .then(([categorySnapshot, productSnapshot]) => {
                    const categoryOrder = categorySnapshot.docs
                        .filter(document => document.data().archiviata !== true)
                        .sort((first, second) => (
                            Number(first.data().ordine || 0) - Number(second.data().ordine || 0)
                            || first.id.localeCompare(second.id)
                        ))
                        .map(document => document.id);
                    const productCategories = Object.fromEntries(
                        productSnapshot.docs
                            .map(document => document.data())
                            .filter(product => product.nome && product.categoriaId)
                            .map(product => [product.nome, product.categoriaId])
                    );
                    const productIngredients = Object.fromEntries(
                        productSnapshot.docs
                            .map(document => document.data())
                            .filter(product => product.nome && Array.isArray(product.ingredienti))
                            .map(product => [product.nome, product.ingredienti])
                    );
                    const kitchenCategories = new Set(
                        categorySnapshot.docs
                            .filter(document => document.data().stampaCucina !== false)
                            .map(document => document.id)
                    );
                    const variationCategories = new Set(
                        categorySnapshot.docs
                            .filter(document => (
                                document.data().stampaVariazioni === undefined
                                    ? document.data().stampaCucina !== false
                                    : document.data().stampaVariazioni === true
                            ))
                            .map(document => document.id)
                    );
                    const menuData = {
                        categoryOrder,
                        productCategories,
                        productIngredients,
                        kitchenCategories,
                        variationCategories
                    };
                    receiptMenuCache = menuData;
                    receiptMenuCacheExpiresAt = Date.now() + RECEIPT_MENU_CACHE_MILLISECONDS;
                    return menuData;
                })
                .catch(error => {
                    console.error("Unable to load menu categories for receipt:", error.code || error.name || "unknown");
                    return {
                        categoryOrder: [],
                        productCategories: {},
                        productIngredients: {},
                        kitchenCategories: null,
                        variationCategories: null
                    };
                })
                .finally(() => {
                    receiptMenuPromise = null;
                });
        }
        return receiptMenuPromise;
    }

    function printersForJob(job, printers) {
        if (typeof job.stampanti === "undefined") return printers;
        if (!Array.isArray(job.stampanti)) return [];
        return printers.filter(printer => job.stampanti.includes(printer.name));
    }

    function targetPrinterNames(job, printers) {
        const names = typeof job.stampanti === "undefined"
            ? printers.map(printer => printer.name)
            : Array.isArray(job.stampanti) ? job.stampanti : [];
        return [...new Set(names)];
    }

    function readyUnprintedPrinters(job, printers) {
        const printed = new Set(Array.isArray(job.printedPrinters) ? job.printedPrinters : []);
        return printersForJob(job, printers).filter(printer => (
            !printer.isVirtual && printer.state === "ready" && !printed.has(printer.name)
        ));
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
            .limit(20)
            .get();
        for (const candidate of snapshot.docs) {
            const claimedJob = await db.runTransaction(async transaction => {
                const controlSnapshot = await transaction.get(controlRef);
                const lockSnapshot = await transaction.get(lockRef);
                const jobSnapshot = await transaction.get(candidate.ref);
                if (controlSnapshot.data()?.paused || lockSnapshot.data()?.instanceId !== instanceId
                        || !jobSnapshot.exists || jobSnapshot.data().status !== "queued") {
                    return null;
                }
                const job = jobSnapshot.data();
                if (!readyUnprintedPrinters(job, printers).length) return null;

                const orderRef = orders.doc(String(job.numero));
                const orderSnapshot = await transaction.get(orderRef);
                if (!orderSnapshot.exists) {
                    transaction.update(candidate.ref, { status: "cancelled", lastError: "ordine_eliminato" });
                    return null;
                }
                const relatedJobs = await transaction.get(jobs.where("numero", "==", job.numero));
                const anotherQueuedJob = relatedJobs.docs.some(document => (
                    document.ref.id !== candidate.ref.id && document.data().status === "queued"
                ));
                workerState = "ready";
                transaction.update(candidate.ref, {
                    status: "printing",
                    claimedBy: instanceId,
                    leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MILLISECONDS),
                    attemptCount: (job.attemptCount || 0) + 1,
                    lastError: FieldValue.delete()
                });
                const printMessage = job.tipoStampa === "variazione"
                    ? "Variazione in stampa per la cucina."
                    : job.tipoStampa === "ristampa"
                        ? "Ristampa inviata alla stampante."
                        : job.tipoStampa === "aggiunta"
                            ? "Aggiunta inviata alla stampante."
                            : "Comanda inviata alla stampante.";
                transaction.update(orderRef, {
                    stampaCompletata: false,
                    stampaInCoda: anotherQueuedJob,
                    messaggioStampa: anotherQueuedJob ? "Comanda in attesa di stampa automatica." : printMessage
                });
                return {
                    jobRef: candidate.ref,
                    orderRef,
                    order: orderSnapshot.data(),
                    numero: job.numero,
                    tipoStampa: job.tipoStampa || "completa",
                    stampanti: job.stampanti,
                    motivo: job.motivo,
                    righe: job.righe,
                    aggiunte: job.aggiunte,
                    tolte: job.tolte,
                    cambiate: job.cambiate,
                    createdAt: job.createdAt,
                    printedPrinters: Array.isArray(job.printedPrinters) ? [...job.printedPrinters] : []
                };
            });
            if (claimedJob) return claimedJob;
        }
        return null;
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
                : job.tipoStampa === "aggiunta" ? "Aggiunta" : job.tipoStampa === "variazione" ? "Variazione" : "Comanda";
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
                        : job.tipoStampa === "variazione"
                            ? completed
                                ? job.nessunaPizzaStampabile
                                    ? "Variazione senza pizze: nessuna stampa"
                                    : "Variazione completata."
                                : job.printedPrinters.length > 0
                                    ? "Variazione riuscita su almeno una stampante, ma non su tutte. Verifica la connessione e premi Riprova sulla Home."
                                    : "Variazione non riuscita. Verifica le stampanti e premi Riprova sulla Home."
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

    async function requeueForMissingPrinters(job, missingPrinters) {
        const printedPrinters = targetPrinterNames(job, printers)
            .filter(name => job.printedPrinters.includes(name));
        await db.runTransaction(async transaction => {
            const jobSnapshot = await transaction.get(job.jobRef);
            if (!jobSnapshot.exists || jobSnapshot.data().claimedBy !== instanceId
                    || jobSnapshot.data().status !== "printing") {
                return;
            }
            const orderSnapshot = await transaction.get(job.orderRef);
            transaction.update(job.jobRef, {
                status: "queued",
                leaseUntil: FieldValue.delete(),
                claimedBy: FieldValue.delete(),
                lastError: FieldValue.delete()
            });
            if (orderSnapshot.exists) {
                transaction.update(job.orderRef, {
                    stampaCompletata: false,
                    stampaInCoda: true,
                    messaggioStampa: printedPrinters.length > 0
                        ? `Stampata in ${printedPrinters.join(", ")}, in attesa di ${missingPrinters.join(", ")}.`
                        : `In attesa di ${missingPrinters.join(", ")}.`
                });
            }
        });
    }

    async function processOneJob() {
        const job = await claimNextJob(printers);
        if (!job) return false;
        const selected = readyUnprintedPrinters(job, printers);
        if (!selected.length) {
            const missingPrinters = targetPrinterNames(job, printers)
                .filter(name => !job.printedPrinters.includes(name));
            await requeueForMissingPrinters(job, missingPrinters);
            return true;
        }
        try {
            const receiptOptions = {
                tipoStampa: job.tipoStampa,
                motivo: job.motivo,
                righe: job.righe,
                aggiunte: job.aggiunte || [],
                tolte: job.tolte || [],
                cambiate: job.cambiate || [],
                createdAt: job.createdAt,
                ...(await getReceiptMenuData())
            };
            if (job.tipoStampa === "variazione") {
                job.nessunaPizzaStampabile = receiptRowsForProfile(job.order, {
                    ...receiptOptions,
                    profile: "cucina"
                }).length === 0;
            }
            await sendOrderToPrinters(job.order, selected, {
                alreadyPrinted: job.printedPrinters,
                print: submitPrint,
                onPrinterPrinted: printerName => recordPrinterPrinted(job, printerName),
                receiptOptions
            });
        } catch (error) {
            await finishJob(job, error);
            lastError = "Una o più stampanti non hanno ricevuto la comanda.";
            console.error(`Printing order #${job.numero} failed:`, error.code || error.name || "unknown");
            await refreshPrinters();
            return true;
        }
        const missingPrinters = targetPrinterNames(job, printers)
            .filter(name => !job.printedPrinters.includes(name));
        if (missingPrinters.length > 0) {
            try {
                await requeueForMissingPrinters(job, missingPrinters);
                lastPrintedOrder = job.numero;
                lastError = null;
                console.log(
                    `Order #${job.numero} printed on ${job.printedPrinters.join(", ")}; waiting for ${missingPrinters.join(", ")}.`
                );
            } catch (error) {
                lastError = "Comanda stampata in parte, ma non e' stato possibile aggiornare la coda.";
                console.error("Unable to requeue partially printed order:", error.code || error.name || "unknown");
            }
            return true;
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
        return true;
    }

    async function drainQueue() {
        drainRequested = true;
        if (drainPromise) return drainPromise;
        drainPromise = (async () => {
            while (active && drainRequested) {
                drainRequested = false;
                while (active) {
                    const control = await controlRef.get();
                    if (control.data()?.paused) {
                        workerState = "paused";
                        break;
                    }
                    if (!await acquireLock()) {
                        workerState = "another_terminal_active";
                        break;
                    }
                    if (!await processOneJob()) break;
                }
            }
        })().catch(error => {
            workerState = "cloud_unavailable";
            lastError = "Connessione alla coda di stampa non disponibile.";
            console.error("Printer queue drain failed:", error.code || error.name || "unknown");
        }).finally(() => {
            drainPromise = null;
            if (active && drainRequested) void drainQueue();
        });
        return drainPromise;
    }

    function handleListenerError(error) {
        unsubscribeQueue?.();
        unsubscribeQueue = null;
        queueListenerActive = false;
        lastQueueSnapshotHadJobs = false;
        if (!active || listenerRetryTimer) return;
        workerState = "cloud_unavailable";
        lastError = "Connessione alla coda di stampa non disponibile.";
        console.error("Printer queue listener failed:", error.code || error.name || "unknown");
        const delays = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];
        const delay = delays[Math.min(listenerRetryAttempt, delays.length - 1)];
        listenerRetryAttempt++;
        listenerRetryTimer = setTimeout(() => {
            listenerRetryTimer = null;
            listenForQueuedJobs();
        }, delay);
    }

    function listenForQueuedJobs() {
        if (!active || queueListenerActive) return;
        try {
            queueListenerActive = true;
            unsubscribeQueue = jobs.where("status", "==", "queued").onSnapshot(snapshot => {
                listenerRetryAttempt = 0;
                lastQueueSnapshotHadJobs = !snapshot.empty;
                if (!snapshot.empty) {
                    void drainQueue().catch(error => {
                        workerState = "cloud_unavailable";
                        lastError = "Connessione alla coda di stampa non disponibile.";
                        console.error("Printer queue drain failed:", error.code || error.name || "unknown");
                    });
                }
            }, handleListenerError);
        } catch (error) {
            handleListenerError(error);
        }
    }

    async function refreshQueueState() {
        if (securityPromise) return securityPromise;
        securityPromise = (async () => {
            const control = await controlRef.get();
            if (control.data()?.paused) {
                workerState = "paused";
                return;
            }
            if (!await acquireLock()) {
                workerState = "another_terminal_active";
                return;
            }
            await recoverExpiredJob();
            await refreshPrinters();
            if (lastError === "Connessione alla coda di stampa non disponibile.") lastError = null;
            if (!queueListenerActive || lastQueueSnapshotHadJobs) {
                await drainQueue();
            }
        })().finally(() => {
            securityPromise = null;
        });
        return securityPromise;
    }

    async function runSafely(operation, label) {
        try {
            await operation();
        } catch (error) {
            workerState = "cloud_unavailable";
            lastError = "Connessione alla coda di stampa non disponibile.";
            console.error(`${label}:`, error.code || error.name || "unknown");
        }
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
        if (running) return;
        active = true;
        running = true;
        listenForQueuedJobs();
        securityTimer = setInterval(
            () => runSafely(refreshQueueState, "Printer agent security poll failed"),
            POLL_MILLISECONDS
        );
        lockTimer = setInterval(
            () => runSafely(acquireLock, "Printer agent lock renewal failed"),
            LOCK_RENEW_MILLISECONDS
        );
        await runSafely(refreshQueueState, "Printer agent startup failed");
    }

    async function stop() {
        active = false;
        running = false;
        unsubscribeQueue?.();
        unsubscribeQueue = null;
        queueListenerActive = false;
        lastQueueSnapshotHadJobs = false;
        clearInterval(securityTimer);
        clearInterval(lockTimer);
        clearTimeout(listenerRetryTimer);
        securityTimer = null;
        lockTimer = null;
        listenerRetryTimer = null;
        await Promise.all([drainPromise, securityPromise, lockPromise].filter(Boolean));
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(lockRef);
            if (ownsLock && snapshot.data()?.instanceId === instanceId) {
                transaction.set(lockRef, { instanceId, leaseUntil: Timestamp.fromMillis(0) });
            }
        });
        ownsLock = false;
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
