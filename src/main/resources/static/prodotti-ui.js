const prodottiUI = (() => {
    const LIMITE_RIGHE_ORDINE = 100;
    const menuCacheKey = "civico7-menu-v1";

    function leggiCacheMenu(storage) {
        try {
            const archivio = storage || globalThis.localStorage;
            const cache = JSON.parse(archivio.getItem(menuCacheKey));
            const versione = Number(cache?.versione);
            if (!Number.isSafeInteger(versione) || versione < 0
                    || !Array.isArray(cache.menu) || !Array.isArray(cache.extra)) {
                return null;
            }
            return { versione, menu: cache.menu, extra: cache.extra };
        } catch {
            return null;
        }
    }

    function salvaCacheMenu(cache, storage) {
        try {
            const archivio = storage || globalThis.localStorage;
            archivio.setItem(menuCacheKey, JSON.stringify(cache));
            return true;
        } catch {
            return false;
        }
    }

    function caricaMenuConCache(fetchMenu, disegna, storage) {
        const cache = leggiCacheMenu(storage);
        if (cache) disegna(cache.menu, cache.extra);

        let richiesta;
        try {
            richiesta = fetchMenu();
        } catch (errore) {
            richiesta = Promise.reject(errore);
        }
        const aggiornamento = Promise.resolve(richiesta).then(dati => {
            if (!dati || !Array.isArray(dati.menu) || !Array.isArray(dati.extra)) {
                throw new Error("La risposta del menu non e' valida.");
            }
            const versioneRicevuta = typeof dati.versione === "number"
                || (typeof dati.versione === "string" && dati.versione.trim() !== "");
            const versione = versioneRicevuta ? Number(dati.versione) : NaN;
            const versioneValida = Number.isSafeInteger(versione) && versione >= 0;
            if (!cache || !versioneValida || versione !== cache.versione) {
                disegna(dati.menu, dati.extra);
            }
            if (versioneValida) {
                salvaCacheMenu({ versione, menu: dati.menu, extra: dati.extra }, storage);
            }
            return dati;
        });
        return { cache, aggiornamento };
    }

    function creaGestoreSuggerimentiClienti() {
        const telefoniChiusi = new Set();
        return {
            chiudi(container, telefono) {
                telefoniChiusi.add(telefono);
                container.hidden = true;
                container.replaceChildren();
            },
            visibile(telefono, trovato) {
                return Boolean(trovato) && !telefoniChiusi.has(telefono);
            },
            reset() {
                telefoniChiusi.clear();
            }
        };
    }

    function etichettaOrdiniCliente(numero) {
        const totale = Number.isSafeInteger(numero) && numero >= 0 ? numero : 0;
        return `${totale} ${totale === 1 ? "ordine" : "ordini"}`;
    }

    function applicaClienteIndirizzo(cliente, campi, mostra) {
        campi.telefono.value = cliente.telefono;
        campi.indirizzo.value = cliente.indirizzo;
        mostra(cliente);
    }

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

    function isCoperto(prodotto) {
        return typeof prodotto?.nome === "string"
            && prodotto.nome.trim().toLocaleLowerCase("it-IT") === "coperto";
    }

    function calcolaCoperto(tipo, numeroPersone, prezzoUnitario) {
        const prezzo = Number(prezzoUnitario);
        const persone = Number(numeroPersone);
        if (tipo !== "tavolo" || !Number.isInteger(persone) || persone < 1 || prezzo <= 0 || !Number.isFinite(prezzo)) {
            return null;
        }
        return {
            persone,
            prezzoUnitario: prezzo,
            totale: Math.round((persone * prezzo + Number.EPSILON) * 100) / 100
        };
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

    function preparaRipetizione(ultimoOrdine, menu, extraMenu, postiDisponibili) {
        const disponibili = new Map((menu || []).map(prodotto => [prodotto.nome, prodotto]));
        const extraDisponibili = new Map((extraMenu || []).map(extra => [extra.nome, extra]));
        const righe = [];
        const nonDisponibili = new Set();
        let limiteRaggiunto = false;

        for (const voce of ultimoOrdine?.righe || []) {
            const prodotto = disponibili.get(voce.prodotto);
            const nomiExtra = Array.isArray(voce.extra) ? voce.extra : [];
            const extra = nomiExtra.map(nome => extraDisponibili.get(nome));
            const prodottoValido = prodotto
                && prodotto.disponibile !== false
                && prodotto.archiviato !== true
                && (!nomiExtra.length || prodotto.ammetteExtra === true)
                && extra.every(elemento => elemento && elemento.disponibile !== false && elemento.archiviato !== true);
            if (!prodottoValido) {
                nonDisponibili.add(voce.prodotto);
                continue;
            }

            const quantita = Number.isSafeInteger(voce.quantita) && voce.quantita > 0
                ? voce.quantita
                : 1;
            for (let indice = 0; indice < quantita; indice++) {
                if (righe.length >= postiDisponibili) {
                    limiteRaggiunto = true;
                    break;
                }
                righe.push({ prodotto, extra });
            }
        }
        return { righe, nonDisponibili: [...nonDisponibili], limiteRaggiunto };
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
            let prossimoAttivo = null;
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

    function impostaValoreControllo(controllo, valore, tipoEvento) {
        controllo.value = valore;
        controllo.dispatchEvent(new Event(tipoEvento, { bubbles: true }));
    }

    function datiObbligatoriMancanti(tipo, dati) {
        if (tipo === "tavolo") {
            const persone = Number(dati.numeroPersone);
            if (!String(dati.tavolo || "").trim()) return "tavolo";
            if (!Number.isInteger(persone) || persone < 1 || persone > 30) return "persone";
            return null;
        }
        if (tipo === "banco") return String(dati.cognome || "").trim() ? null : "cognome";
        if (tipo === "ritiro") {
            if (!String(dati.nome || "").trim()) return "nome";
            if (!String(dati.telefono || "").trim() || dati.telefonoValido === false) return "telefono";
            return null;
        }
        if (tipo === "consegna") {
            if (!String(dati.indirizzo || "").trim()) return "indirizzo";
            if (!String(dati.telefono || "").trim() || dati.telefonoValido === false) return "telefono";
            return null;
        }
        return "tipo";
    }

    function datiOrdineCompleti(tipo, dati) {
        return datiObbligatoriMancanti(tipo, dati) === null;
    }

    function riepilogoIntestazione(tipo, dati) {
        if (tipo === "tavolo") return `${dati.tavolo} · ${dati.numeroPersone} persone`;
        if (tipo === "banco") return `Banco · ${String(dati.cognome || "").trim()}`;
        if (tipo === "ritiro") {
            return ["Ritiro", String(dati.nome || "").trim(), String(dati.orario || "").trim()]
                .filter(Boolean)
                .join(" · ");
        }
        if (tipo === "consegna") {
            return ["Consegna", String(dati.indirizzo || "").trim(), String(dati.orario || "").trim()]
                .filter(Boolean)
                .join(" · ");
        }
        return "";
    }

    function anteprimaNota(testo, lunghezza = 40) {
        const nota = String(testo || "").replace(/\s+/g, " ").trim();
        return nota.length > lunghezza ? `${nota.slice(0, lunghezza)}…` : nota;
    }

    return {
        LIMITE_RIGHE_ORDINE,
        leggiCacheMenu,
        salvaCacheMenu,
        caricaMenuConCache,
        creaGestoreSuggerimentiClienti,
        etichettaOrdiniCliente,
        applicaClienteIndirizzo,
        normalizza,
        filtraProdotti,
        ammetteExtra,
        isCoperto,
        calcolaCoperto,
        creaRiga,
        aggiungiProdotti,
        preparaRipetizione,
        impostaRigaAttiva,
        rimuoviProdotto,
        toggleExtra,
        intestazioneExtra,
        creaStatoMoltiplicatore,
        premiTastoMoltiplicatore,
        quantitaDaApplicare,
        testoMoltiplicatore,
        aggiornaConteggioProdotti,
        controllaLimiteRighe,
        impostaValoreControllo,
        datiObbligatoriMancanti,
        datiOrdineCompleti,
        riepilogoIntestazione,
        anteprimaNota
    };
})();

if (typeof module !== "undefined" && module.exports) module.exports = prodottiUI;
if (typeof window !== "undefined") window.prodottiUI = prodottiUI;
