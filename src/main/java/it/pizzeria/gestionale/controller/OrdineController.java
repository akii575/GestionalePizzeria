package it.pizzeria.gestionale.controller;

import it.pizzeria.gestionale.service.MenuService;
import it.pizzeria.gestionale.service.OrdineService;
import it.pizzeria.gestionale.service.ProdottoMenu;
import it.pizzeria.gestionale.service.ExtraMenu;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class OrdineController {

    private final OrdineService ordineService;
    private final MenuService menuService;

    public OrdineController(OrdineService ordineService, MenuService menuService) {
        this.ordineService = ordineService;
        this.menuService = menuService;
    }

    @GetMapping("/menu")
    public List<ProdottoMenu> menu() {
        return menuService.trovaTutti();
    }

    @GetMapping("/extra")
    public List<ExtraMenu> extra() {
        return ordineService.extraDisponibili();
    }

    @GetMapping("/ordini")
    public List<OrdineResponse> trovaTutti() {
        return ordineService.trovaTutti();
    }

    @PostMapping("/ordini")
    @ResponseStatus(HttpStatus.CREATED)
    public OrdineResponse crea(@RequestBody NuovoOrdineRequest richiesta) {
        return ordineService.crea(richiesta);
    }

    @PutMapping("/ordini/{numero}")
    public OrdineResponse aggiorna(@PathVariable long numero, @RequestBody NuovoOrdineRequest richiesta) {
        return ordineService.aggiorna(numero, richiesta);
    }

    @DeleteMapping("/ordini/{numero}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void elimina(@PathVariable long numero) {
        ordineService.elimina(numero);
    }

    @PostMapping("/reset-numeri")
    @ResponseStatus(HttpStatus.OK)
    public void resetNumeriOrdini() {
        ordineService.resetNumeriOrdini();
    }
}