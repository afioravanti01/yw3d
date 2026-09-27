# F07 — Console dei messaggi e personaggi in Python

| | |
|---|---|
| Stato | **approved** (G1, 2026-09-27) |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-27 |
| Piano | [plan.md](plan.md) |

## Obiettivo
Il giocatore interagisce con i personaggi da una **console dei messaggi** trasparente sulla destra di ogni vista: vede tutti i messaggi del mondo e scrive a un personaggio con `@nome`, a qualunque distanza, senza cercarlo né puntarlo. Gli autori programmano i personaggi in **Python**, con una libreria `yw3d` che fa da template: un programma si legge come la descrizione del personaggio. Il linguaggio dei comportamenti in YAML si rimuove (D-010).

## Contesto
- D-010 (personaggi in Python, console dei messaggi; supera il punto 1 di D-009) e costituzione v1.3: P3 (solo la fisica muove), P10 (controllori esterni, consenso), P2 (il core resta deterministico per mondo, fisica e navigazione).
- Spec vive coinvolte: [dialogue.md](../../specs/dialogue.md), [behaviors.md](../../specs/behaviors.md) (da rimuovere), [characters.md](../../specs/characters.md), [protocol.md](../../specs/protocol.md), [map.md](../../specs/map.md), [world-file.md](../../specs/world-file.md), [host.md](../../specs/host.md), [debug.md](../../specs/debug.md), [performance.md](../../specs/performance.md).
- Retro di F06: i criteri misuravano il funzionamento del linguaggio, non la comodità. Questa spec dichiara criteri sull'esperienza (PY-005, DIALOG-005.e) e il piano deve prevedere una prova d'uso presto (process.md).
- Il protocollo dei controllori (PROTO-001…007) e la mappa con le mete per id (MAP) restano: sono ciò su cui si appoggia la libreria Python.

## Fuori scope
- Agenti LLM e server MCP: F08.
- Comandi di programmazione nella console: in F07 si riserva solo la loro forma (DIALOG-005.f).
- Python nel browser: senza host i personaggi con un programma stanno fermi (D-010).
- Librerie per altri linguaggi: restano possibili tramite il protocollo, documentato in `docs/controllori.md`.
- Conversazioni tra personaggi guidate dalla libreria oltre a ciò che il protocollo già permette.

## Storie utente
- **US-1** Come giocatore, vedo tutti i messaggi del mondo in una console sulla destra, anche quelli detti lontano da me o mentre guardavo altrove.
- **US-2** Come giocatore, scrivo `@tobia dove vai?` e Tobia riceve il messaggio ovunque si trovi.
- **US-3** Come autore, copio il template dalla guida e scrivo un personaggio in Python in poche righe leggibili: un giro, un saluto, una risposta.
- **US-4** Come autore, metto il programma nella cartella del mondo, lo dichiaro nel YAML e lo vedo partire; se sbaglio, il terminale mi mostra l'errore con la riga.
- **US-5** Come autore di mondi fatti con F06, capisco dall'errore cosa cambiare per passare dai comportamenti in YAML ai programmi Python.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### DIALOG-005 — Console dei messaggi
- **a** `[e2e]` Ogni vista mostra sulla destra una console trasparente con tutti i messaggi del mondo, dal più vecchio in alto al più recente in basso: chi parla, a chi (se c'è) e il testo. I messaggi restano finché non si ricarica la pagina, e si scorrono.
- **b** `[e2e]` La console non ostacola il gioco: il mouse e i tasti agiscono sulla scena, tranne quando si scrive nella casella della console o se ne scorrono i messaggi.
- **c** `[e2e]` Nella vista che guida il giocatore, Invio apre la casella della console; Invio manda il messaggio, Esc la chiude. Mentre si scrive i tasti non muovono il giocatore né la visuale.
- **d** `[unit]` Un messaggio che inizia con `@` seguito dall'id o dal nome di un personaggio (maiuscole e accenti ignorati) è rivolto a quel personaggio; con nomi simili vale il più lungo che corrisponde. Un `@` che non corrisponde a nessun personaggio non parte e la console mostra l'errore con i nomi disponibili. Scrivendo `@` la console suggerisce i nomi, e Tab completa quello scelto.
- **e** `[manuale]` Scrivere a un personaggio è comodo: da qualunque punto del mondo, senza muoversi né puntarlo, si manda un messaggio a un personaggio in pochi secondi, e nessuna risposta si perde.
- **f** `[unit]` Un messaggio che inizia con `/` è un comando della console e non è detto nel mondo. In F07 c'è solo `/help`, che descrive l'uso della console; un comando sconosciuto mostra un errore che rimanda a `/help`.
- **g** `[manuale]` La console si riduce a un piccolo pulsante e si riapre, come l'overlay (DEBUG-001.a); la vista ricorda la scelta. I messaggi che arrivano mentre è ridotta si contano sul pulsante.

### PY-001 — Libreria Python
- **a** `[unit]` Un programma Python lanciato dall'host importa la libreria `yw3d` senza installare nulla: l'host la mette a disposizione del processo.
- **b** `[unit]` La libreria usa solo la libreria standard e funziona con Python 3.10 o successivo.
- **c** `[unit]` La libreria parla il protocollo dei controllori (PROTO-001, PROTO-002) al posto del programma: il programma non legge né scrive JSON.

### PY-002 — Struttura di un programma
- **a** `[unit]` Un personaggio è una classe che estende quella della libreria, con una **routine** che si ripete e **gestori** per i messaggi che riceve e per gli eventi; un programma avvia la classe con una sola istruzione.
- **b** `[unit]` Le azioni di PROTO-001.b (`walk_to`, `look_at`, `say`, `follow`, `wait`, `stop`) si chiamano come funzioni da attendere, con le mete della mappa (MAP-003); terminano quando l'azione è completata. Un'azione fallita solleva un'eccezione con la causa; un'azione sostituita non solleva errori.
- **c** `[unit]` Quando arriva un messaggio, il suo gestore interrompe la routine; finito il gestore, la routine riprende dall'azione interrotta.
- **d** `[unit]` Il programma legge dalla libreria, senza chiederli: posizione e stato del personaggio, entità vicine (PROTO-002.a), la mappa del mondo con id, nomi e descrizioni (MAP-002).
- **e** `[unit]` Un programma può fare una domanda al giocatore e attenderne la risposta con un tempo limite: la risposta arriva come messaggio, con l'elemento della mappa nominato e il sì o no capiti secondo DIALOG-003; senza risposta entro il tempo limite la domanda restituisce nulla.

### PY-003 — Programmi nella cartella del mondo
- **a** `[unit]` Un personaggio dichiara `program: <file.py>`, un percorso relativo alla cartella del mondo, in alternativa a `controller`. L'host lo lancia con l'interprete Python della macchina, con il consenso e la verifica di PROTO-005 (il comando mostrato è quello realmente eseguito).
- **b** `[unit]` Un file inesistente, fuori dalla cartella del mondo o non `.py` è un errore del file del mondo nel formato di YAML-002. Un interprete Python mancante o più vecchio di 3.10 è segnalato con il personaggio (PROTO-005.b).
- **c** `[unit]` Un'eccezione non gestita nel programma compare nel terminale con il file, la riga e il messaggio; il personaggio si ferma. Salvando il file Python il mondo si ricarica e il programma riparte (HOST-003).

### PY-004 — Esempi
- **a** `[manuale]` Le cartelle di esempio sono rifatte in Python e si comportano come descritto nei commenti: un personaggio che fa un giro, uno che chiede al giocatore dove andare e ci va, uno che risponde ai messaggi, e una folla di 20 personaggi con lo stesso programma.

### PY-005 — Guida ed esperienza d'uso
- **a** `[manuale]` Una guida spiega la struttura di un programma, ogni azione, la mappa, i messaggi e le domande, con esempi eseguibili; contiene un template commentato da copiare nella cartella del mondo (Q3).
- **b** `[manuale]` Partendo dal template, un personaggio con un giro di tre tappe, un saluto al giocatore quando si avvicina e una risposta a una domanda si scrive in meno di 40 righe, e si rilegge a colpo d'occhio: la routine è in cima, un gestore per ogni cosa a cui reagisce.

## Requisiti MODIFICATI

### DIALOG-001 — Il giocatore parla
- **Prima:** a `[e2e]` Invio apre una casella di testo […]. b `[unit]` Una frase del giocatore (1–500 caratteri) è sentita dai personaggi entro 16 blocchi […]. c `[unit]` Il destinatario è il personaggio indicato con `@id`; altrimenti il personaggio guardato […]; altrimenti nessuno. d `[manuale]` Fumetto sopra la figura del giocatore.
- **Dopo:** criterio d invariato; i criteri a, b e c diventano:
- **a** `[e2e]` Il giocatore scrive dalla console dei messaggi (DIALOG-005). Le viste che guardano leggono la console ma non scrivono.
- **b** `[unit]` Un messaggio senza destinatario (1–500 caratteri) è detto ad alta voce: lo sentono i personaggi entro 16 blocchi, come le frasi dei personaggi (PROTO-002.b). Un messaggio con `@` arriva al personaggio indicato a qualunque distanza, e lo sentono anche gli altri personaggi entro 16 blocchi dal giocatore.
- **c** `[unit]` Il destinatario è solo quello indicato con `@` (DIALOG-005.d): non conta più il personaggio guardato.
- **Motivo:** avvicinarsi e puntare un personaggio era scomodo (D-010).

### DIALOG-002 — Registro delle conversazioni
- **Prima:** a `[e2e]` Ogni vista mostra il registro delle frasi che il giocatore sente, entro 16 blocchi […]. b `[manuale]` Le ultime righe senza coprire la scena, le vecchie sbiadiscono […].
- **Dopo:**
- **a** `[e2e]` Il registro delle conversazioni è la console dei messaggi (DIALOG-005.a): contiene tutti i messaggi del mondo, a qualunque distanza dal giocatore. I messaggi del giocatore compaiono come «Tu» nella vista che guida e con il suo nome nelle viste che guardano.
- **Motivo:** i messaggi si perdevano se detti lontano o mentre si guardava altrove (D-010).

### DIALOG-003 — Comprensione delle frasi
- **Prima:** introduzione: «Regole deterministiche, senza LLM, uguali per comportamenti e protocollo.» Criteri a–d invariati.
- **Dopo:** introduzione: «Regole deterministiche, senza LLM, applicate dall'host a ogni frase: il risultato arriva ai controllori e ai programmi Python con l'evento della frase (PROTO-002.b).» Criteri a–d invariati; si aggiunge e:
- **e** `[unit]` L'evento di una frase riporta anche se la frase è un sì o un no secondo le regole di c.
- **Motivo:** senza linguaggio dei comportamenti, chi usa le regole è il programma che riceve la frase.

### DIALOG-004 — Console dell'host
- **Prima:** a `[unit]` Il terminale dell'host mostra le frasi che il giocatore sente […]. b `[unit]` Una riga scritta nel terminale è detta dal giocatore […]; il destinatario si indica con `@id`.
- **Dopo:** criterio c invariato; i criteri a e b diventano:
- **a** `[unit]` Il terminale dell'host mostra tutti i messaggi del mondo, come la console delle viste (DIALOG-005.a); i messaggi del giocatore compaiono come «Tu».
- **b** `[unit]` Una riga scritta nel terminale è un messaggio del giocatore con le regole di DIALOG-001.b e DIALOG-005.d (anche `@nome`), o un comando con quelle di DIALOG-005.f.
- **Motivo:** una sola console, uguale nel browser e nel terminale (D-010).

### PROTO-002 — Percezione
- **Prima:** b `[unit]` Il controllore riceve subito gli eventi: frasi dette entro 16 blocchi, anche dal giocatore (chi, cosa, destinatario, elemento della mappa nominato secondo DIALOG-003), interazione del giocatore, esito delle azioni. c `[unit]` Con il giocatore entro 3 m, il tasto E invia al personaggio più vicino un evento di interazione.
- **Dopo:** criterio a invariato; i criteri b e c diventano:
- **b** `[unit]` Il controllore riceve subito gli eventi: frasi dette entro 16 blocchi e messaggi rivolti al suo personaggio da qualunque distanza (chi, cosa, destinatario, elemento della mappa nominato e sì o no secondo DIALOG-003), interazione del giocatore, esito delle azioni.
- **c** `[unit]` (Q1) Con il giocatore entro 3 m, il tasto E invia al personaggio più vicino un evento di interazione.
- **Motivo:** i messaggi con `@` arrivano ovunque (DIALOG-001.b); il sì o no serve alle domande dei programmi (PY-002.e).

### PROTO-004 — Client esterni via WebSocket
- **Prima:** a `[unit]` […] anche se ha un comportamento: il comportamento si sospende finché il client lo guida […]. b `[unit]` Alla chiusura del client il personaggio si ferma, o riprende il suo comportamento […].
- **Dopo:**
- **a** `[unit]` Un client collegato al WebSocket dell'host può chiedere di guidare un personaggio che non ha già un controllore attivo, anche se ha un programma: il programma riceve un evento che lo avvisa e le sue azioni sono ignorate finché il client lo guida. Da quel momento il client parla il protocollo di PROTO-001 e PROTO-002.
- **b** `[unit]` Alla chiusura del client il personaggio si ferma, oppure torna al suo programma, che riceve un evento che lo avvisa. Poi può essere guidato da un altro client.
- **Motivo:** i comportamenti non esistono più; un programma deve sapere quando non guida il suo personaggio.

### CHAR-001 — Personaggi nel file del mondo
- **Prima:** a `[unit]` […] e, facoltativo, un comportamento (BEHAV-001) o un controllore. c `[unit]` Un personaggio senza comportamento né controllore […] sta fermo. d `[e2e]` […] In modalità solo browser i personaggi con un comportamento agiscono (BEHAV-001.f) […].
- **Dopo:** criterio b invariato; i criteri a, c e d diventano:
- **a** `[unit]` La sezione `characters` del file del mondo dichiara personaggi con id (MAP-001), nome e descrizione (YAML-009), posizione orizzontale di partenza, orientamento facoltativo, aspetto facoltativo (colori di pelle, capelli, maglia, pantaloni) e, facoltativo, un programma Python (PY-003) o un controllore (PROTO-003): non entrambi.
- **c** `[unit]` Un personaggio senza programma né controllore, o con il programma o il controllore fermo o assente, sta fermo.
- **d** `[e2e]` Le viste mostrano i personaggi nelle posizioni simulate dall'host; in modalità solo browser i personaggi compaiono fermi nella posizione di partenza.
- **Motivo:** i programmi Python sostituiscono i comportamenti (D-010).

### YAML-001 — File del mondo
- **Prima:** a `[unit]` Un file del mondo dichiara la versione dello schema (`version: 2`), […] i comportamenti della libreria (`behaviors`) […].
- **Dopo:** criteri b–e invariati; il criterio a diventa, e si aggiunge f:
- **a** `[unit]` Un file del mondo dichiara la versione dello schema (`version: 2`), nome e descrizione del mondo (YAML-009), il terreno (`terrain`) e, facoltativi, il giocatore (`player`), le strutture (`structures`), le distribuzioni (`scatter`), i luoghi (`places`) e i personaggi (`characters`). Una versione dello schema non gestita è un errore.
- **f** `[unit]` (Q7) Un file che usa ancora `behaviors` o `behavior` produce un errore che spiega che i comportamenti in YAML sono stati sostituiti dai programmi Python e rimanda alla guida.
- **Motivo:** la sezione dei comportamenti non esiste più.

### MAP-001 — Identificatori
- **Prima:** c `[unit]` Il file del mondo, comportamenti compresi, può riferire solo id dichiarati […].
- **Dopo:** criteri a, b e d invariati; il criterio c diventa:
- **c** `[unit]` Il file del mondo può riferire solo id dichiarati: un riferimento a un id inesistente o generato è un errore. Protocollo, programmi e dialogo accettano anche gli id generati.
- **Motivo:** i comportamenti non esistono più.

### MAP-002 — Mappa del mondo
- **Prima:** d `[unit]` La mappa […] è la stessa per tutti i personaggi e su tutti i canali (comportamenti, stdio, WebSocket).
- **Dopo:** criteri a–c invariati; il criterio d diventa:
- **d** `[unit]` La mappa dipende solo dal file del mondo e dal codice registrato, ed è la stessa per tutti i personaggi e su tutti i canali (stdio, WebSocket, programmi Python).
- **Motivo:** i comportamenti non esistono più.

### HOST-001 — Host headless
- **Prima:** c `[unit]` Il terminale dell'host riporta: […] personaggi con il loro comportamento o controllore […].
- **Dopo:** criteri a e b invariati; il criterio c diventa:
- **c** `[unit]` Il terminale dell'host riporta: nome e file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste, personaggi con il loro programma o controllore, avvio e terminazione dei programmi e dei controllori, errori dei programmi con file e riga.
- **Motivo:** i programmi Python sostituiscono i comportamenti.

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` […] per il più vicino […] e, se ha un comportamento, lo stato e l'istruzione in corso […].
- **Dopo:**
- **a** `[manuale]` Come prima, ma per il personaggio più vicino, invece di stato e istruzione del comportamento, il programma (file e stato: in esecuzione, fermo, in errore).
- **Motivo:** i programmi Python sostituiscono i comportamenti.

## Requisiti RIMOSSI
- **BEHAV-001 … BEHAV-007** — il linguaggio dei comportamenti in YAML è sostituito dai programmi Python (D-010).
- **PERF-006** — misurava il costo dei comportamenti nel passo di simulazione; il costo dei personaggi guidati da programmi resta coperto da PERF-005.

## Domande risolte
Chiuse con l'utente il 2026-09-27, prima di G1.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Tasto E | Resta come scorciatoia per il personaggio più vicino; la console è il modo principale | PROTO-002.c invariato |
| Q2 | Interprete Python | `python3` dal `PATH` (`python` su Windows), `--python <percorso>` per sceglierne un altro, verifica della versione ≥ 3.10 | PY-003.b invariato |
| Q3 | Template | Solo nella guida, commentato, da copiare; nessun comando `yw3d new` | PY-003.d tolto; PY-005.a e YAML-001.f rimandano alla guida |
| Q4 | Destinatario con `@` | Id o nome, il più lungo che corrisponde, con suggerimenti e Tab | DIALOG-005.d invariato |
| Q5 | Viste che guardano | Leggono la console ma non scrivono | DIALOG-001.a invariato |
| Q6 | Comandi | `/` riservato ai comandi, solo `/help` in F07 | DIALOG-005.f invariato |
| Q7 | Versione dello schema | Resta 2, con un errore che spiega la sostituzione dei comportamenti | YAML-001.f invariato |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
| A7.1 | 2026-09-27 | DIALOG-005.a, .c | a: la console è un blocco trasparente sempre presente sulla destra, con i messaggi in alto, che si accumulano, e la casella del giocatore in basso. c: la casella c'è sempre; Invio vi porta il cursore, Invio manda il messaggio, Esc torna al gioco; mentre si scrive i tasti non muovono il giocatore né la visuale. La × resta come in g | Alla prova d'uso la casella che compariva solo con Invio e i messaggi sparsi sulla destra non davano l'idea di una console | Utente, alla prova d'uso (richiesta diretta) |
| A7.2 | 2026-09-27 | DIALOG-005.f | Oltre a `/help` c'è `/world`: elenca il giocatore e i personaggi con la posizione attuale, i luoghi, le strutture e i gruppi di strutture con la loro posizione, in blocchi. Vale anche nel terminale dell'host (DIALOG-004.b) | Alla prova d'uso serviva sapere cosa c'è nel mondo e dove, per scrivere ai personaggi e mandarli nei posti | Utente, alla prova d'uso (richiesta diretta) |
| A7.4 | 2026-09-27 | DIALOG-005.a, .b, .f | a: la console è alta quanto la finestra; i messaggi sono testo libero, senza riquadro, selezionabile e copiabile, e si mostrano col Markdown (grassetto, corsivo, codice, elenchi, titoli, link http/https), senza mai inserire HTML. b: l'area dei messaggi prende il mouse, per scorrerli e selezionarli; fuori dalla console il mouse resta alla scena. f: la risposta di un comando è un unico blocco | Alla prova d'uso i messaggi nei riquadri scuri e `/world` spezzato in molte righe si leggevano male, e il testo non si poteva copiare | Utente, alla prova d'uso (richiesta diretta) |
| A7.5 | 2026-09-27 | DIALOG-001.b, DIALOG-005.e, PROTO-002.b | Un messaggio del giocatore con `@` arriva solo a un personaggio entro 16 blocchi dal giocatore; se il personaggio è più lontano il messaggio non parte e la console risponde «Personaggio non in prossimità». e: si scrive a un personaggio vicino senza puntarlo. PROTO-002.b: i messaggi rivolti al personaggio arrivano da qualunque distanza solo se li dice un altro personaggio (`say` con `to`). Rovescia il punto di D-010 sui messaggi a qualunque distanza | L'utente vuole parlare solo con chi ha vicino | Utente, alla prova d'uso (richiesta diretta) |
| A7.6 | 2026-09-27 | PROTO-002.b | Anche tra personaggi: `say` con `to` riesce solo se il destinatario (personaggio o giocatore) è entro 16 blocchi, altrimenti fallisce con la causa. Nessun messaggio arriva più da oltre 16 blocchi | Stessa regola per tutti; gli agenti dovranno avvicinarsi per parlarsi | Utente (richiesta diretta) |
| A7.7 | 2026-09-27 | PY-002.e, PY-004.a | e: un programma può fare una domanda al giocatore **o a un altro personaggio** e attenderne la risposta con un tempo limite. PY-004.a: tra gli esempi, un personaggio che su richiesta del giocatore va da un altro, gli fa una domanda, torna e riferisce la risposta; l'altro è esperto di un argomento (la pescatrice e i pesci) | I personaggi devono potersi parlare e aiutarsi, anche in vista degli agenti LLM (F08) | Utente (richiesta diretta) |
