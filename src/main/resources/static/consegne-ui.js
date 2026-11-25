const consegneUI = (() => {
    const formatterOraRoma = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });

    function oraRiferimento(ordine) {
        if (typeof ordine?.orario === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(ordine.orario)) {
            return ordine.orario;
        }
        const dataOra = new Date(ordine?.dataOra);
        if (!Number.isFinite(dataOra.getTime())) return null;
        const parti = Object.fromEntries(formatterOraRoma.formatToParts(dataOra)
            .filter(parte => parte.type !== "literal")
            .map(parte => [parte.type, parte.value]));
        return `${parti.hour}:${parti.minute}`;
    }

    function fasciaConsegna(ordine, inizioSera = "16:00") {
        const ora = oraRiferimento(ordine);
        if (!ora) return null;
        return ora >= inizioSera || ora < "05:00" ? "sera" : "mattina";
    }

    function fasciaCorrente(adesso = new Date(), inizioSera = "16:00") {
        const data = adesso instanceof Date ? adesso : new Date(adesso);
        if (!Number.isFinite(data.getTime())) return null;
        const parti = Object.fromEntries(formatterOraRoma.formatToParts(data)
            .filter(parte => parte.type !== "literal")
            .map(parte => [parte.type, parte.value]));
        return fasciaConsegna({ orario: `${parti.hour}:${parti.minute}` }, inizioSera);
    }

    function creaTotali() {
        const pagamento = () => ({ consegne: 0, totaleCentesimi: 0 });
        return {
            consegne: 0,
            totaleCentesimi: 0,
            pos: pagamento(),
            pagato: pagamento(),
            nonPagato: pagamento(),
            daVerificare: pagamento()
        };
    }

    function aggiungiImporto(totali, pagamento, ordine) {
        const importo = Number(ordine?.totale);
        const centesimi = Number.isFinite(importo)
            ? Math.round((importo + Number.EPSILON) * 100)
            : 0;
        totali.consegne++;
        totali.totaleCentesimi += centesimi;
        pagamento.consegne++;
        pagamento.totaleCentesimi += centesimi;
    }

    function totaliFascia(ordini, inizioSera = "16:00") {
        const totali = { mattina: creaTotali(), sera: creaTotali() };
        for (const ordine of Array.isArray(ordini) ? ordini : []) {
            const fascia = fasciaConsegna(ordine, inizioSera);
            if (!fascia) continue;
            const fasciaTotale = totali[fascia];
            const stato = ordine?.statoPagamento;
            const chiavePagamento = stato === "pos"
                ? "pos"
                : stato === "pagato" ? "pagato" : stato === "non_pagato" ? "nonPagato" : "daVerificare";
            aggiungiImporto(fasciaTotale, fasciaTotale[chiavePagamento], ordine);
        }
        return totali;
    }

    function preparaSezioniFascia(ordini, aperture, {
        dataSelezionata,
        dataCorrente,
        fasciaCorrente,
        inizioSera = "16:00"
    } = {}) {
        const gruppi = { mattina: [], sera: [] };
        const apertureFasce = apertureMap(aperture);
        for (const ordine of Array.isArray(ordini) ? ordini : []) {
            const fascia = fasciaConsegna(ordine, inizioSera);
            if (fascia) gruppi[fascia].push(ordine);
        }
        return ["mattina", "sera"]
            .filter(fascia => gruppi[fascia].length > 0)
            .map(fascia => {
                const defaultOpen = dataSelezionata !== dataCorrente || fascia === fasciaCorrente;
                const open = apertureHave(apertureFasce, fascia);
                return {
                    fascia,
                    ordini: gruppi[fascia],
                    open: open === null ? defaultOpen : open
                };
            });
    }

    function apertureHave(apertureFasce, fascia) {
        return apertureFasce.has(fascia) ? apertureFasce.get(fascia) : null;
    }

    function apertureMap(apertures) {
        return apertures instanceof Map ? apertures : new Map(Object.entries(apertures || {}));
    }

    return Object.freeze({ fasciaConsegna, fasciaCorrente, totaliFascia, preparaSezioniFascia });
})();

if (typeof module !== "undefined" && module.exports) module.exports = consegneUI;
if (typeof window !== "undefined") window.consegneUI = consegneUI;
