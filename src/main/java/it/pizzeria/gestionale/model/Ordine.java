package it.pizzeria.gestionale.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Ordine {

    private final Long numero;
    private final LocalDateTime dataOra;
    private final String tavoloOCliente;
    private final List<RigaOrdine> righe;
    private final String note;

    public Ordine(Long numero, LocalDateTime dataOra, String tavoloOCliente, List<RigaOrdine> righe, String note) {
        if (dataOra == null) {
            throw new IllegalArgumentException("Data e ora sono obbligatorie.");
        }
        if (tavoloOCliente == null || tavoloOCliente.trim().isEmpty()) {
            throw new IllegalArgumentException("Tavolo o cliente e' obbligatorio.");
        }
        if (righe == null || righe.isEmpty()) {
            throw new IllegalArgumentException("L'ordine deve contenere almeno un prodotto.");
        }
        this.numero = numero;
        this.dataOra = dataOra;
        this.tavoloOCliente = tavoloOCliente;
        this.righe = Collections.unmodifiableList(new ArrayList<RigaOrdine>(righe));
        this.note = note == null ? "" : note;
    }

    public Ordine(LocalDateTime dataOra, String tavoloOCliente, List<RigaOrdine> righe, String note) {
        this(null, dataOra, tavoloOCliente, righe, note);
    }

    public Ordine(LocalDateTime dataOra, String tavoloOCliente, List<RigaOrdine> righe) {
        this(null, dataOra, tavoloOCliente, righe, "");
    }

    public Ordine(Long numero, LocalDateTime dataOra, String tavoloOCliente, List<RigaOrdine> righe) {
        this(numero, dataOra, tavoloOCliente, righe, "");
    }

    public Long getNumero() {
        return numero;
    }

    public LocalDateTime getDataOra() {
        return dataOra;
    }

    public String getTavoloOCliente() {
        return tavoloOCliente;
    }

    public List<RigaOrdine> getRighe() {
        return righe;
    }

    public String getNote() {
        return note;
    }

    public BigDecimal calcolaTotale() {
        BigDecimal totale = BigDecimal.ZERO;
        for (RigaOrdine riga : righe) {
            totale = totale.add(riga.calcolaTotale());
        }
        return totale;
    }
}