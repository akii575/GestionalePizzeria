const prodottiUI = (() => {
    const CATEGORIE_CON_EXTRA = ["pizze", "fritti", "panuozzi", "ripieni", "secondi", "pizze fritte"];

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

    function ammetteExtra(categoria) {
        return CATEGORIE_CON_EXTRA.includes(categoria);
    }

    // Crea la riga del conto per un prodotto. Gli extra in attesa ("per il prossimo piatto")
    // vengono consumati solo se la categoria li ammette; altrimenti restano per il piatto successivo.
    function creaRiga(prodotto, extraInAttesa) {
        const conExtra = ammetteExtra(prodotto.categoria);
        return {
            riga: {
                prodotto: prodotto.nome,
                prezzo: prodotto.prezzo,
                categoria: prodotto.categoria,
                ingredienti: prodotto.ingredienti || [],
                extra: conExtra ? extraInAttesa || [] : []
            },
            extraRimanenti: conExtra ? [] : extraInAttesa || []
        };
    }

    return { CATEGORIE_CON_EXTRA, normalizza, filtraProdotti, ammetteExtra, creaRiga };
})();

if (typeof module !== "undefined" && module.exports) module.exports = prodottiUI;
if (typeof window !== "undefined") window.prodottiUI = prodottiUI;
