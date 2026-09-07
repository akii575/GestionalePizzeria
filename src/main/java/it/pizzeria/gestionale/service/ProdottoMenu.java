package it.pizzeria.gestionale.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class ProdottoMenu {

    private final String nome;
    private final String categoria;
    private final BigDecimal prezzo;
    private final List<String> ingredienti;

    public ProdottoMenu(String nome, String categoria, BigDecimal prezzo) {
        this(nome, categoria, prezzo, Collections.<String>emptyList());
    }

    public ProdottoMenu(String nome, String categoria, BigDecimal prezzo, List<String> ingredienti) {
        this.nome = nome;
        this.categoria = categoria;
        this.prezzo = prezzo;
        this.ingredienti = Collections.unmodifiableList(new ArrayList<String>(ingredienti == null
                ? Collections.<String>emptyList() : ingredienti));
    }

    public String getNome() {
        return nome;
    }

    public String getCategoria() {
        return categoria;
    }

    public BigDecimal getPrezzo() {
        return prezzo;
    }

    public List<String> getIngredienti() {
        return ingredienti;
    }
}