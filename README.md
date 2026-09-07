# Gestionale Pizzeria

Applicazione locale per raccogliere, salvare e stampare ordini dalla rete Wi-Fi della pizzeria.

## Struttura

- `src/main/java/it/pizzeria/gestionale/model`: dati di un ordine e delle sue righe.
- `src/main/java/it/pizzeria/gestionale/repository`: schema SQLite e persistenza JDBC.
- `src/main/resources/application.properties`: database locale in `data/pizzeria.db`.
- `src/main/java/it/pizzeria/gestionale/service`: catalogo, invio ordine e stampa tramite `javax.print`.
- `src/main/java/it/pizzeria/gestionale/controller`: endpoint REST `GET /api/menu`, `GET /api/ordini` e `POST /api/ordini`.
- `src/main/resources/static/ordini.html`: inserimento comande da telefono, tablet o PC (solo tavoli, senza prezzi).
- `src/main/resources/static/gestionale.html`: gestionale read-only per banco/cucina, con filtri, dettagli e totali.
- `src/main/resources/static/modifica.html`: modifica completa di un ordine gia' salvato.
- `src/main/resources/static/index.html`: home unica del gestionale.
- `src/test/java`: test SQLite e del flusso applicativo.

## Pagine e API

- Inserimento ordine: `http://localhost:8080/ordini.html`
- Gestionale ordini: `http://localhost:8080/gestionale.html`
- Menu: `GET /api/menu`
- Ordini salvati: `GET /api/ordini`
- Nuovo ordine: `POST /api/ordini`
- Modifica ordine: `PUT /api/ordini/{numero}`
- Elimina ordine: `DELETE /api/ordini/{numero}`

Il gestionale legge gli ordini gia' salvati e mostra numero, data, tavolo/cliente,
prodotti, extra, prezzi delle righe e totale: i prezzi sono visibili solo qui, mai
nella pagina di inserimento comande. Permette di aprire la modifica completa
di un ordine e di eliminarlo con conferma.

## Requisiti e test

Il progetto usa Spring Boot 3.5.14 e Java 25 (LTS). Per il funzionamento servono Maven 3.9.15+ e una connessione solo al primo avvio per scaricare le dipendenze Maven; l'applicazione risultante funziona poi in rete locale senza servizi cloud.

```powershell
mvn test
```

Per avviare il server: `mvn spring-boot:run`, poi aprire `http://localhost:8080/ordini.html`. Per avviare il JAR direttamente, usare `java --enable-native-access=ALL-UNNAMED -jar target/gestionale-pizzeria-0.0.1-SNAPSHOT.jar`.
Per usare un telefono, PC e telefono devono essere sulla stessa rete Wi-Fi; dal telefono
si apre `http://IP_DEL_PC:8080/ordini.html`. La rete ospiti puo' impedire la comunicazione.
Consigliata una prenotazione DHCP nel router per mantenere stabile l'IP del PC server.

Impostare `stampa.nome` con il nome esatto della stampante di Windows, oppure lasciarlo
vuoto per usare la stampante predefinita. Un errore di stampa non annulla mai un ordine
gia' salvato. Il database e' il file locale `data/pizzeria.db`: copiarlo periodicamente
per eseguire un backup. Non esporre la porta 8080 su Internet.