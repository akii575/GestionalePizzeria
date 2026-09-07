package it.pizzeria.gestionale.repository;

import it.pizzeria.gestionale.model.Ordine;
import it.pizzeria.gestionale.model.RigaOrdine;
import it.pizzeria.gestionale.service.ExtraMenu;
import org.springframework.stereotype.Repository;

import jakarta.annotation.PostConstruct;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Repository
public class SQLiteOrdineRepository implements OrdineRepository {

    private final DataSource dataSource;

    public SQLiteOrdineRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @PostConstruct
    public void inizializzaSchema() {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS ordini ("
                    + "numero INTEGER PRIMARY KEY AUTOINCREMENT, "
                    + "data_ora TEXT NOT NULL, tavolo_cliente TEXT NOT NULL, totale TEXT NOT NULL)");
            statement.execute("CREATE TABLE IF NOT EXISTS righe_ordine ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT, ordine_numero INTEGER NOT NULL, "
                    + "prodotto TEXT NOT NULL, prezzo_base TEXT NOT NULL, extra TEXT NOT NULL, "
                    + "FOREIGN KEY (ordine_numero) REFERENCES ordini(numero))");
            try {
                statement.execute("ALTER TABLE ordini ADD COLUMN note TEXT DEFAULT ''");
            } catch (SQLException e) {
                // Colonna gia' esiste, ignora l'errore
            }
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile inizializzare il database SQLite.", exception);
        }
    }

    @Override
    public Ordine salva(Ordine ordine) {
        String sqlOrdine = "INSERT INTO ordini(data_ora, tavolo_cliente, totale, note) VALUES (?, ?, ?, ?)";
        String sqlRiga = "INSERT INTO righe_ordine(ordine_numero, prodotto, prezzo_base, extra) VALUES (?, ?, ?, ?)";

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement inserisciOrdine = connection.prepareStatement(sqlOrdine, Statement.RETURN_GENERATED_KEYS);
                 PreparedStatement inserisciRiga = connection.prepareStatement(sqlRiga)) {
                inserisciOrdine.setString(1, ordine.getDataOra().toString());
                inserisciOrdine.setString(2, ordine.getTavoloOCliente());
                inserisciOrdine.setString(3, ordine.calcolaTotale().toPlainString());
                inserisciOrdine.setString(4, ordine.getNote());
                inserisciOrdine.executeUpdate();

                long numero = leggiChiaveGenerata(inserisciOrdine);
                for (RigaOrdine riga : ordine.getRighe()) {
                    inserisciRiga.setLong(1, numero);
                    inserisciRiga.setString(2, riga.getProdotto());
                    inserisciRiga.setString(3, riga.getPrezzoBase().toPlainString());
                    inserisciRiga.setString(4, String.join("|", riga.getExtra()));
                    inserisciRiga.addBatch();
                }
                inserisciRiga.executeBatch();
                connection.commit();
                return conNumero(numero, ordine);
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile salvare l'ordine nel database SQLite.", exception);
        }
    }

    @Override
    public List<Ordine> trovaTutti() {
        String sql = "SELECT o.numero, o.data_ora, o.tavolo_cliente, o.note, r.prodotto, r.prezzo_base, r.extra "
                + "FROM ordini o JOIN righe_ordine r ON r.ordine_numero = o.numero ORDER BY o.numero, r.id";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            Map<Long, OrdineInCostruzione> ordini = new LinkedHashMap<Long, OrdineInCostruzione>();
            while (resultSet.next()) {
                long numero = resultSet.getLong("numero");
                OrdineInCostruzione ordine = ordini.get(numero);
                if (ordine == null) {
                    ordine = new OrdineInCostruzione(numero, LocalDateTime.parse(resultSet.getString("data_ora")),
                            resultSet.getString("tavolo_cliente"), resultSet.getString("note"));
                    ordini.put(numero, ordine);
                }
                ordine.righe.add(new RigaOrdine(resultSet.getString("prodotto"),
                        new BigDecimal(resultSet.getString("prezzo_base")), extraDaTesto(resultSet.getString("extra")), prezziExtra()));
            }
            List<Ordine> risultato = new ArrayList<Ordine>();
            for (OrdineInCostruzione ordine : ordini.values()) {
                risultato.add(new Ordine(ordine.numero, ordine.dataOra, ordine.tavoloOCliente, ordine.righe, ordine.note));
            }
            return risultato;
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile leggere gli ordini dal database SQLite.", exception);
        }
    }

    @Override
    public Ordine aggiorna(Ordine ordine) {
        if (ordine.getNumero() == null) {
            throw new PersistenzaOrdineException("L'ordine da aggiornare non ha un numero.", null);
        }
        String update = "UPDATE ordini SET data_ora = ?, tavolo_cliente = ?, totale = ?, note = ? WHERE numero = ?";
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement aggiorna = connection.prepareStatement(update);
                 PreparedStatement eliminaRighe = connection.prepareStatement("DELETE FROM righe_ordine WHERE ordine_numero = ?");
                 PreparedStatement inserisciRiga = connection.prepareStatement("INSERT INTO righe_ordine(ordine_numero, prodotto, prezzo_base, extra) VALUES (?, ?, ?, ?)")) {
                aggiorna.setString(1, ordine.getDataOra().toString());
                aggiorna.setString(2, ordine.getTavoloOCliente());
                aggiorna.setString(3, ordine.calcolaTotale().toPlainString());
                aggiorna.setString(4, ordine.getNote());
                aggiorna.setLong(5, ordine.getNumero());
                if (aggiorna.executeUpdate() != 1) throw new SQLException("Ordine non trovato.");
                eliminaRighe.setLong(1, ordine.getNumero());
                eliminaRighe.executeUpdate();
                for (RigaOrdine riga : ordine.getRighe()) {
                    inserisciRiga.setLong(1, ordine.getNumero());
                    inserisciRiga.setString(2, riga.getProdotto());
                    inserisciRiga.setString(3, riga.getPrezzoBase().toPlainString());
                    inserisciRiga.setString(4, String.join("|", riga.getExtra()));
                    inserisciRiga.addBatch();
                }
                inserisciRiga.executeBatch();
                connection.commit();
                return ordine;
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile aggiornare l'ordine.", exception);
        }
    }

    @Override
    public void elimina(long numero) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement righe = connection.prepareStatement("DELETE FROM righe_ordine WHERE ordine_numero = ?");
                 PreparedStatement ordine = connection.prepareStatement("DELETE FROM ordini WHERE numero = ?")) {
                righe.setLong(1, numero);
                righe.executeUpdate();
                ordine.setLong(1, numero);
                if (ordine.executeUpdate() != 1) throw new SQLException("Ordine non trovato.");
                connection.commit();
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile eliminare l'ordine.", exception);
        }
    }

    @Override
    public void svuota() {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.executeUpdate("DELETE FROM righe_ordine");
            statement.executeUpdate("DELETE FROM ordini");
            connection.commit();
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile svuotare gli ordini.", exception);
        }
    }

    private long leggiChiaveGenerata(PreparedStatement statement) throws SQLException {
        try (ResultSet chiavi = statement.getGeneratedKeys()) {
            if (!chiavi.next()) {
                throw new SQLException("SQLite non ha restituito il numero dell'ordine.");
            }
            return chiavi.getLong(1);
        }
    }

    public void resetAutoIncrement() {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("DELETE FROM sqlite_sequence WHERE name = 'ordini'");
        } catch (SQLException exception) {
            throw new PersistenzaOrdineException("Impossibile resettare il contatore ordini.", exception);
        }
    }

    private List<String> extraDaTesto(String extra) {
        if (extra == null || extra.isEmpty()) {
            return Collections.emptyList();
        }
        return Arrays.asList(extra.split("\\|"));
    }

    private Map<String, BigDecimal> prezziExtra() {
        Map<String, BigDecimal> prezzi = new LinkedHashMap<String, BigDecimal>();
        for (ExtraMenu extra : ExtraMenu.catalogo()) prezzi.put(extra.getNome(), extra.getPrezzo());
        return prezzi;
    }

    private Ordine conNumero(long numero, Ordine ordine) {
        return new Ordine(numero, ordine.getDataOra(), ordine.getTavoloOCliente(), ordine.getRighe(), ordine.getNote());
    }

    private static class OrdineInCostruzione {
        private final long numero;
        private final LocalDateTime dataOra;
        private final String tavoloOCliente;
        private final String note;
        private final List<RigaOrdine> righe = new ArrayList<RigaOrdine>();

        private OrdineInCostruzione(long numero, LocalDateTime dataOra, String tavoloOCliente, String note) {
            this.numero = numero;
            this.dataOra = dataOra;
            this.tavoloOCliente = tavoloOCliente;
            this.note = note == null ? "" : note;
        }
    }
}