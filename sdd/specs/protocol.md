# Protocollo dei controllori (PROTO)

Spec viva: messaggi, percezione, canali, consenso e tempi limite dei controllori. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PROTO-001 — Modello dei messaggi
*Introdotto in F05 · ultima modifica: F06.*
Lo stesso modello su tutti i canali, in JSON; nomi di campi e azioni in `snake_case` (Q8).
- **a** `[unit]` Il primo messaggio al controllore dichiara la versione del protocollo, id, nome e descrizione del personaggio, le misure del mondo e la mappa (MAP-002).
- **b** `[unit]` Il controllore chiede azioni: `walk_to` (un punto o un elemento della mappa), `look_at` (un punto o un elemento della mappa), `say`, `follow` (un personaggio o il giocatore, a una distanza), `wait`, `stop`, con le mete di MAP-003. `walk_to` e `follow` accettano una velocità in m/s tra 0,5 e 7; senza, il personaggio cammina a 1,5 m/s. Ogni azione ha un identificativo e riceve un esito: completata, fallita con la causa, o sostituita.
- **c** `[unit]` Un'azione nuova sostituisce quella in corso (Q5).
- **d** `[unit]` Un messaggio non valido riceve una risposta d'errore che ne indica la causa; l'host e il personaggio continuano a funzionare.
- **e** `[unit]` Alla ricarica del mondo il controllore riceve la mappa nuova.

### PROTO-002 — Percezione
*Introdotto in F05 · ultima modifica: F06.*
- **a** `[unit]` Il controllore riceve la percezione del personaggio 4 volte al secondo: posizione, orientamento, se è a terra o in acqua, azione in corso, entità entro 32 blocchi (id, nome, tipo, posizione, distanza).
- **b** `[unit]` Il controllore riceve subito gli eventi: frasi dette entro 16 blocchi, anche dal giocatore (chi, cosa, destinatario, elemento della mappa nominato secondo DIALOG-003), interazione del giocatore, esito delle azioni.
- **c** `[unit]` Con il giocatore entro 3 m, il tasto E invia al personaggio più vicino un evento di interazione (Q6).

### PROTO-003 — Controllori lanciati dal file del mondo
*Introdotto in F05 · ultima modifica: F05.*
- **a** `[unit]` Un personaggio con `controller: { command: … }` è guidato da un processo che l'host avvia nella cartella del mondo: righe JSON su stdin verso il controllore, su stdout verso l'host; lo stderr compare nel terminale con il nome del personaggio.
- **b** `[unit]` Se il processo termina o si blocca, il personaggio si ferma e il terminale lo segnala; l'host continua a funzionare. Alla ricarica del mondo i processi ripartono.
- **c** `[unit]` I personaggi si muovono anche senza viste collegate.
- **d** `[manuale]` Gli esempi del progetto, un controllore in Python e uno in JavaScript, guidano i loro personaggi come descritto nei loro commenti.

### PROTO-004 — Client esterni via WebSocket
*Introdotto in F05 · ultima modifica: F06.*
- **a** `[unit]` Un client collegato al WebSocket dell'host può chiedere di guidare un personaggio che non ha già un controllore attivo, anche se ha un comportamento: il comportamento si sospende finché il client lo guida (Q2). Da quel momento il client parla il protocollo di PROTO-001 e PROTO-002.
- **b** `[unit]` Alla chiusura del client il personaggio si ferma, o riprende il suo comportamento da dov'era: stesso stato, istruzione interrotta che ricomincia (BEHAV-002.c), memoria intatta (Q2). Poi può essere guidato da un altro client.

### PROTO-005 — Consenso e verifica dei comandi
*Introdotto in F05 · ultima modifica: F05.*
- **a** `[unit]` Prima di lanciare i comandi dei controllori l'host li elenca nel terminale e chiede il consenso; senza consenso i personaggi restano fermi e l'host funziona comunque. L'opzione `--allow-commands` dà il consenso senza chiederlo.
- **b** `[unit]` All'avvio l'host verifica che il programma di ogni comando esista; un programma mancante è segnalato con il personaggio e il comando.
- **c** `[unit]` Il consenso si ricorda per quella cartella finché i suoi comandi non cambiano; se un comando cambia o se ne aggiunge uno, l'host chiede di nuovo. Il consenso è salvato fuori dalla cartella del mondo, così una cartella ricevuta da altri non può portarlo con sé (Q1).

### PROTO-006 — Il mondo non aspetta i controllori
*Introdotto in F05 · ultima modifica: F05.*
- **a** `[unit]` Un controllore lento non rallenta la simulazione: le percezioni non lette si sostituiscono con l'ultima, non si accumulano.
- **b** `[unit]` Ogni azione ha un tempo limite proporzionale al lavoro richiesto (per `walk_to`, alla lunghezza del percorso); scaduto, fallisce con la causa.

### PROTO-007 — Parlare come giocatore
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` Un client collegato al WebSocket dell'host può parlare come il giocatore, con le regole di DIALOG-001.b e un destinatario facoltativo, e riceve le frasi che il giocatore sente.
