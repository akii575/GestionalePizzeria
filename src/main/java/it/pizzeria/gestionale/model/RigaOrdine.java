package it.pizzeria.gestionale.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RigaOrdine {

    private static final BigDecimal PREZZO_EXTRA = new BigDecimal("1.00");

    private final String prodotto;
    private final BigDecimal prezzoBase;
    private final List<String> extra;
    private Map<String, BigDecimal> prezziExtra;

    public RigaOrdine(String prodotto, BigDecimal prezzoBase, List<String> extra) {
        if (prodotto == null || prodotto.trim().isEmpty()) {
            throw new IllegalArgumentException("Il nome del prodotto e' obbligatorio.");
        }
        if (prezzoBase == null || prezzoBase.signum() < 0) {
            throw new IllegalArgumentException("Il prezzo base non e' valido.");
        }
        this.prodotto = prodotto;
        this.prezzoBase = prezzoBase;
        this.extra = Collections.unmodifiableList(new ArrayList<String>(extra == null
                ? Collections.<String>emptyList() : extra));
        this.prezziExtra = Collections.emptyMap();
    }

    public RigaOrdine(String prodotto, BigDecimal prezzoBase, List<String> extra, Map<String, BigDecimal> prezziExtra) {
        this(prodotto, prezzoBase, extra);
        this.prezziExtra = Collections.unmodifiableMap(new HashMap<String, BigDecimal>(prezziExtra == null
                ? Collections.<String, BigDecimal>emptyMap() : prezziExtra));
    }

    public String getProdotto() {
        return prodotto;
    }

    public BigDecimal getPrezzoBase() {
        return prezzoBase;
    }

    public List<String> getExtra() {
        return extra;
    }

    public BigDecimal calcolaTotale() {
        BigDecimal totaleExtra = BigDecimal.ZERO;
        for (String nome : extra) totaleExtra = totaleExtra.add(prezziExtra.containsKey(nome) ? prezziExtra.get(nome) : PREZZO_EXTRA);
        return prezzoBase.add(totaleExtra);
    }

    public BigDecimal prezzoExtra(String nome) {
        return prezziExtra.containsKey(nome) ? prezziExtra.get(nome) : PREZZO_EXTRA;
    }
}