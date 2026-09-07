package it.pizzeria.gestionale.controller;

import it.pizzeria.gestionale.model.Ordine;
import it.pizzeria.gestionale.model.RigaOrdine;
import it.pizzeria.gestionale.service.OrdineStampaService;
import it.pizzeria.gestionale.service.ExtraMenu;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class OrdineResponse {

    private final Long numero;
    private final LocalDateTime dataOra;
    private final String tavoloOCliente;
    private final List<RigaResponse> righe;
    private final BigDecimal totale;
    private final Boolean stampaCompletata;
    private final String messaggioStampa;
    private final String note;

    private OrdineResponse(Ordine ordine, OrdineStampaService.RisultatoStampa stampa) {
        numero = ordine.getNumero();
        dataOra = ordine.getDataOra();
        tavoloOCliente = ordine.getTavoloOCliente();
        righe = new ArrayList<RigaResponse>();
        for (RigaOrdine riga : ordine.getRighe()) {
            righe.add(new RigaResponse(riga));
        }
        totale = ordine.calcolaTotale();
        stampaCompletata = stampa == null ? null : stampa.isCompletata();
        messaggioStampa = stampa == null ? null : stampa.getMessaggio();
        note = ordine.getNote();
    }

    public static OrdineResponse da(Ordine ordine, OrdineStampaService.RisultatoStampa stampa) {
        return new OrdineResponse(ordine, stampa);
    }

    public Long getNumero() { return numero; }
    public LocalDateTime getDataOra() { return dataOra; }
    public String getTavoloOCliente() { return tavoloOCliente; }
    public List<RigaResponse> getRighe() { return righe; }
    public BigDecimal getTotale() { return totale; }
    public Boolean getStampaCompletata() { return stampaCompletata; }
    public String getMessaggioStampa() { return messaggioStampa; }
    public String getNote() { return note; }

    public static class RigaResponse {
        private final String prodotto;
        private final BigDecimal prezzoBase;
        private final List<ExtraMenu> extra;
        private final BigDecimal totale;

        private RigaResponse(RigaOrdine riga) {
            prodotto = riga.getProdotto();
            prezzoBase = riga.getPrezzoBase();
            extra = new ArrayList<ExtraMenu>();
            for (String nome : riga.getExtra()) {
                extra.add(new ExtraMenu(nome, nome, riga.prezzoExtra(nome)));
            }
            totale = riga.calcolaTotale();
        }

        public String getProdotto() { return prodotto; }
        public BigDecimal getPrezzoBase() { return prezzoBase; }
        public List<ExtraMenu> getExtra() { return extra; }
        public BigDecimal getTotale() { return totale; }
    }
}