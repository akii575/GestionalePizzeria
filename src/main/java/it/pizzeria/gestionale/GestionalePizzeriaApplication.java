package it.pizzeria.gestionale;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

@SpringBootApplication
public class GestionalePizzeriaApplication {

    public static void main(String[] args) {
        try {
            Files.createDirectories(Paths.get("data"));
        } catch (IOException exception) {
            throw new IllegalStateException("Impossibile creare la cartella del database locale.", exception);
        }
        SpringApplication.run(GestionalePizzeriaApplication.class, args);
    }
}