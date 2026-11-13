const { httpError } = require("./auth");

const romeDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
});

function getRomeDateParts(date) {
    return Object.fromEntries(romeDateFormatter.formatToParts(date)
        .filter(part => part.type !== "literal")
        .map(part => [part.type, Number(part.value)]));
}

function utcTimestamp(parts) {
    const date = new Date(0);
    date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    date.setUTCHours(parts.hour || 0, parts.minute || 0, parts.second || 0, 0);
    return date.getTime();
}

function midnightInRome(parts) {
    const target = utcTimestamp(parts);
    let instant = target;
    for (let attempt = 0; attempt < 4; attempt++) {
        const offset = utcTimestamp(getRomeDateParts(new Date(instant))) - instant;
        const adjusted = target - offset;
        if (adjusted === instant) break;
        instant = adjusted;
    }
    return new Date(instant);
}

function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw httpError(400, "La data deve essere valida e nel formato AAAA-MM-GG.");

    const parts = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
    const date = new Date(0);
    date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    date.setUTCHours(0, 0, 0, 0);
    if (parts.year < 1 || date.getUTCFullYear() !== parts.year
        || date.getUTCMonth() + 1 !== parts.month || date.getUTCDate() !== parts.day) {
        throw httpError(400, "La data deve essere valida e nel formato AAAA-MM-GG.");
    }
    return parts;
}

function todayInRome() {
    const parts = getRomeDateParts(new Date());
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getRomeDayRange(value) {
    const dateValue = value === undefined || value === null || value === "" ? todayInRome() : value;
    if (typeof dateValue !== "string") {
        throw httpError(400, "La data deve essere valida e nel formato AAAA-MM-GG.");
    }

    const startParts = parseDate(dateValue);
    const nextDate = new Date(0);
    nextDate.setUTCFullYear(startParts.year, startParts.month - 1, startParts.day + 1);
    nextDate.setUTCHours(0, 0, 0, 0);
    const endParts = {
        year: nextDate.getUTCFullYear(),
        month: nextDate.getUTCMonth() + 1,
        day: nextDate.getUTCDate()
    };

    return {
        start: midnightInRome(startParts).toISOString(),
        end: midnightInRome(endParts).toISOString()
    };
}

module.exports = { getRomeDayRange };
