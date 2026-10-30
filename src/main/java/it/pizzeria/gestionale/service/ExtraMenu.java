package it.pizzeria.gestionale.service;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class ExtraMenu {

    private final String id;
    private final String nome;
    private final BigDecimal prezzo;
    private final String categoria;

    public ExtraMenu(String id, String nome, BigDecimal prezzo) {
        this(id, nome, prezzo, "extra");
    }

    public ExtraMenu(String id, String nome, BigDecimal prezzo, String categoria) {
        this.id = id;
        this.nome = nome;
        this.prezzo = prezzo;
        this.categoria = categoria;
    }

    public String getId() { return id; }
    public String getNome() { return nome; }
    public BigDecimal getPrezzo() { return prezzo; }
    public String getCategoria() { return categoria; }

    public static List<ExtraMenu> catalogo() {
        List<ExtraMenu> catalogo = new ArrayList<ExtraMenu>(Arrays.asList(
                extra("pom. Cotto", "2.00"), extra("Bocconcino", "2.00"), extra("Pepe", "1.00"),
                extra("Pancetta", "2.00"), extra("Origano", "1.00"), extra("pat less", "2.00"),
                extra("Crocche", "2.50"), extra("Patatine", "2.00"), extra("Rucola", "1.00"),
                extra("senza latt", "2.50"), extra("Olive", "1.50"), extra("Champignon", "1.50"),
                extra("Nduja", "1.50"), extra("Zucchine", "2.00"), extra("Provola", "2.00"),
                extra("cipolla", "1.50"), extra("Mais", "1.00"), extra("Gorgonzola", "1.50"),
                extra("Crudo", "2.50"), extra("Scarola", "1.50"), extra("Porcini", "2.00"),
                extra("Melanzane", "2.00"), extra("Cotto", "2.00"), extra("Salame", "2.00"),
                extra("Spianata", "2.00"), extra("Salsiccia", "2.00"), extra("Ricotta", "1.00"),
                extra("Carciofino", "1.50"), extra("pom. Giallo", "1.50"), extra("Porchetta", "2.00"),
                extra("Pecorino", "1.00"), extra("Lardo", "1.50"), extra("crema noci", "1.50"),
                extra("Capicollo", "1.50"), extra("vell. Patate", "1.50"), extra("Zucca", "1.50"),
                extra("Mortadella", "2.00"), extra("Wurstel", "1.00"), extra("Panna", "1.00"),
                extra("Pep. Crusco", "1.50"), extra("noci", "1.00"), extra("tonno", "2.00"),
                extra("prov monaco", "2.00"), extra("Bufala", "2.00"), extra("Broccoli", "2.00"),
                extra("alici", "2.00"), extra("pom datt", "1.50"), extra("capperi", "1.00"),
                extra("Scaglie", "2.00"), extra("Ruota di carro", "1.00"), extra("Peperoni", "1.50")
        ));
        Collections.sort(catalogo, new Comparator<ExtraMenu>() {
            @Override
            public int compare(ExtraMenu primo, ExtraMenu secondo) {
                return primo.getNome().compareToIgnoreCase(secondo.getNome());
            }
        });
        return Collections.unmodifiableList(catalogo);
    }

    private static ExtraMenu extra(String nome, String prezzo) {
        return new ExtraMenu(nome.toLowerCase().replace(" ", "-").replace("/", "-"), nome, new BigDecimal(prezzo));
    }
}