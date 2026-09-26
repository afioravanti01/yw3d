# F05 — Personaggi e protocollo dei controllori

| | |
|---|---|
| Stato | draft |
| Versione | 0.1 |
| Data | 2026-09-26 |
| Piano | [plan.md](plan.md) (dopo G1) |

## Obiettivo
Il mondo si popola di personaggi a blocchi animati, dichiarati nel YAML e mossi dalla stessa fisica del giocatore. Ogni personaggio può essere guidato da un **controllore**: un programma in qualunque linguaggio che riceve ciò che il personaggio percepisce e chiede azioni di alto livello (andare in un punto, guardare, dire, seguire, aspettare). L'host esegue le azioni con la ricerca del percorso e la fisica, e parla con i controllori con un unico protocollo su due canali: JSON a righe su stdio per i programmi lanciati dal YAML, WebSocket per i client esterni. È la base su cui F06 collegherà gli agenti LLM (D-008, P10).

## Contesto
- D-008 e costituzione v1.1: P3 (solo la fisica muove le entità), P10 (controllori esterni, consenso per i comandi, il mondo non aspetta i controllori).
- Spec vive coinvolte: [host.md](../../specs/host.md) (host, viste, ricaricamento), [physics.md](../../specs/physics.md) (entità e intenzioni), [player.md](../../specs/player.md) (misure e figura del giocatore), [world-file.md](../../specs/world-file.md) (file del mondo), [cli.md](../../specs/cli.md), [debug.md](../../specs/debug.md), [performance.md](../../specs/performance.md).
- Le porte delle case sono larghe 2 blocchi e alte 5 (STRUCT-006.b); i personaggi hanno le misure del giocatore (PLAYER-001.a).

## Fuori scope
- Agenti LLM, server MCP, dialogo libero con il giocatore, memoria: F06.
- Collisioni tra entità: personaggi e giocatore si attraversano.
- Personaggi che modificano il mondo (costruire, raccogliere).
- Canale MCP (F06) e client remoti via internet.
- Controllori in modalità solo browser: senza host i personaggi restano fermi.

## Storie utente
- **US-1** Come autore, dichiaro nel YAML un personaggio con aspetto e posizione e lo vedo nel mondo, animato.
- **US-2** Come autore, scrivo un controllore in Python (o in qualunque linguaggio) che legge righe JSON da stdin e ne scrive su stdout, e con esso faccio camminare, parlare e reagire il personaggio.
- **US-3** Come autore, mando il personaggio in un punto del borgo e lui ci arriva da solo, passando dalle porte e salendo i gradini.
- **US-4** Come giocatore, mi avvicino a un personaggio, premo un tasto e lui reagisce secondo il suo controllore.
- **US-5** Come utente, prima che l'host lanci i programmi di una cartella vedo quali sono e decido se permetterlo.
- **US-6** Come sviluppatore, collego da fuori un client (uno script, un test) che guida un personaggio via WebSocket.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CHAR-001 — Personaggi nel file del mondo
- **a** `[unit]` La sezione `characters` del file del mondo dichiara personaggi con identificativo univoco, posizione orizzontale di partenza, orientamento facoltativo, aspetto facoltativo (colori di pelle, capelli, maglia, pantaloni) e controllore facoltativo. Identificativi ripetuti e posizioni fuori dal mondo sono errori nel formato di YAML-002.
- **b** `[unit]` Ogni personaggio è un'entità fisica con le misure del giocatore, che parte sul primo spazio libero sopra la superficie (PLAYER-001.c) e si muove solo con intenzioni (P3).
- **c** `[unit]` Un personaggio senza controllore, o con il controllore fermo o assente, sta fermo.
- **d** `[e2e]` Le viste mostrano i personaggi nelle posizioni simulate dall'host; in modalità solo browser i personaggi compaiono fermi nella posizione di partenza.

### CHAR-002 — Figura e animazioni
- **a** `[unit]` La posa della figura (testa, busto, braccia, gambe) dipende solo dallo stato del personaggio: fermo, camminata e corsa con l'oscillazione degli arti proporzionale alla velocità, salto o caduta, nuoto, parlata.
- **b** `[manuale]` Le animazioni sono fluide e leggibili: si capisce a colpo d'occhio se un personaggio sta fermo, cammina, corre, salta, nuota o parla. Il giocatore in terza persona usa la stessa figura animata.
- **c** `[manuale]` Ciò che un personaggio dice compare in un fumetto sopra la testa, per un tempo proporzionale alla lunghezza del testo.

### NAV-001 — Ricerca del percorso
Un percorso è una sequenza di colonne percorribili: spazio libero per l'altezza del personaggio, gradini in salita di al più 1 blocco, discese di al più 3.
- **a** `[unit]` Tra due punti raggiungibili del mondo predefinito il percorso esiste e rispetta i vincoli; da fuori a dentro una casa passa dalla porta.
- **b** `[unit]` L'acqua si attraversa a nuoto solo se non c'è un'alternativa asciutta di lunghezza ragionevole (Q3).
- **c** `[unit]` Un punto irraggiungibile produce un fallimento con la causa (fuori dal mondo, nessun percorso), non un'attesa infinita.
- **d** `[unit]` La ricerca di un percorso da un capo all'altro del mondo predefinito richiede al più 50 ms.

### NAV-002 — Esecuzione dei percorsi
- **a** `[unit]` L'host muove il personaggio lungo il percorso solo con intenzioni (P3) e l'azione termina quando il personaggio è entro 1 blocco dalla meta.
- **b** `[unit]` Se il personaggio resta bloccato per più di 2 s il percorso si ricalcola; dopo 3 tentativi l'azione fallisce con la causa.

### PROTO-001 — Modello dei messaggi
Lo stesso modello su tutti i canali, in JSON; nomi di campi e azioni in `snake_case` (Q8).
- **a** `[unit]` Il primo messaggio al controllore dichiara la versione del protocollo, l'identificativo del personaggio e le misure del mondo.
- **b** `[unit]` Il controllore chiede azioni: `walk_to` (un punto o un'entità), `look_at`, `say`, `follow` (un'entità, a una distanza), `wait`, `stop`. Ogni azione ha un identificativo e riceve un esito: completata, fallita con la causa, o sostituita.
- **c** `[unit]` Un'azione nuova sostituisce quella in corso (Q5).
- **d** `[unit]` Un messaggio non valido riceve una risposta d'errore che ne indica la causa; l'host e il personaggio continuano a funzionare.

### PROTO-002 — Percezione
- **a** `[unit]` Il controllore riceve la percezione del personaggio 4 volte al secondo (Q4): posizione, orientamento, se è a terra o in acqua, azione in corso, entità entro 32 blocchi (identificativo, tipo, posizione, distanza).
- **b** `[unit]` Il controllore riceve subito gli eventi: frasi dette entro 16 blocchi (chi, cosa), interazione del giocatore, esito delle azioni.
- **c** `[unit]` Con il giocatore entro 3 m, il tasto E invia al personaggio più vicino un evento di interazione (Q6).

### PROTO-003 — Controllori lanciati dal file del mondo
- **a** `[unit]` Un personaggio con `controller: { command: … }` è guidato da un processo che l'host avvia nella cartella del mondo: righe JSON su stdin verso il controllore, su stdout verso l'host; lo stderr compare nel terminale con il nome del personaggio.
- **b** `[unit]` Se il processo termina o si blocca, il personaggio si ferma e il terminale lo segnala; l'host continua a funzionare. Alla ricarica del mondo i processi ripartono.
- **c** `[unit]` I personaggi si muovono anche senza viste collegate.
- **d** `[manuale]` Gli esempi del progetto, un controllore in Python e uno in JavaScript, guidano i loro personaggi come descritto nei loro commenti.

### PROTO-004 — Client esterni via WebSocket
- **a** `[unit]` Un client collegato al WebSocket dell'host può chiedere di guidare un personaggio che non ha già un controllore attivo, e da quel momento parla il protocollo di PROTO-001 e PROTO-002.
- **b** `[unit]` Alla chiusura del client il personaggio si ferma e può essere guidato da un altro client.

### PROTO-005 — Consenso e verifica dei comandi
- **a** `[unit]` Prima di lanciare i comandi dei controllori l'host li elenca nel terminale e chiede il consenso (Q1); senza consenso i personaggi restano fermi e l'host funziona comunque. L'opzione `--allow-commands` dà il consenso senza chiederlo.
- **b** `[unit]` All'avvio l'host verifica che il programma di ogni comando esista; un programma mancante è segnalato con il personaggio e il comando.

### PROTO-006 — Il mondo non aspetta i controllori
- **a** `[unit]` Un controllore lento non rallenta la simulazione: le percezioni non lette si sostituiscono con l'ultima, non si accumulano.
- **b** `[unit]` Ogni azione ha un tempo limite proporzionale al lavoro richiesto (per `walk_to`, alla lunghezza del percorso); scaduto, fallisce con la causa.

### PERF-005 — Personaggi
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Con 20 personaggi che camminano, ognuno con il suo controllore, valgono i budget di PERF-001.b nel browser (≥ 60 fps).
- **b** `[unit]` Con 20 personaggi un passo di simulazione dell'host costa al più 4 ms.

## Requisiti MODIFICATI

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, collegamento, modalità, posizione della camera, posizione e velocità del giocatore, se è a terra o in acqua, velocità della camera libera, seed, nome del file del mondo, numero di strutture per tipo, numero di avvisi, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione, durata dell'ultimo passo di simulazione.
- **Dopo:**
- **a** `[manuale]` Come prima, più: numero di personaggi e, per il personaggio più vicino, identificativo, controllore (tipo e stato) e azione in corso.
- **Motivo:** serve a capire cosa stanno facendo i personaggi e perché uno è fermo.

### HOST-001 — Host headless
- **Prima:** c `[unit]` Il terminale dell'host riporta: file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste.
- **Dopo:** criteri a e b invariati; il criterio c diventa:
- **c** `[unit]` Il terminale dell'host riporta: file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste, personaggi con il loro controllore, avvio e terminazione dei controllori.
- **Motivo:** con i controllori il terminale è il primo posto dove capire cosa succede senza browser (D-008).

## Requisiti RIMOSSI
Nessuno.

## Domande aperte
- **Q1** Consenso ai comandi: proposta **domanda nel terminale a ogni avvio** (elenco dei comandi, sì/no), `--allow-commands` per saltarla (test, script). Alternativa: ricordare il consenso per cartella finché i comandi non cambiano.
- **Q2** Aspetto: proposta **solo i colori** (pelle, capelli, maglia, pantaloni) con valori di default variati dal seed; altezze e fisionomie diverse più avanti.
- **Q3** Acqua nei percorsi: proposta **si nuota solo se l'alternativa asciutta è più lunga del doppio**, altrimenti si gira intorno.
- **Q4** Frequenza della percezione: proposta **4 volte al secondo**, più gli eventi immediati. Più alta costa ai controllori lenti; più bassa rende le reazioni tardive.
- **Q5** Azioni: proposta **una alla volta, la nuova sostituisce la vecchia**; il controllore mette in fila da sé. Alternativa: coda di azioni nell'host.
- **Q6** Interazione: proposta **tasto E** entro 3 m, al personaggio più vicino. La chat scritta con i personaggi arriva con il dialogo di F06.
- **Q7** Figura del giocatore: proposta **stessa figura animata** dei personaggi, al posto di quella statica di F03.
- **Q8** Stile del protocollo: proposta **`snake_case`** per azioni e campi, comodo in Python e negli strumenti MCP di F06, anche se il codice TypeScript usa `camelCase`.

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
