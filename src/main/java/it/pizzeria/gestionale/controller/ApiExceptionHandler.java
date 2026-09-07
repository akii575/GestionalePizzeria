package it.pizzeria.gestionale.controller;

import it.pizzeria.gestionale.repository.PersistenzaOrdineException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Collections;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> richiestaNonValida(IllegalArgumentException exception) {
        return risposta(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    @ExceptionHandler(PersistenzaOrdineException.class)
    public ResponseEntity<Map<String, String>> erroreDatabase(PersistenzaOrdineException exception) {
        return risposta(HttpStatus.INTERNAL_SERVER_ERROR, "Impossibile salvare l'ordine.");
    }

    private ResponseEntity<Map<String, String>> risposta(HttpStatus stato, String messaggio) {
        return ResponseEntity.status(stato).body(Collections.singletonMap("errore", messaggio));
    }
}