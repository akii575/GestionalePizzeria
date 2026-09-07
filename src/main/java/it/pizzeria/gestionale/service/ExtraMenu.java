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
                extra("Fior di latte", "1.00"), extra("Mozzarella di bufala", "2.00"), extra("Provola affumicata", "1.50"),
                extra("Provolone del Monaco", "2.00"), extra("Parmigiano Reggiano", "1.50"), extra("Pecorino romano", "1.50"),
                extra("Gorgonzola DOP", "1.50"), extra("Taleggio", "1.50"), extra("Grana Padano", "1.50"), extra("Ricotta", "1.50"),
                extra("Crema di bufala", "2.00"), extra("Fonduta di gorgonzola", "2.00"), extra("Prosciutto cotto", "1.50"),
                extra("Prosciutto crudo di Parma", "2.50"), extra("Salame napoletano", "1.50"), extra("Spianata piccante", "1.50"),
                extra("Nduja calabra", "1.50"), extra("Pancetta arrotolata/pepata", "1.50"), extra("Guanciale", "1.50"),
                extra("Capocollo", "1.50"), extra("Mortadella", "1.50"), extra("Salsiccia", "1.50"), extra("Wurstel", "1.00"),
                extra("Porchetta", "2.00"), extra("Alici di Cetara", "2.00"), extra("Tonno", "1.50"), extra("Melanzane", "1.00"),
                extra("Zucchine", "1.00"), extra("Peperoni", "1.00"), extra("Peperoni cruschi", "1.50"), extra("Broccoli", "1.00"),
                extra("Carciofi", "1.50"), extra("Olive taggiasche", "1.00"), extra("Olive nere", "1.00"), extra("Capperi", "1.00"),
                extra("Scarola", "1.00"), extra("Cipolla di Tropea", "1.00"), extra("Patate lesse", "1.00"), extra("Patatine fritte", "2.00"),
                extra("Vellutata di patate", "1.50"), extra("Porcini freschi", "2.00"), extra("Funghi champignons", "1.50"), extra("Vellutata di zucca", "1.50"),
                extra("Vellutata di spinaci", "1.50"), extra("Rucola", "1.00"), extra("Mais", "1.00"), extra("Pomodorino datterino giallo", "1.00"),
                extra("Pomodoro arrosto", "1.00"), extra("Crema di carbonara", "2.00"), extra("Crema/gherigli di noci", "2.00"),
                extra("Crema/granella di pistacchi", "2.50"), extra("Lardo di Colonnata", "2.00"), extra("Crocché di patate", "1.50"),
                extra("Panna", "1.00"), extra("Rosso d'uovo", "1.00")
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