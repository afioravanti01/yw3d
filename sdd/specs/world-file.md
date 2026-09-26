# File del mondo (YAML)

Spec viva: formato, validazione e caricamento dei file YAML del mondo. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### YAML-001 — File del mondo
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Un file del mondo dichiara la versione dello schema (`version`), il terreno (`terrain`) e, facoltative, le strutture (`structures`) e le distribuzioni (`scatter`). Una versione dello schema non gestita è un errore.
- **b** `[unit]` Un campo sconosciuto è un errore (così un refuso non passa inosservato).
- **c** `[unit]` Lo stesso file e lo stesso codice registrato producono un mondo identico (stesso hash) in esecuzioni ripetute (P4).
- **d** `[e2e]` Il mondo di un file generato nel browser ha lo stesso hash di quello generato in Node.

### YAML-002 — Validazione ed errori
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Ogni errore indica file, riga, percorso del campo (es. `structures[3].params.width`) e causa leggibile.
- **b** `[unit]` La validazione riporta tutti gli errori del file, non solo il primo.
- **c** `[unit]` Sono errori: sintassi YAML non valida, campo obbligatorio mancante, tipo o intervallo non valido, tipo di struttura non registrato (il messaggio elenca i tipi disponibili), posizione fuori dal mondo.
- **d** `[e2e]` Con un file non valido l'app non genera il mondo e mostra gli errori in un pannello visibile.
- **e** `[unit]` Un comando da terminale valida un file e termina con codice ≠ 0 se ci sono errori, stampandoli nello stesso formato.

### YAML-003 — Terreno dichiarato
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Il file dichiara il seed del terreno; le dimensioni del mondo sono facoltative, con i default e i vincoli di WORLD-002.
- **b** `[unit]` Il file dichiara la versione del generatore di terreno per cui è scritto. Se è diversa da quella in uso il mondo si genera comunque e si produce un avviso che riporta le due versioni.
- **c** `[e2e]` L'avviso di versione è visibile nell'app.

### YAML-004 — Posizionamento delle strutture
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Ogni struttura dichiara il tipo, la posizione orizzontale (x, z in blocchi), i parametri del tipo e, facoltativa, la rotazione (0°, 90°, 180°, 270°).
- **b** `[unit]` Per default la struttura è appoggiata alla superficie del terreno nel suo punto di ancoraggio; una quota esplicita la sostituisce.
- **c** `[unit]` I parametri non dichiarati assumono i default del tipo.
- **d** `[unit]` Ogni struttura ha un seed derivato da seed del mondo e posizione; un seed esplicito lo sostituisce. Spostare o aggiungere un'altra struttura non cambia l'aspetto di questa.

### YAML-005 — Distribuzioni su un'area
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Una distribuzione dichiara uno o più tipi di struttura con i loro pesi, un'area (rettangolo o cerchio) e una densità (strutture per 100 m²) o un numero, più una distanza minima tra le strutture.
- **b** `[unit]` Le posizioni generate sono deterministiche e dipendono solo dalla dichiarazione e dal seed del mondo, non dalla forma del terreno.
- **c** `[unit]` Le strutture distribuite non si sovrappongono tra loro, né alle strutture posate singolarmente, né all'acqua: una posizione in conflitto viene scartata.
- **d** `[unit]` Ogni struttura generata rispetta la distanza minima dichiarata.

### YAML-006 — Scelta del file
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[e2e]` Senza parametri l'app carica il mondo predefinito del progetto; il parametro URL `?world=<nome>` carica un altro file del progetto.
- **b** `[e2e]` Un nome inesistente produce un errore visibile che elenca i mondi disponibili.

### YAML-007 — Ricaricamento in sviluppo
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[manuale]` In sviluppo, salvando il file in uso il mondo si rigenera senza ricaricare la pagina, entro il budget di PERF-001.a, e la camera mantiene posizione e orientamento.
- **b** `[manuale]` Se il file salvato non è valido, resta il mondo precedente e compaiono gli errori; alla correzione spariscono.

### YAML-008 — Partenza del giocatore
*Introdotto in F03 · ultima modifica: F05.*
- **a** `[unit]` Il file del mondo può dichiarare la posizione orizzontale di partenza del giocatore (x, z in blocchi), l'orientamento iniziale della visuale e l'aspetto (colori come in CHAR-001.a).
- **b** `[unit]` Una posizione di partenza fuori dal mondo è un errore nel formato di YAML-002.
