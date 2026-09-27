# Comportamenti (BEHAV)

Spec viva: linguaggio dei comportamenti dei personaggi in YAML. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### BEHAV-001 — Comportamenti dei personaggi
*Introdotto in F06 · ultima modifica: F06.*
Un comportamento descrive in YAML cosa fa un personaggio; non contiene codice. Le sue parti sono **istruzioni**, per distinguerle dai passi della simulazione.
- **a** `[unit]` Un personaggio può dichiarare un comportamento (`behavior`) in tre modi: scritto nel personaggio, in un file YAML esterno indicato con un percorso relativo alla cartella del mondo, o come uso di un comportamento della libreria con i suoi parametri (BEHAV-006). Un percorso che esce dalla cartella del mondo è un errore.
- **b** `[unit]` Un personaggio dichiara al più uno tra comportamento e controllore; entrambi sono un errore.
- **c** `[unit]` I comportamenti si validano con il file del mondo: costrutti sconosciuti, campi mancanti o fuori intervallo, riferimenti a stati, flag, contatori o id inesistenti sono errori nel formato di YAML-002, con il file (anche esterno), la riga e il percorso del campo.
- **d** `[unit]` Il comportamento si esegue nel passo di simulazione: stesso mondo, stesso stato iniziale e stessa sequenza di intenzioni e frasi del giocatore producono le stesse azioni negli stessi passi (P2).
- **e** `[unit]` Un comportamento non avvia programmi e non richiede il consenso di PROTO-005.
- **f** `[e2e]` In modalità solo browser i personaggi con un comportamento agiscono come con l'host.
- **g** `[unit]` Alla ricarica del mondo, anche quando si salva un file di comportamenti esterno (HOST-003), i comportamenti ripartono dallo stato iniziale con la memoria vuota.

### BEHAV-002 — Routine e reazioni
*Introdotto in F06 · ultima modifica: F06 (emendamento A6.1).*
- **a** `[unit]` Una routine è una sequenza di istruzioni eseguite una dopo l'altra: finita l'ultima, ricomincia dalla prima. Può essere dichiarata da eseguire una volta sola; finita, il personaggio sta fermo e le reazioni restano attive.
- **b** `[unit]` Un'istruzione è un'azione di PROTO-001.b (`walk_to`, `look_at`, `say`, `follow`, `wait`) con gli stessi campi e limiti, oppure una domanda (BEHAV-005), una modifica della memoria, un'istruzione condizionale con i suoi rami, un cambio di stato (BEHAV-003). In un comportamento `follow` dichiara una durata, e `walk_to` con un elenco di mete le visita in ordine, come altrettante istruzioni `walk_to` consecutive.
- **c** `[unit]` Una reazione dichiara un evento, condizioni facoltative e una sequenza di istruzioni. Quando scatta sostituisce l'azione in corso ed esegue le sue istruzioni; poi la routine riprende dall'istruzione interrotta, che ricomincia (Q3).
- **d** `[unit]` Le reazioni hanno la priorità dell'ordine in cui sono dichiarate: una reazione interrompe quella in corso solo se viene prima; un evento che non può interrompere si ignora (Q1).
- **e** `[unit]` Una reazione può essere limitata a scattare al più una volta in un intervallo dichiarato, oppure una volta sola.
- **f** `[unit]` Se l'azione di un'istruzione fallisce (per esempio una meta irraggiungibile) si eseguono le istruzioni di fallimento dichiarate, se ci sono, altrimenti l'istruzione successiva; il terminale dell'host segnala il fallimento con il personaggio e la causa (Q4).
- **g** `[unit]` Un comportamento non blocca la simulazione: in un passo esegue al più 100 istruzioni che non durano (memoria, condizioni, cambi di stato); le altre proseguono al passo successivo, e il terminale dell'host segnala il personaggio che ha raggiunto il limite (Q11).

### BEHAV-003 — Stati
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` Un comportamento può dichiarare più stati con nome, ognuno con routine e reazioni, e lo stato iniziale. Senza stati, routine e reazioni formano un unico stato.
- **b** `[unit]` Il cambio di stato interrompe ciò che è in corso e avvia dall'inizio la routine del nuovo stato.
- **c** `[unit]` Le reazioni dichiarate fuori dagli stati valgono in tutti gli stati, dopo quelle dello stato corrente nell'ordine di priorità.

### BEHAV-004 — Eventi, condizioni e memoria
*Introdotto in F06 · ultima modifica: F06.*
Il vocabolario è chiuso: eventi, condizioni e istruzioni hanno forme predefinite, senza espressioni.
- **a** `[unit]` Eventi: interazione del giocatore (tasto E); frase sentita, con filtri facoltativi su chi parla, se è rivolta al personaggio e se nomina un elemento della mappa (DIALOG-003); un'entità (il giocatore o un id) che entra in un raggio dal personaggio o ne esce; un'entità che entra in un'area della mappa (luogo o distribuzione) o ne esce; un tempo trascorso nello stato corrente. Entrare e uscire scattano al passaggio, non finché si resta dentro o fuori.
- **b** `[unit]` Nelle istruzioni di una reazione a una frase, chi ha parlato e l'elemento nominato si possono usare come mete delle azioni.
- **c** `[unit]` Condizioni: flag attivo o no; contatore uguale, minore o maggiore di un numero; un'entità entro un raggio; un'entità o il personaggio stesso dentro un'area della mappa; caso con una probabilità. Più condizioni devono valere tutte insieme.
- **d** `[unit]` La memoria di un personaggio è fatta di flag e contatori dichiarati nel comportamento; un nome non dichiarato è un errore. Le istruzioni li attivano, disattivano, impostano e incrementano.
- **e** `[unit]` Il caso è deterministico: dipende dal seed del mondo, dall'id del personaggio e dal tempo di simulazione (P2).
- **f** `[unit]` Codice esterno al core può registrare eventi, condizioni e istruzioni nuovi con il loro schema, senza modificare il core (P5); sono subito validati e utilizzabili nel YAML.

### BEHAV-005 — Domande al giocatore
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` Una domanda dice il testo come `say` e aspetta, fermo, una risposta del giocatore: una frase detta entro 16 blocchi e rivolta al personaggio, oppure senza destinatario se il personaggio è il più vicino al giocatore tra quelli che aspettano una risposta (a parità di distanza, il primo per id) (Q7). Il tempo limite si dichiara; per default è 30 s.
- **b** `[unit]` La domanda dichiara cosa si aspetta: un elemento della mappa, sì o no, oppure una tra opzioni dichiarate. La risposta si interpreta con le regole di DIALOG-003.
- **c** `[unit]` La domanda ha rami facoltativi per la risposta capita, non capita e mancante entro il tempo limite. Nel ramo della risposta capita l'elemento risposto si usa come meta delle azioni; per sì/no e per le opzioni c'è un ramo per ogni risposta. Senza il ramo corrispondente si prosegue con l'istruzione successiva.
- **d** `[unit]` La frase che risponde a una domanda non fa scattare reazioni.
- **e** `[unit]` Il testo di `say` e delle domande può citare il nome di un riferimento: il giocatore, chi ha parlato, l'elemento risposto o nominato (per esempio «Vado al Laghetto del mulino!») (Q9).

### BEHAV-006 — Libreria di comportamenti
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` La sezione `behaviors` del file del mondo, e i file YAML esterni che essa indica, dichiarano comportamenti con nome e parametri tipizzati (tipo, intervallo, default), come i tipi di struttura (STRUCT-001). Tipi dei parametri: numero, testo, durata, punto, id della mappa e liste di questi. Un nome ripetuto è un errore.
- **b** `[unit]` Un personaggio usa un comportamento della libreria per nome, con i suoi parametri: quelli omessi prendono il default; parametri sconosciuti, mancanti senza default o fuori intervallo sono errori nel formato di YAML-002.
- **c** `[unit]` Personaggi con lo stesso comportamento lo eseguono in modo indipendente: memoria e caso sono di ciascuno.

### BEHAV-007 — Esempi e guida
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[manuale]` Le cartelle di esempio contengono personaggi guidati da comportamenti, tra cui uno che chiede dove andare e ci va, e una folla di 20 personaggi con lo stesso comportamento della libreria; si comportano come descritto nei commenti.
- **b** `[manuale]` Una guida del linguaggio descrive ogni evento, condizione e istruzione con un esempio.
