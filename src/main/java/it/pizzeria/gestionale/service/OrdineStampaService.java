package it.pizzeria.gestionale.service;

import it.pizzeria.gestionale.model.Ordine;
import it.pizzeria.gestionale.model.RigaOrdine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.print.Doc;
import javax.print.DocFlavor;
import javax.print.DocPrintJob;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;
import javax.print.SimpleDoc;
import javax.print.attribute.HashPrintRequestAttributeSet;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;

@Service
public class OrdineStampaService {

    private final String nomeStampante;

    public OrdineStampaService(@Value("${stampa.nome:}") String nomeStampante) {
        this.nomeStampante = nomeStampante == null ? "" : nomeStampante.trim();
    }

    public RisultatoStampa stampa(Ordine ordine) {
        try {
            PrintService stampante = trovaStampante();
            DocPrintJob lavoro = stampante.createPrintJob();
            Doc documento = new SimpleDoc(creaTestoComanda(ordine), DocFlavor.STRING.TEXT_PLAIN, null);
            lavoro.print(documento, new HashPrintRequestAttributeSet());
            return RisultatoStampa.completata();
        } catch (Exception exception) {
            return RisultatoStampa.nonCompletata("Comanda salvata, ma stampa non riuscita: " + exception.getMessage());
        }
    }

    private PrintService trovaStampante() {
        if (nomeStampante.isEmpty()) {
            PrintService predefinita = PrintServiceLookup.lookupDefaultPrintService();
            if (predefinita == null) {
                throw new IllegalStateException("Nessuna stampante di sistema disponibile.");
            }
            return predefinita;
        }
        for (PrintService stampante : PrintServiceLookup.lookupPrintServices(null, null)) {
            if (nomeStampante.equalsIgnoreCase(stampante.getName())) {
                return stampante;
            }
        }
        throw new IllegalStateException("Stampante non trovata: " + nomeStampante);
    }

    private String creaTestoComanda(Ordine ordine) {
        StringBuilder testo = new StringBuilder();
        testo.append("PIZZERIA\n");
        testo.append("COMANDA #").append(ordine.getNumero()).append("\n");
        testo.append(ordine.getDataOra().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))).append("\n");
        testo.append(ordine.getTavoloOCliente()).append("\n");
        testo.append("------------------------------\n");
        for (RigaOrdine riga : ordine.getRighe()) {
            testo.append(riga.getProdotto());
            if (!riga.getExtra().isEmpty()) {
                testo.append(" + ").append(String.join(", ", riga.getExtra()));
            }
            testo.append("\n");
        }
        testo.append("------------------------------\n");
        testo.append("TOTALE: EUR ")
                .append(ordine.calcolaTotale().setScale(2, RoundingMode.HALF_UP).toPlainString())
                .append("\n\n\n");
        return testo.toString();
    }

    public static class RisultatoStampa {
        private final boolean completata;
        private final String messaggio;

        private RisultatoStampa(boolean completata, String messaggio) {
            this.completata = completata;
            this.messaggio = messaggio;
        }

        public static RisultatoStampa completata() {
            return new RisultatoStampa(true, "Comanda inviata alla stampante.");
        }

        public static RisultatoStampa nonCompletata(String messaggio) {
            return new RisultatoStampa(false, messaggio);
        }

        public boolean isCompletata() {
            return completata;
        }

        public String getMessaggio() {
            return messaggio;
        }
    }
}