package it.pizzeria.gestionale.service;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MenuService {

    private final Map<String, ProdottoMenu> prodottiPerNome;

    public MenuService() {
        List<ProdottoMenu> prodotti = Arrays.asList(
                // pizze
                new ProdottoMenu("Margherita", "pizze", new BigDecimal("5.00"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "olio evo", "basilico")),
                new ProdottoMenu("Bufalina", "pizze", new BigDecimal("7.00"), Arrays.asList("Pomodoro San Marzano", "mozzarella di bufala", "olio evo", "basilico")),
                new ProdottoMenu("Margherita Provola e Pepe", "pizze", new BigDecimal("6.00"), Arrays.asList("Pomodoro San Marzano", "provola affumicata", "olio evo", "basilico")),
                new ProdottoMenu("Diavola", "pizze", new BigDecimal("6.00"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "spianata piccante", "olio evo", "basilico")),
                new ProdottoMenu("Diavola Gialla", "pizze", new BigDecimal("8.50"), Arrays.asList("Vellutata di pomodorini gialli", "spianata piccante", "mozzarella di bufala", "olio evo", "basilico")),
                new ProdottoMenu("Napoletana", "pizze", new BigDecimal("4.00"), Arrays.asList("Pomodoro San Marzano", "olio evo all'aglio", "origano di montagna", "basilico")),
                new ProdottoMenu("Marinara", "pizze", new BigDecimal("5.50"), Arrays.asList("Pomodoro San Marzano", "olio evo all'aglio", "alici di Cetara", "olive taggiasche", "capperi", "origano di montagna", "basilico")),
                new ProdottoMenu("Marinara Mia", "pizze", new BigDecimal("7.00"), Arrays.asList("Pomodoro San Marzano", "olio evo all'aglio", "origano di montagna", "pomodoro arrosto; all'uscita alici di Cetara", "olive nere taggiasche", "basilico")),
                new ProdottoMenu("Reginella", "pizze", new BigDecimal("8.50"), Arrays.asList("Mozzarella di bufala", "pomodoro arrosto", "olio evo", "origano", "basilico croccante")),
                new ProdottoMenu("Masaniello", "pizze", new BigDecimal("7.50"), Arrays.asList("Pomodoro San Marzano", "pomodorino datterino cotto", "provola affumicata", "pecorino romano", "olio evo", "basilico")),
                new ProdottoMenu("L'Allardata", "pizze", new BigDecimal("8.00"), Arrays.asList("Fior di latte", "vellutata di patate", "lardo di Colonnata; all'uscita pesto di basilico", "scaglie di Parmigiano Reggiano", "olio evo", "basilico")),
                new ProdottoMenu("Mamma Giulia", "pizze", new BigDecimal("7.00"), Arrays.asList("Pomodoro San Marzano", "pomodorino datterino cotto", "fior di latte; all'uscita ricotta", "olio evo", "basilico")),
                new ProdottoMenu("Sapori di Montagna", "pizze", new BigDecimal("9.00"), Arrays.asList("Vellutata di patate", "porcini a fette", "provola affumicata", "guanciale croccante", "olio evo", "basilico")),
                new ProdottoMenu("The Pumpkin", "pizze", new BigDecimal("9.00"), Arrays.asList("Fior di latte", "zucca", "provola affumicata", "pancetta arrotolata", "porcini a fette", "fonduta di gorgonzola", "olio evo", "basilico")),
                new ProdottoMenu("La Mortazza", "pizze", new BigDecimal("9.00"), Arrays.asList("Fior di latte; all'uscita mortadella", "ricotta a ciuffi", "crema di pistacchio", "granella di pistacchi", "olio evo", "basilico")),
                new ProdottoMenu("Nocina", "pizze", new BigDecimal("8.00"), Arrays.asList("Crema di noci", "fior di latte", "capocollo", "gherigli di noci", "olio evo", "basilico")),
                new ProdottoMenu("Carciofina", "pizze", new BigDecimal("8.50"), Arrays.asList("Fior di latte", "carciofi; all'uscita pancetta arrotolata")),
                new ProdottoMenu("Tonno e Cipolla 2.0", "pizze", new BigDecimal("9.00"), Arrays.asList("Vellutata di cipolla rossa di Tropea", "provola affumicata; all'uscita tonno a filetti", "polvere di olive nere", "olio evo")),
                new ProdottoMenu("I Pipi Russi", "pizze", new BigDecimal("8.00"), Arrays.asList("Provola affumicata", "vellutata di patate", "peperoni cruschi", "olio evo", "basilico")),
                new ProdottoMenu("Il Monaco", "pizze", new BigDecimal("8.50"), Arrays.asList("Fior di latte; all'uscita capocollo", "provolone del Monaco", "olio evo", "basilico")),
                new ProdottoMenu("Carbonpizza", "pizze", new BigDecimal("9.50"), Arrays.asList("Crema di carbonara", "guanciale", "parmigiano", "mozzarella", "rosso d'uovo", "scaglie")),
                new ProdottoMenu("Spinacina", "pizze", new BigDecimal("9.50"), Arrays.asList("Vellutata di spinaci", "pancetta pepata nostrana", "provola", "mozzarella", "Grana Padano")),
                new ProdottoMenu("Pizza Fiocco", "pizze", new BigDecimal("9.50"), Arrays.asList("Fior di latte", "crema di patate", "panna", "prosciutto cotto", "Grana Padano")),
                new ProdottoMenu("Crokko Pizza", "pizze", new BigDecimal("9.50"), Arrays.asList("Mozzarella", "prosciutto cotto", "crocché")),
                new ProdottoMenu("Mediterranea", "pizze", new BigDecimal("6.50"), Arrays.asList("Fior di latte; all'uscita pomodorino datterino", "rucola", "scaglie di Parmigiano Reggiano", "olio evo")),
                new ProdottoMenu("Ortolana", "pizze", new BigDecimal("7.50"), Arrays.asList("Fior di latte", "zucchine", "melanzane", "peperoni", "olio evo", "basilico")),
                new ProdottoMenu("Siciliana", "pizze", new BigDecimal("6.50"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "melanzane", "funghetti", "Parmigiano Reggiano", "olio evo", "basilico")),
                new ProdottoMenu("Montanara", "pizze", new BigDecimal("8.50"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "salame napoletano", "nduja calabra", "Parmigiano Reggiano grattugiato", "olio evo", "basilico")),
                new ProdottoMenu("Calabrese", "pizze", new BigDecimal("8.00"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "spianata piccante", "nduja calabra", "olio evo", "basilico")),
                new ProdottoMenu("Capricciosa", "pizze", new BigDecimal("7.00"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "prosciutto cotto", "salame napoletano", "funghi champignons", "olive taggiasche", "carciofini sott'olio", "olio evo", "basilico")),
                new ProdottoMenu("Tonno e Cipolla", "pizze", new BigDecimal("6.50"), Arrays.asList("Fior di latte", "tonno a pezzi", "cipolla di Tropea", "olio evo", "basilico")),
                new ProdottoMenu("Quattro Formaggi", "pizze", new BigDecimal("6.50"), Arrays.asList("Fior di latte", "gorgonzola DOP", "crema di bufala", "taleggio", "olio evo")),
                new ProdottoMenu("States", "pizze", new BigDecimal("7.00"), Arrays.asList("Fior di latte", "wurstel", "patatine fritte")),
                new ProdottoMenu("Broccoli e Salsiccia", "pizze", new BigDecimal("7.50"), Arrays.asList("Fior di latte", "broccoli", "salsiccia", "olio evo")),
                new ProdottoMenu("Scarurella", "pizze", new BigDecimal("7.50"), Arrays.asList("Fior di latte", "olive taggiasche", "pomodorino datterino giallo", "alici di Cetara", "capperi", "scarola cruda")),
                new ProdottoMenu("Porcina", "pizze", new BigDecimal("8.00"), Arrays.asList("Fior di latte", "patate lesse", "porcini a fette", "olio evo", "basilico")),
                new ProdottoMenu("Zio Raffaele", "pizze", new BigDecimal("7.00"), Arrays.asList("Pomodoro San Marzano", "fior di latte", "pancetta arrotolata", "origano", "Parmigiano Reggiano grattugiato", "olio evo all'aglio", "basilico")),
                new ProdottoMenu("La Fresca", "pizze", new BigDecimal("9.00"), Arrays.asList("Mozzarella di bufala", "pomodorino datterino; all'uscita rucola", "scaglie di Parmigiano Reggiano", "prosciutto di Parma")),
                new ProdottoMenu("Biancaneve", "pizze", new BigDecimal("6.50"), Arrays.asList("Fior di latte", "prosciutto cotto", "panna", "mais", "olio evo", "basilico")),
                new ProdottoMenu("Spugna", "pizze", new BigDecimal("7.00"), Arrays.asList("Provola affumicata", "pancetta arrotolata", "patatine fritte", "olio evo", "basilico")),
                new ProdottoMenu("Nerano", "pizze", new BigDecimal("9.50"), Arrays.asList("Mozzarella", "vellutata di zucchine", "pancetta pepata", "chips di zucchine", "provola", "scaglie di Provolone del Monaco")),
                new ProdottoMenu("Pizza senza glutine", "pizze", new BigDecimal("6.00")),
                new ProdottoMenu("Pizza bianca", "pizze", new BigDecimal("4.50")),
                new ProdottoMenu("Focaccia", "pizze", new BigDecimal("3.00")),
                new ProdottoMenu("Solo pomodoro", "pizze", new BigDecimal("3.50")),
                new ProdottoMenu("Focaccia pom. cotto e lardo", "pizze", new BigDecimal("5.50")),
                // ripieni
                new ProdottoMenu("Margherita (Ripieno)", "ripieni", new BigDecimal("7.00"), Arrays.asList("Fior di latte", "pomodoro San Marzano", "olio evo", "basilico")),
                new ProdottoMenu("Napoletano", "ripieni", new BigDecimal("8.00"), Arrays.asList("Fior di latte", "pomodoro San Marzano", "salame napoletano", "ricotta", "parmigiano reggiano grattugiato", "olio evo", "basilico")),
                new ProdottoMenu("Scarola", "ripieni", new BigDecimal("8.00"), Arrays.asList("Fior di latte", "scarola", "capperi", "olive taggiasche", "alici di Cetara")),
                new ProdottoMenu("Ai Funghi", "ripieni", new BigDecimal("8.00"), Arrays.asList("Fior di latte", "prosciutto cotto", "funghi champignons", "olio evo", "basilico")),
                // panuozzi
                new ProdottoMenu("All'Italiana", "panuozzi", new BigDecimal("9.50"), Arrays.asList("Mozzarella di bufala", "pomodorino datterino", "prosciutto crudo", "rucola", "scaglie di Parmigiano Reggiano")),
                new ProdottoMenu("Contadino", "panuozzi", new BigDecimal("9.00"), Arrays.asList("Mozzarella di bufala", "broccoli", "salsiccia")),
                new ProdottoMenu("Cristian", "panuozzi", new BigDecimal("9.00"), Arrays.asList("Fior di latte", "pancetta arrotolata", "rucola", "scaglie di Parmigiano Reggiano")),
                new ProdottoMenu("Montanaro", "panuozzi", new BigDecimal("9.00"), Arrays.asList("Fior di latte", "patate lesse", "porcini a fette", "salsiccia")),
                new ProdottoMenu("Luciano", "panuozzi", new BigDecimal("10.00"), Arrays.asList("Porchetta", "patate lesse", "cardoncelli saltati", "provola")),
                // fritti
                new ProdottoMenu("Crocché di Patate", "fritti", new BigDecimal("2.50")),
                new ProdottoMenu("Scazzuoppoli al Pomodoro", "fritti", new BigDecimal("8.00")),
                new ProdottoMenu("Patatine Piccole", "fritti", new BigDecimal("3.00")),
                new ProdottoMenu("Patatine Grandi", "fritti", new BigDecimal("4.50")),
                new ProdottoMenu("Frittatina di Pasta Classica", "fritti", new BigDecimal("2.50"), Arrays.asList("Bucatini", "salame napoletano", "piselli", "besciamella", "Parmigiano Reggiano grattugiato", "provola affumicata", "sale", "pepe")),
                new ProdottoMenu("Frittatina alla Carbonara", "fritti", new BigDecimal("2.50"), Arrays.asList("Bucatini", "besciamella", "uova", "pecorino romano", "guanciale croccante", "sale", "pepe")),
                // pizze fritte napoletane
                new ProdottoMenu("Classica", "pizze fritte", new BigDecimal("9.00")),
                new ProdottoMenu("Margherita (Fritta)", "pizze fritte", new BigDecimal("10.00")),
                new ProdottoMenu("Napoletana (Fritta)", "pizze fritte", new BigDecimal("9.00")),
                new ProdottoMenu("Ciccio", "pizze fritte", new BigDecimal("11.00"), Arrays.asList("Cacio", "pepe", "ricotta", "salame", "pancetta", "scaglie di parmigiano")),
                // pollo scuppettiato
                new ProdottoMenu("Classico con Patate", "pollo scuppettiato", new BigDecimal("14.50")),
                new ProdottoMenu("Cipolle e Patate", "pollo scuppettiato", new BigDecimal("15.50")),
                new ProdottoMenu("Provola, Porcini e Patate", "pollo scuppettiato", new BigDecimal("18.00")),
                new ProdottoMenu("Alla Cacciatora", "pollo scuppettiato", new BigDecimal("18.00")),
                // taglieri
                new ProdottoMenu("Antipasto Italiano", "taglieri", new BigDecimal("7.00")),
                new ProdottoMenu("Salumi", "taglieri", new BigDecimal("13.00"), Arrays.asList("Prosciutto crudo", "capocollo", "pancetta arrotolata pepata", "spianata piccante", "salsiccia secca dolce e piccante")),
                new ProdottoMenu("Formaggi", "taglieri", new BigDecimal("15.00"), Arrays.asList("Pecorino moliterno canestrato", "blu di bufala", "Provolone del Monaco", "Parmigiano Reggiano")),
                // primi
                new ProdottoMenu("Gnocchi Freschi alla Sorrentina", "primi", new BigDecimal("10.00")),
                new ProdottoMenu("Gnocchi Freschi con Provola e Porcini", "primi", new BigDecimal("10.00")),
                // secondi
                new ProdottoMenu("Salsiccia, Provola e Porcini", "secondi", new BigDecimal("10.00")),
                new ProdottoMenu("Salsiccia e Patatine", "secondi", new BigDecimal("9.00")),
                // bibite
                new ProdottoMenu("Acqua 0,5L", "bibite", new BigDecimal("1.50")),
                new ProdottoMenu("Acqua 1L", "bibite", new BigDecimal("3.00")),
                new ProdottoMenu("Coca Cola / Zero 33cl", "bibite", new BigDecimal("2.00")),
                new ProdottoMenu("Fanta 33cl", "bibite", new BigDecimal("2.00")),
                new ProdottoMenu("Nastro Azzurro 33cl", "bibite", new BigDecimal("2.50")),
                new ProdottoMenu("Nastro Azzurro 66cl", "bibite", new BigDecimal("3.50")),
                new ProdottoMenu("Ichnusa Non Filtrata 33cl", "bibite", new BigDecimal("3.50")),
                new ProdottoMenu("Heineken 33cl", "bibite", new BigDecimal("2.50")),
                new ProdottoMenu("Peroni 66cl", "bibite", new BigDecimal("3.50")),
                new ProdottoMenu("Tennent's 33cl", "bibite", new BigDecimal("4.00")),
                new ProdottoMenu("Amari", "bibite", new BigDecimal("3.00")),
                // vini
                new ProdottoMenu("Vino della Casa 0,5L", "vini", new BigDecimal("4.00")),
                new ProdottoMenu("Vino della Casa 1L", "vini", new BigDecimal("8.00")),
                // dolci
                new ProdottoMenu("Dolci del Giorno", "dolci", new BigDecimal("4.00")),
                new ProdottoMenu("Pizza con Nutella", "dolci", new BigDecimal("8.00")),
                new ProdottoMenu("Scazzuoppoli con Nutella", "dolci", new BigDecimal("8.00")),
                // coperto
                new ProdottoMenu("Coperto", "dolci", new BigDecimal("2.00"))
        );
        Map<String, ProdottoMenu> indice = new LinkedHashMap<String, ProdottoMenu>();
        for (ProdottoMenu prodotto : prodotti) {
            indice.put(prodotto.getNome(), prodotto);
        }
        prodottiPerNome = Collections.unmodifiableMap(indice);
    }


    public List<ProdottoMenu> trovaTutti() {
        return Arrays.asList(prodottiPerNome.values().toArray(new ProdottoMenu[0]));
    }

    public ProdottoMenu trovaPerNome(String nome) {
        ProdottoMenu prodotto = prodottiPerNome.get(nome);
        if (prodotto == null) {
            throw new IllegalArgumentException("Prodotto non presente nel menu: " + nome);
        }
        return prodotto;
    }
}