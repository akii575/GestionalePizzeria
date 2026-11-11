---
name: nuova-feature
description: Workflow standard per sviluppare una nuova funzionalità o una modifica non banale nel Gestionale Pizzeria — esplora, piano, implementa, test, lint, riepilogo. Usala quando l'utente chiede di aggiungere o cambiare un comportamento dell'app.
---

# Nuova feature — workflow

Segui le fasi **in ordine**. Non saltare la fase di piano.

## 1. Esplora
- Rileggi `CLAUDE.md` (comandi, cartelle, file da non toccare).
- Individua i file coinvolti: endpoint in `api/`, logica in `lib/`, UI in `src/main/resources/static/`, agente di stampa in `scripts/`, eventuale backend Java legacy in `src/main/java/`.
- Leggi i test esistenti in `tests-node/` relativi all'area: mostrano il comportamento atteso.
- Cerca funzioni riutilizzabili prima di scriverne di nuove (`httpError`, `prepareOrder`, `publicOrder`, helper in `lib/auth.js` e `lib/api.js`).

## 2. Piano
Presenta all'utente un piano breve e **attendi la conferma** prima di scrivere codice:
- obiettivo in una frase;
- file da modificare o creare;
- impatti su sicurezza (claim `admin`/`delivery`, controllo origine), su Firestore, sulla stampa e sulla compatibilità con gli ordini esistenti;
- test da aggiungere;
- domande aperte.

## 3. Implementa
- Rispetta le convenzioni di `CLAUDE.md` (CommonJS, 4 spazi, doppi apici, messaggi utente in italiano).
- Modifica le **sorgenti**, mai i file generati (`public/`, `lib/generated-pages.js`, `lib/menu.json`, `lib/extras.json`). Il menu si cambia in `MenuService.java`/`ExtraMenu.java` e poi si lancia `npm run build`.
- Ogni nuovo endpoint `api/` verifica sessione e claim al proprio interno.
- Modifiche piccole e mirate: niente refactoring non richiesti.

## 4. Test
- Aggiungi o aggiorna i test in `tests-node/*.test.js` (`node:test` + `node:assert/strict`, descrizioni in inglese).
- Copri il caso felice, gli errori di validazione e i permessi (admin, delivery, non autenticato).
- Se tocchi Java, aggiorna i test in `src/test/java` ed esegui `mvn test`.

## 5. Verifica (obbligatoria)
```
npm run lint
npm run typecheck
npm test
```
(+ `mvn test` se hai modificato Java). Se qualcosa fallisce, correggi e ripeti. Non dichiarare finito il task con comandi rossi.
Poi invoca il subagente **code-reviewer** sul diff e risolvi i problemi CRITICO/ALTO.

## 6. Riepilogo
Chiudi con:
- **Cosa è cambiato**: file → modifica in una riga ciascuno;
- **Perché**: le decisioni non ovvie;
- **Verifica**: comandi eseguiti e il loro esito (con i numeri dei test);
- **Da fare / rischi**: deploy (`vercel --prod`, `firebase deploy --only firestore:rules`), migrazioni dati, reinstallazione dell'agente di stampa, punti non verificati.

Non fare commit se l'utente non lo chiede.
