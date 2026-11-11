# Gestionale Pizzeria

Gestionale web degli ordini di una pizzeria (tavolo, banco, ritiro, consegna) con stampa delle comande su stampanti Epson di rete.

- **Produzione**: Vercel con API serverless Node.js 22 (CommonJS) in `api/`, Firebase Auth (cookie di sessione) e Firestore.
- **Pagine**: HTML/CSS/JS vanilla in `src/main/resources/static/`, servite dopo la verifica server-side della sessione.
- **Stampa**: agente Windows locale (`scripts/printer-agent*.js`) che legge una coda Firestore e invia ESC/POS via TCP 9100.
- **Legacy**: backend Spring Boot 4 / Java 25 / SQLite in `src/main/java` (avvio locale, `mvn`). Non è usato dal deploy Vercel.
- Package manager: **npm** (c'è `package-lock.json`). Firebase project: `gestionalecivico7`.

## Comandi

```powershell
npm install              # dipendenze
npm run build            # rigenera lib/menu.json, lib/extras.json, public/ e lib/generated-pages.js
npm test                 # build + node --test (tests-node/*.test.js)
npm run lint             # ESLint
npm run typecheck        # node --check su tutti i .js (non c'è TypeScript)
npm run format           # Prettier su tutto (usalo solo se richiesto: genera diff enormi)
npm run format:check
node --test tests-node/orders.test.js   # un singolo file di test
mvn test                 # test Java legacy (solo se tocchi src/main/java o src/test/java)
mvn spring-boot:run      # backend locale legacy
```

## Definition of done

Prima di dire che un task è finito, esegui e fai passare:

```powershell
npm run lint; npm run typecheck; npm test
```

più `mvn test` se hai modificato codice Java. Riporta l'esito reale (numero di test passati e falliti). Se un comando fallisce, correggi; se il fallimento non dipende dalla tua modifica, dillo esplicitamente.
Per modifiche non banali usa il subagente `code-reviewer` sul diff.

## Struttura

```
api/                      endpoint Vercel (un file = una route)
  auth/                   login, sessione, logout
  ordini/                 index.js (lista/crea), [numero].js (leggi/modifica/elimina)
  consegne/               lettura consegne (claim delivery)
  pages/[page].js         serve le pagine HTML protette da lib/generated-pages.js
lib/
  api.js                  wrapper api(handler) + methodNotAllowed
  auth.js                 httpError, requireAdmin, requireDeliveryAccess, requireSameOrigin
  firebase-admin.js       getFirebaseServices()
  orders.js               validazione/normalizzazione ordini, totali (prepareOrder, publicOrder, ...)
  printer-jobs.js         coda e lease dei job di stampa
scripts/                  build, set-admin/set-delivery, import SQLite, agente di stampa, setup PC (.ps1)
src/main/resources/static/  sorgente UI (HTML/CSS/JS browser)
src/main/java/it/pizzeria/gestionale/  backend Spring legacy; MenuService.java ed ExtraMenu.java = sorgente del menu
tests-node/               test node:test
firestore.rules           regole Firestore    vercel.json   rewrites + header di sicurezza (CSP)
```

### Flusso di generazione (importante)
- `scripts/export-menu.js` estrae prodotti ed extra da `MenuService.java`/`ExtraMenu.java` e genera `lib/menu.json` e `lib/extras.json`.
- `scripts/copy-static.js` copia `src/main/resources/static/` in `public/` e incorpora le pagine protette in `lib/generated-pages.js`.
→ Per cambiare il menu modifica i file **Java**; per cambiare la UI modifica `src/main/resources/static/`. Poi `npm run build`.

## Convenzioni di codice

- JavaScript **CommonJS** (`require` / `module.exports`), niente ESM e niente TypeScript.
- 4 spazi, doppi apici, punto e virgola, niente trailing comma, arrow senza parentesi (`x => ...`). Prettier (`.prettierrc.json`) formatta in automatico i file che modifichi tramite l'hook.
- Funzioni dichiarate con `function nome() {}`; `const` di default.
- Identificatori di dominio e messaggi utente in **italiano** (`tavoloOCliente`, `statoPagamento`, `"Tipo ordine non valido."`). Apostrofi nei messaggi scritti come `e'`.
- Errori HTTP: `throw httpError(400, "Messaggio in italiano.")`. Il wrapper `api()` li converte in `{ errore: msg }`, mentre gli errori inattesi diventano un 500 generico (non esporre dettagli).
- Endpoint tipo:
  ```js
  module.exports = api(async (req, res) => {
      if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
      await requireAdmin(req);
      ...
  });
  ```
- Test: `const test = require("node:test"); const assert = require("node:assert/strict");`, descrizioni in **inglese**, un file per area in `tests-node/`.
- Java: package `it.pizzeria.gestionale.{auth,controller,model,repository,service}`, nomi in italiano.

## Sicurezza (non regredire)

- Claim `admin: true` → accesso completo; `delivery: true` → solo lettura degli ordini con `tipo == "consegna"`.
- L'SDK Admin bypassa le Firestore Rules: **ogni endpoint** deve chiamare `requireAdmin` / `requireDeliveryAccess` e filtrare da solo.
- Le mutazioni richiedono `requireSameOrigin(req)`.
- Nessun segreto nel codice, nei log o nei test. Niente `innerHTML` con dati non escapati. Rispetta la CSP di `vercel.json` (niente script inline o CDN esterni).
- Compatibilità: gli ordini storici `tipo: "sala"` vanno trattati come `tavolo`.

## Non modificare

- **File generati**: `public/`, `lib/generated-pages.js`, `lib/menu.json`, `lib/extras.json` (si rigenerano con `npm run build`).
- `target/`, `.tools/`, `node_modules/`, `data/` (DB SQLite locale, log e configurazione stampanti).
- `package-lock.json` a mano (solo tramite `npm install`).
- **Segreti**: `service-account*.json`, `.env`, `.env.*`. Non leggerli né stamparli.
- Senza una richiesta esplicita: `firestore.rules`, `vercel.json`, `.firebaserc`, gli script `.bat`/`.ps1` di installazione del PC della pizzeria, `pom.xml`.

## Note

- La UI usa 4 spazi, tranne `modifica.js` che è ancora indentato con tab: l'hook Prettier lo convertirà alla prima modifica (diff ampio ma solo di whitespace).
- Il deploy (`vercel --prod`, `firebase deploy`) e i comandi `set-admin`/`set-delivery`/`import-sqlite` agiscono su sistemi reali: eseguili solo su richiesta esplicita.
- Su Windows i comandi sono in PowerShell; l'hook di formattazione usa `node` ed è indipendente dalla shell.
