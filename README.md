# Gestionale Pizzeria

Gestionale web per ordini, aggiornato per il deploy su Vercel. Le pagine esistenti
sono servite solo dopo la verifica server-side della sessione admin; le API Node.js
salvano gli ordini in Firestore.
L'accesso e' riservato all'account Firebase con il custom claim `admin: true`.

## Configurazione Firebase

Il progetto Firebase collegato e' `gestionalecivico7`.

1. Nella Firebase Console, abilita **Authentication > Sign-in method > Email/Password**.
2. Crea manualmente l'utente amministratore `mattia.torneo2000@gmail.com` in
   **Authentication > Users > Add user**. Non e' disponibile alcuna registrazione pubblica.
3. Registra un'app Web Firebase e annota `apiKey`, `authDomain` e `appId` dalle
   impostazioni dell'app. Sono configurazioni client pubbliche, non credenziali di servizio.
4. Crea il database Firestore in modalita' Native, se non esiste gia'.
5. Ottieni una chiave JSON di un service account Firebase Admin per gli script e
   per l'ambiente server Vercel. Non inserirla nel codice, nel bundle o nel repository.

Per assegnare il claim admin da PowerShell, imposta le variabili nell'ambiente
locale del terminale senza salvare il service account nel repository:

```powershell
$env:FIREBASE_PROJECT_ID = "gestionalecivico7"
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Raw -Path .\service-account.json
npm run set-admin -- mattia.torneo2000@gmail.com
```

Il comando conserva gli altri custom claims e revoca le sessioni precedenti;
l'amministratore deve poi accedere di nuovo. Per rimuovere il ruolo, usa lo stesso
comando con `--revoke`:

```powershell
npm run set-admin -- mattia.torneo2000@gmail.com --revoke
```

Per gestire gli account, usa **Firebase Console > Authentication > Users**.
La registrazione pubblica non e' implementata.

## Deploy

Installa le dipendenze e costruisci gli asset:

```powershell
npm install
npm run build
```

Il lockfile mantiene `jose` 4.15.9 per compatibilita' CommonJS con `jwks-rsa`
nel runtime Node.js 22 di Vercel; conserva entrambi i file di manifest e lockfile
allineati durante gli aggiornamenti.

Configura in Vercel, per gli ambienti Production e Preview che desideri usare:

- `FIREBASE_PROJECT_ID`: `gestionalecivico7`
- `FIREBASE_WEB_API_KEY`: chiave API pubblica dell'app Web Firebase
- `FIREBASE_AUTH_DOMAIN`: dominio di autenticazione dell'app Web
- `FIREBASE_APP_ID`: ID dell'app Web Firebase
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON completo del service account Firebase Admin

Poi collega il progetto Vercel dalla directory del progetto, pubblica le regole
Firestore e distribuisci:

```powershell
vercel link
firebase deploy --only firestore:rules --project gestionalecivico7
vercel --prod
```

Per avviare il server Spring locale, configura anche i parametri Web Firebase
nell'ambiente Windows e usa il file service account esclusivamente come credenziale
server:

```powershell
$env:FIREBASE_PROJECT_ID = "gestionalecivico7"
$env:FIREBASE_WEB_API_KEY = "<apiKey dell'app Web Firebase>"
$env:FIREBASE_AUTH_DOMAIN = "gestionalecivico7.firebaseapp.com"
$env:FIREBASE_APP_ID = "<appId dell'app Web Firebase>"
$env:GOOGLE_APPLICATION_CREDENTIALS = (Join-Path $PWD "service-account.json")
.\avvia-gestionale.bat
```

Il server locale ascolta solo su `127.0.0.1`; il filtro Spring verifica il cookie
Firebase revocabile e il claim admin prima di servire pagine, risorse e API. Le
richieste di modifica richiedono anche l'origine corretta. Se manca la configurazione
Firebase, l'accesso protetto fallisce in modo chiuso.

Il file `.env.example` elenca i nomi delle variabili senza valori. In locale,
copiare i nomi in `.env` non basta: il progetto richiede anche un account di
servizio valido e la configurazione Web Firebase per le funzioni e il login.

## Sicurezza e dati

- Ogni pagina applicativa verifica la sessione server-side; account non autenticati
  vengono inviati al login e account senza il claim admin ricevono solo "Accesso
  negato" e logout.
- Le API verificano una sessione Firebase Admin e il claim `admin` prima di leggere
  menu/ordini o eseguire modifiche. Le sessioni sono cookie `HttpOnly`, `Secure` e
  `SameSite=Lax`; le operazioni di modifica controllano anche l'origine.
- Le Firestore Security Rules autorizzano lettura e scrittura solo a utenti con
  `request.auth.token.admin == true`. L'SDK Admin delle API ha privilegi server;
  per questo le API applicano autonomamente lo stesso controllo.
- Il database SQLite `data/pizzeria.db` resta locale e non viene caricato né
  cancellato dal deploy. Gli ordini gia' presenti non sono importati
  automaticamente in Firestore. Per conservarli, verifica prima il database locale e
  poi avvia l'import una sola volta, prima di usare il nuovo gestionale:

  ```powershell
  npm run import-sqlite -- --dry-run
  $env:FIREBASE_PROJECT_ID = "gestionalecivico7"
  $env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Raw -Path .\service-account.json
  npm run import-sqlite
  ```

  L'import mantiene numeri, date, note, righe e importi; rifiuta di sovrascrivere
  ordini gia' presenti in Firestore e puo' riprendere un'import interrotta dallo
  stesso file SQLite.
- La stampa del sito Vercel passa per una coda Firestore e un terminale Windows
  locale: il server cloud non puo' raggiungere direttamente una stampante della rete
  del ristorante. Per abilitarla, installa la stampante in Windows, impostala come
  predefinita (oppure imposta `PRINTER_NAME` con il nome esatto della coda Windows),
  installa Node.js e le dipendenze del progetto e avvia dalla cartella del progetto:

  ```powershell
  npm install
  npm run printer-terminal
  ```

  Il terminale usa il service account locale `service-account.json`, interroga
  Firestore ogni 10 secondi e invia le nuove comande alla stampante predefinita
  tramite il driver Windows. La chiave del service account ha privilegi amministrativi:
  tienila solo su un PC fidato, non condividerla e non caricarla su GitHub. Il processo
  ascolta esclusivamente su `127.0.0.1:8765`; il browser comunica con esso solo dal
  dominio di produzione e potrebbe chiedere il permesso di accesso alla rete locale.
  Le stampanti virtuali standard di Windows (PDF, XPS e Fax) non vengono usate per
  evitare finestre di dialogo o file al posto della stampa fisica.
  Lascia aperta la finestra del terminale e il PC acceso e connesso a Internet per
  ricevere e stampare gli ordini. La Home indica stampante, coda e comande fallite;
  dopo aver risolto un errore, puoi usare "Riprova comande non stampate".
- Le comande gia' presenti prima dell'attivazione non vengono ristampate. Una
  modifica a una comanda gia' stampata non la ristampa; quelle ancora in coda usano
  i dati aggiornati. Se il PC o il terminale si interrompe dopo che Windows ha
  accettato il lavoro ma prima della conferma su Firestore, il sistema puo' ritentare
  e produrre una copia duplicata: e' preferibile a perdere una comanda. Dimensione
  carta, margini e taglierina vanno configurati nelle preferenze del driver Windows.
Il driver Epson deve usare la larghezza del rotolo effettivamente caricato; la
formattazione delle comande usa 42 caratteri per riga, adatta alla configurazione
80 mm. La larghezza fisica del rotolo non e' rilevabile dal terminale.
La stampa usa solo software e servizi gia' previsti dal progetto e non richiede
  nuovi servizi a pagamento; restano applicabili le quote gratuite di Firebase.

## Test e funzionamento locale legacy

```powershell
npm test
npm run build
mvn test
```

`mvn spring-boot:run` avvia ancora il backend locale legacy con SQLite e stampante.
Il deploy Vercel usa invece le API Node.js in `api/` e Firestore.
