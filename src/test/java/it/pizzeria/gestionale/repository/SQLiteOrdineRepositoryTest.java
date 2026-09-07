package it.pizzeria.gestionale.repository;

import it.pizzeria.gestionale.model.Ordine;
import it.pizzeria.gestionale.model.RigaOrdine;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class SQLiteOrdineRepositoryTest {

    @TempDir
    Path cartellaTemporanea;

    @Test
    void salvaERileggeUnOrdineConExtra() {
        String url = "jdbc:sqlite:" + cartellaTemporanea.resolve("ordini-test.db");
        SQLiteOrdineRepository repository = new SQLiteOrdineRepository(new DriverManagerDataSource(url));
        repository.inizializzaSchema();

        Ordine ordine = new Ordine(LocalDateTime.of(2026, 9, 4, 20, 30), "Tavolo 3", Arrays.asList(
                new RigaOrdine("Margherita", new BigDecimal("5.00"), Arrays.asList("Funghi", "Olive")),
                new RigaOrdine("Acqua", new BigDecimal("2.00"), Arrays.<String>asList())
        ));

        Ordine salvato = repository.salva(ordine);
        List<Ordine> trovati = repository.trovaTutti();

        assertNotNull(salvato.getNumero());
        assertEquals(1, trovati.size());
        assertEquals("Tavolo 3", trovati.get(0).getTavoloOCliente());
        assertEquals(2, trovati.get(0).getRighe().size());
        assertEquals(Arrays.asList("Funghi", "Olive"), trovati.get(0).getRighe().get(0).getExtra());
        assertEquals(new BigDecimal("9.00"), trovati.get(0).calcolaTotale());
    }

    @Test
    void aggiornaEdEliminaOrdine() {
        String url = "jdbc:sqlite:" + cartellaTemporanea.resolve("modifica-test.db");
        SQLiteOrdineRepository repository = new SQLiteOrdineRepository(new DriverManagerDataSource(url));
        repository.inizializzaSchema();
        Ordine salvato = repository.salva(new Ordine(LocalDateTime.now(), "Tavolo 4",
                Arrays.asList(new RigaOrdine("Marinara", new BigDecimal("4.50"), Arrays.<String>asList()))));

        Ordine aggiornato = new Ordine(salvato.getNumero(), salvato.getDataOra(), "Tavolo 4",
                Arrays.asList(new RigaOrdine("Diavola", new BigDecimal("7.00"), Arrays.asList("Olive"))));
        repository.aggiorna(aggiornato);

        Ordine riletto = repository.trovaTutti().get(0);
        assertEquals("Diavola", riletto.getRighe().get(0).getProdotto());
        assertEquals(new BigDecimal("8.00"), riletto.calcolaTotale());

        repository.elimina(salvato.getNumero());
        assertEquals(0, repository.trovaTutti().size());
    }
}