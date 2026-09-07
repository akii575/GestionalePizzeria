package it.pizzeria.gestionale.repository;

public class PersistenzaOrdineException extends RuntimeException {

    public PersistenzaOrdineException(String message, Throwable cause) {
        super(message, cause);
    }
}