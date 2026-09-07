package it.pizzeria.gestionale.repository;

import it.pizzeria.gestionale.model.Ordine;

import java.util.List;

public interface OrdineRepository {

    Ordine salva(Ordine ordine);

    List<Ordine> trovaTutti();

    Ordine aggiorna(Ordine ordine);

    void elimina(long numero);

    default void svuota() { }

    void resetAutoIncrement();
}