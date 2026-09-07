package it.pizzeria.gestionale.service;

import it.pizzeria.gestionale.controller.NuovoOrdineRequest;
import it.pizzeria.gestionale.controller.OrdineResponse;
import it.pizzeria.gestionale.model.Ordine;
import it.pizzeria.gestionale.model.RigaOrdine;
import it.pizzeria.gestionale.repository.OrdineRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;

@Service
public class OrdineService {

    private final Map<String, ExtraMenu> extraPerNome = new LinkedHashMap<String, ExtraMenu>();
    private final Map<String, java.math.BigDecimal> prezziExtra = new LinkedHashMap<String, java.math.BigDecimal>();
    private static final String CATEGORIA_SENZA_EXTRA = "bevande";

    private final OrdineRepository ordineRepository;
    private final MenuService menuService;
    private final OrdineStampaService ordineStampaService;

    public OrdineService(OrdineRepository ordineRepository, MenuService menuService,
                          OrdineStampaService ordineStampaService) {
        this.ordineRepository = ordineRepository;
        this.menuService = menuService;
        this.ordineStampaService = ordineStampaService;
        for (ExtraMenu extra : ExtraMenu.catalogo()) {
            extraPerNome.put(extra.getNome(), extra);
            prezziExtra.put(extra.getNome(), extra.getPrezzo());
        }
    }

    public OrdineResponse crea(NuovoOrdineRequest richiesta) {
        List<RigaOrdine> righe = creaRighe(richiesta);
        Ordine ordine = new Ordine(LocalDateTime.now(), richiesta.getTavoloOCliente(), righe, richiesta.getNote());
        Ordine salvato = ordineRepository.salva(ordine);
        OrdineStampaService.RisultatoStampa stampa = ordineStampaService.stampa(salvato);
        return OrdineResponse.da(salvato, stampa);
    }

    public List<OrdineResponse> trovaTutti() {
        List<OrdineResponse> risultati = new ArrayList<OrdineResponse>();
        for (Ordine ordine : ordineRepository.trovaTutti()) {
            risultati.add(OrdineResponse.da(ordine, null));
        }
        return risultati;
    }

    public OrdineResponse aggiorna(long numero, NuovoOrdineRequest richiesta) {
        List<RigaOrdine> righe = creaRighe(richiesta);
        Ordine esistente = null;
        for (Ordine ordine : ordineRepository.trovaTutti()) {
            if (ordine.getNumero() != null && ordine.getNumero() == numero) {
                esistente = ordine;
                break;
            }
        }
        if (esistente == null) throw new IllegalArgumentException("Ordine non trovato: " + numero);
        Ordine aggiornato = new Ordine(numero, esistente.getDataOra(), richiesta.getTavoloOCliente(), righe, richiesta.getNote());
        return OrdineResponse.da(ordineRepository.aggiorna(aggiornato), null);
    }

    public void elimina(long numero) {
        ordineRepository.elimina(numero);
    }

    public void resetNumeriOrdini() {
        ordineRepository.svuota();
        ordineRepository.resetAutoIncrement();
    }

    private List<RigaOrdine> creaRighe(NuovoOrdineRequest richiesta) {
        if (richiesta == null) {
            throw new IllegalArgumentException("La richiesta dell'ordine e' obbligatoria.");
        }
        if (richiesta.getTavoloOCliente() == null || richiesta.getTavoloOCliente().trim().isEmpty()) {
            throw new IllegalArgumentException("Tavolo o cliente e' obbligatorio.");
        }
        if (richiesta.getRighe() == null || richiesta.getRighe().isEmpty()) {
            throw new IllegalArgumentException("Seleziona almeno un prodotto.");
        }
        List<RigaOrdine> righe = new ArrayList<RigaOrdine>();
        for (NuovoOrdineRequest.RigaRequest riga : richiesta.getRighe()) {
            if (riga == null) {
                throw new IllegalArgumentException("Una riga dell'ordine non e' valida.");
            }
            List<String> extra = normalizzaExtra(riga.getExtra());
            ProdottoMenu prodotto = menuService.trovaPerNome(riga.getProdotto());
            if (!extra.isEmpty() && CATEGORIA_SENZA_EXTRA.equals(prodotto.getCategoria())) {
                throw new IllegalArgumentException("Le bevande non possono avere extra.");
            }
            righe.add(new RigaOrdine(prodotto.getNome(), prodotto.getPrezzo(), extra, prezziExtra));
        }
        return righe;
    }

    private List<String> normalizzaExtra(List<?> riferimenti) {
        if (riferimenti == null) return Collections.emptyList();
        List<String> extra = new ArrayList<String>();
        for (Object riferimento : riferimenti) {
            String nome = riferimento instanceof String ? (String) riferimento : nomeDaRiferimento(riferimento);
            if (!extraPerNome.containsKey(nome)) throw new IllegalArgumentException("Extra non ammesso: " + nome);
            extra.add(nome);
        }
        return extra;
    }

    @SuppressWarnings("unchecked")
    private String nomeDaRiferimento(Object riferimento) {
        if (riferimento instanceof Map) {
            Object nome = ((Map<String, Object>) riferimento).get("nome");
            return nome == null ? "" : nome.toString();
        }
        return "";
    }

    public List<ExtraMenu> extraDisponibili() {
        return ExtraMenu.catalogo();
    }

    public ExtraMenu extraPerNome(String nome) {
        return extraPerNome.get(nome);
    }
}