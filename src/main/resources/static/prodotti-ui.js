const prodottiUI = (() => {
    const LIMITE_RIGHE_ORDINE = 100;

    // Minuscolo e senza accenti: "Caffè" -> "caffe", "Crocché" -> "crocche".
    function normalizza(testo) {
        return String(testo ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    // Cerca nel nome di tutti i prodotti: ogni parola digitata deve comparire nel nome.
    // Prima i nomi che iniziano con il testo cercato, poi gli altri; a parità, ordine alfabetico.
    function filtraProdotti(menu, testo) {
        const query = normalizza(testo);
        if (!query) return [];
        const parole = query.split(" ");
        return (menu || [])
            .map(prodotto => ({ prodotto, nome: normalizza(prodotto.nome) }))
            .filter(voce => parole.every(parola => voce.nome.includes(parola)))
            .sort(
                (a, b) =>
                    Number(b.nome.startsWith(query)) - Number(a.nome.startsWith(query)) ||
                    a.prodotto.nome.localeCompare(b.prodotto.nome, "it")
            )
            .map(voce => voce.prodotto);
    }

    function ammetteExtra(prodotto) {
        return prodotto?.ammetteExtra === true;
    }

    function creaRiga(prodotto) {
        const conExtra = ammetteExtra(prodotto);
        return {
            prodotto: prodotto.nome,
            prezzo: prodotto.prezzo,
            categoria: prodotto.categoria,
            ingredienti: prodotto.ingredienti || [],
            ammetteExtra: conExtra,
            extra: []
        };
    }

    function aggiungiProdotti(righe, rigaAttiva, prodotto, quantita = 1) {
        const aggiunte = Array.from({ length: quantita }, () => creaRiga(prodotto));
        const nuoveRighe = [...righe, ...aggiunte];
        return {
            righe: nuoveRighe,
            rigaAttiva: ammetteExtra(prodotto) ? nuoveRighe.length - 1 : rigaAttiva
        };
    }

    function impostaRigaAttiva(righe, indice) {
        return {
            righe,
            rigaAttiva: Number.isInteger(indice) && ammetteExtra(righe[indice]) ? indice : null
        };
    }

    function rimuoviProdotto(righe, rigaAttiva, indice) {
        if (!Number.isInteger(indice) || indice < 0 || indice >= righe.length) {
            return { righe, rigaAttiva };
        }
        const nuoveRighe = righe.filter((_, posizione) => posizione !== indice);
        if (indice === rigaAttiva) {
            let prossimoAttivo = -1;
            nuoveRighe.forEach((riga, posizione) => {
                if (ammetteExtra(riga)) prossimoAttivo = posizione;
            });
            return { righe: nuoveRighe, rigaAttiva: prossimoAttivo };
        }
        const prossimoIndice = rigaAttiva === null ? null : rigaAttiva > indice ? rigaAttiva - 1 : rigaAttiva;
        return {
            righe: nuoveRighe,
            rigaAttiva: prossimoIndice !== null && ammetteExtra(nuoveRighe[prossimoIndice]) ? prossimoIndice : null
        };
    }

    function toggleExtra(righe, rigaAttiva, extra) {
        const riga = righe[rigaAttiva];
        if (!riga || !ammetteExtra(riga)) return { righe, rigaAttiva };
        const identitaExtra = elemento => elemento.id || elemento.nome;
        const presente = riga.extra.some(elemento => identitaExtra(elemento) === identitaExtra(extra));
        const nuoveRighe = righe.map((elemento, indice) => {
            if (indice !== rigaAttiva) return elemento;
            return {
                ...elemento,
                extra: presente
                    ? elemento.extra.filter(voce => identitaExtra(voce) !== identitaExtra(extra))
                    : [...elemento.extra, extra]
            };
        });
        return { righe: nuoveRighe, rigaAttiva };
    }

    function intestazioneExtra(righe, rigaAttiva) {
        const riga = righe[rigaAttiva];
        if (!riga || !ammetteExtra(riga)) return "Extra — aggiungi prima una pizza";
        const righeConStessoNome = righe.filter(elemento => elemento.prodotto === riga.prodotto);
        const posizione = righeConStessoNome.indexOf(riga) + 1;
        const disambiguazione = righeConStessoNome.length > 1 ? ` (n° ${posizione})` : "";
        return `Extra per: ${riga.prodotto}${disambiguazione}`;
    }

    function creaStatoMoltiplicatore() {
        return { numero: "", armato: false };
    }

    function premiTastoMoltiplicatore(stato, tasto) {
        if (tasto === "C") return creaStatoMoltiplicatore();
        if (tasto === "×") {
            return stato.numero ? { ...stato, armato: true } : stato;
        }
        if (!/^\d$/.test(tasto)) return stato;

        const numeroCorrente = stato.armato ? "" : stato.numero;
        if (numeroCorrente.length >= 2 || (!numeroCorrente && tasto === "0")) {
            return stato.armato ? creaStatoMoltiplicatore() : stato;
        }
        return { numero: `${numeroCorrente}${tasto}`, armato: false };
    }

    function quantitaDaApplicare(stato) {
        return stato.armato ? Number(stato.numero) : 1;
    }

    function testoMoltiplicatore(stato) {
        if (!stato.numero) return "—";
        return stato.armato ? `${stato.numero} ×` : stato.numero;
    }

    function aggiornaConteggioProdotti(elemento, numero) {
        elemento.textContent = `${numero} ${numero === 1 ? "prodotto" : "prodotti"}`;
    }

    function controllaLimiteRighe(righeAttuali, quantitaRichiesta) {
        const righeValide = Number.isInteger(righeAttuali) && righeAttuali >= 0;
        const disponibili = righeValide ? Math.max(0, LIMITE_RIGHE_ORDINE - righeAttuali) : 0;
        return {
            consentito: righeValide && righeAttuali <= LIMITE_RIGHE_ORDINE && Number.isInteger(quantitaRichiesta)
                && quantitaRichiesta > 0 && quantitaRichiesta <= disponibili,
            disponibili
        };
    }

    return {
        LIMITE_RIGHE_ORDINE,
        normalizza,
        filtraProdotti,
        ammetteExtra,
        creaRiga,
        aggiungiProdotti,
        impostaRigaAttiva,
        rimuoviProdotto,
        toggleExtra,
        intestazioneExtra,
        creaStatoMoltiplicatore,
        premiTastoMoltiplicatore,
        quantitaDaApplicare,
        testoMoltiplicatore,
        aggiornaConteggioProdotti,
        controllaLimiteRighe
    };
})();

if (typeof module !== "undefined" && module.exports) module.exports = prodottiUI;
if (typeof window !== "undefined") window.prodottiUI = prodottiUI;
