package it.pizzeria.gestionale.service;

import it.pizzeria.gestionale.controller.NuovoOrdineRequest;
import it.pizzeria.gestionale.controller.OrdineResponse;
import it.pizzeria.gestionale.model.Ordine;
import it.pizzeria.gestionale.repository.OrdineRepository;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OrdineServiceTest {

    @Test
    void rifiutaRichiestaNullaConErroreDiValidazione() {
        OrdineService service = new OrdineService(new RepositoryInMemoria(), new MenuService(), new OrdineStampaService("stampante-inesistente"));

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class, () -> service.crea(null));
    }

    @Test
    void usaIlPrezzoDelCatalogoESalvaPrimaDiStampare() {
        RepositoryInMemoria repository = new RepositoryInMemoria();
        OrdineService service = new OrdineService(repository, new MenuService(), new OrdineStampaService("stampante-inesistente"));
        NuovoOrdineRequest richiesta = new NuovoOrdineRequest();
        richiesta.setTavoloOCliente("Tavolo 2");
        richiesta.setNote("Senza pepe");
        NuovoOrdineRequest.RigaRequest riga = new NuovoOrdineRequest.RigaRequest();
        riga.setProdotto("Diavola");
        riga.setExtra(Arrays.asList("Bocconcino"));
        richiesta.setRighe(Arrays.asList(riga));

        OrdineResponse risposta = service.crea(richiesta);

        assertEquals("8.00", risposta.getTotale().toPlainString());
        assertEquals(1, repository.ordini.size());
        assertEquals(false, risposta.getStampaCompletata());
    }

    private static class RepositoryInMemoria implements OrdineRepository {
        private final List<Ordine> ordini = new ArrayList<Ordine>();
        public Ordine salva(Ordine ordine) { Ordine salvato = new Ordine((long) ordini.size() + 1, ordine.getDataOra(), ordine.getTavoloOCliente(), ordine.getRighe(), ordine.getNote()); ordini.add(salvato); return salvato; }
        public List<Ordine> trovaTutti() { return ordini; }
        public Ordine aggiorna(Ordine ordine) { ordini.set((int) (ordine.getNumero() - 1), ordine); return ordine; }
        public void elimina(long numero) { ordini.remove((int) (numero - 1)); }
        public void resetAutoIncrement() { }
    }
}