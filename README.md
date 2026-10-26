# Gestionale Pizzeria

Gestionale web per ordini, aggiornato per il deploy su Vercel. Le pagine esistenti
sono servite solo dopo la verifica server-side della sessione Firebase; le API
Node.js salvano gli ordini in Firestore. Gli amministratori usano il custom claim
`admin: true`; i consegnatori usano `delivery: true` e possono solo visualizzare
la pagina delle consegne.

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

Per abilitare un account consegnatore, prima crealo manualmente in Firebase
Authentication > Users, poi assegna il claim con:

```powershell
npm run set-delivery -- consegnatore@example.com
```

Per revocare il ruolo usa `npm run set-delivery -- consegnatore@example.com --revoke`.
L'utente deve accedere di nuovo dopo l'assegnazione o la revoca. I consegnatori
possono vedere tutte le consegne, comprese quelle precedenti, ma non possono
creare, modificare o eliminare ordini.

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

- Per trasferire il ponte di stampa su un altro PC Windows x64, crea il pacchetto
  senza segreti con:

  ```powershell
  .\scripts\package-pizzeria-setup.ps1
  ```

  Copia `pizzeria-pc-setup.zip` sul PC della pizzeria, estrailo e fai doppio clic
  su `configura-pc-pizzeria.bat`. Il setup scarica dal sito ufficiale Node.js 22
  portatile solo se manca, ne verifica il checksum, installa le dipendenze, esegue
  la build e configura l'attivita' pianificata. Non installa driver Epson. Il file
  service account e' escluso dal pacchetto: copialo separatamente su USB fidata o
  selezionalo quando il setup lo richiede; non inviarlo via chat o email.
  L'installazione prova l'IP Epson noto `192.168.1.222` per la stampante Cucina e
  chiede l'IP della stampante Sala. Entrambe devono avere un IP locale diverso e
  raggiungibile sulla porta `9100`. Dopo aver verificato il nuovo PC, fai
  doppio clic su `disattiva-stampa-automatica.bat` sul PC di prova. Il comando
  disabilita solo l'attivita' pianificata, senza cancellare chiavi o configurazione.
  Attendi fino a 2 minuti per la scadenza del lock condiviso prima di affidare i job
  al nuovo PC.
  Per aggiungere la seconda stampante a un PC gia' configurato, interrompi prima
  l'agente con `disattiva-stampa-automatica.bat` e poi rilancia
  `installa-stampa-automatica.bat`; inserisci gli IP distinti di Cucina e Sala.
- Ogni pagina applicativa verifica la sessione server-side; gli account admin
  accedono a tutto, i consegnatori solo alla pagina dedicata e gli altri ricevono
  "Accesso negato".
- Le API verificano una sessione Firebase Admin: il claim `admin` consente tutte le
  operazioni, mentre `delivery` consente solo la lettura degli ordini di tipo
  consegna. Le sessioni sono cookie `HttpOnly`, `Secure` e `SameSite=Lax`; le
  operazioni di modifica controllano anche l'origine.
- Le Firestore Security Rules consentono agli admin lettura e scrittura; i
  consegnatori possono leggere solo documenti con `tipo == "consegna"`. L'SDK Admin
  delle API ha privilegi server, quindi ogni endpoint applica autonomamente lo
  stesso controllo e filtra i risultati.
- Le nuove comande possono essere di tipo sala/asporto o consegna. Le consegne
  richiedono nome del cliente, indirizzo e telefono; la pagina Consegne mostra
  riepilogo e dettaglio, offre chiamata e navigazione tramite Mappe Apple o Google
  Maps e mostra modifica/eliminazione solo agli admin.
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
- La stampa del sito Vercel passa per una coda Firestore e un agente Windows locale:
  il PC interroga Firestore ogni 10 secondi tramite connessioni Internet in uscita e
  invia lo stesso ticket sia alla stampante Cucina sia alla stampante Sala, via
  ESC/POS TCP sulla porta `9100`. Entrambe devono essere raggiungibili per avviare
  una comanda; se una si scollega durante l'invio, la coda registra quella gia'
  riuscita e al tentativo successivo manda la copia solo alla stampante mancante.
  Non servono driver Epson/Windows e non va aperta alcuna porta del router; le
  stampanti non vengono esposte a Internet. Il PC deve rimanere acceso, connesso a
  Internet e con l'utente Windows collegato.
- Per configurare l'agente, installa Node.js e le dipendenze del progetto una sola
  volta (`npm install`), assicurati che `service-account.json` sia presente solo sul
  PC fidato, poi fai doppio clic su `installa-stampa-automatica.bat`. Lo script chiede
  gli IP delle stampanti Cucina e Sala, verifica la porta `9100`, registra
  un'attivita' pianificata all'accesso dell'utente corrente e avvia l'agente in
  background. Se un IP cambia, riserva entrambi gli indirizzi nel router e riesegui
  l'installazione quando l'agente e' fermo. Non e' necessario installare o
  selezionare code stampante Windows per stampare.

  ```powershell
  npm install
  .\installa-stampa-automatica.bat
  ```

  Il processo usa il service account locale `service-account.json`, che ha privilegi
  amministrativi: conservalo solo su un PC fidato, non condividerlo e non caricarlo
  su GitHub. Il servizio locale ascolta solo su `127.0.0.1:8765` per mostrare lo
  stato e riprovare i job; il browser puo' chiedere il permesso di accesso alla rete
  locale. La Home mostra la connessione Ethernet, la coda e gli errori.
- Le comande gia' presenti prima dell'attivazione non vengono ristampate. Una
  modifica a una comanda gia' stampata non la ristampa; quelle ancora in coda usano
  i dati aggiornati. Se il PC o l'agente si interrompe dopo l'invio dei dati ma prima
  della conferma Firestore, il job puo' essere ritentato e produrre una copia
  duplicata: si privilegia non perdere una comanda. I titoli e le sezioni sono inviati
  in ESC/POS con formato ingrandito; il taglio viene eseguito dalla taglierina della
  stampante. La larghezza del rotolo va selezionata fisicamente (58 o 80 mm) e la
  stampante va configurata per l'uso in rete.
  Riferimenti Epson: [TM-T20 Technical Reference Guide](https://download4.epson.biz/sec_pubs/bs/pdf/TM-T20_trg_en_revD.pdf) e
  [ESC/POS command reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/index.html).
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
