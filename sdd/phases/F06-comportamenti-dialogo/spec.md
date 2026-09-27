# F06 — Comportamenti, mappa e dialogo

| | |
|---|---|
| Stato | **approved** (G1, 2026-09-26) |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-26 |
| Piano | [plan.md](plan.md) (dopo G1) |

## Obiettivo
Un autore programma i personaggi direttamente nel file del mondo, con un linguaggio dichiarativo in YAML fatto di routine, reazioni agli eventi e stati: senza scrivere un programma e senza dare permessi. Ogni elemento del mondo ha un nome, una descrizione e un identificatore, e la mappa di tutti gli elementi è a disposizione dei personaggi: `walk_to: laghetto1` porta il personaggio sulla sponda del laghetto. Il giocatore parla con i personaggi dal browser, dal terminale dell'host o da un client esterno; un personaggio può fargli una domanda e usare la risposta. Mappa, mete e dialogo sono la base su cui F07 collegherà gli agenti LLM (D-009).

## Contesto
- D-009 (linguaggio dei comportamenti, mappa, dialogo; roadmap rinumerata) e costituzione: P2 (core deterministico), P3 (solo la fisica muove), P4 (YAML validato), P5 (registri tipizzati), P10 (i controllori esterni restano).
- Spec vive coinvolte: [world-file.md](../../specs/world-file.md), [characters.md](../../specs/characters.md), [protocol.md](../../specs/protocol.md), [navigation.md](../../specs/navigation.md), [structures.md](../../specs/structures.md), [host.md](../../specs/host.md), [debug.md](../../specs/debug.md), [performance.md](../../specs/performance.md).
- Oggi un personaggio sta fermo o è guidato da un programma esterno, che richiede il consenso; in modalità solo browser sta fermo (CHAR-001.d). Il giocatore interagisce solo con il tasto E (PROTO-002.c). `walk_to` e `follow` verso un'entità funzionano a qualunque distanza, la percezione arriva a 32 blocchi.
- Le scelte di fondo sono state fatte con l'utente prima della bozza (vedi «Decisioni prese prima della bozza»), quelle di dettaglio dopo (vedi «Domande risolte»).

## Fuori scope
- Agenti LLM, server MCP, interpretazione del linguaggio libero: F07.
- Espressioni, aritmetica e variabili di testo nel linguaggio dei comportamenti.
- Estensioni del linguaggio dichiarate nella cartella del mondo: eventi, condizioni e istruzioni nuovi si registrano solo da codice del progetto.
- Ora del giorno: le condizioni sul tempo usano il tempo di simulazione; il ciclo giorno/notte è in F08.
- Domande da un personaggio a un altro: una domanda attende solo il giocatore.
- Memoria dei personaggi che sopravvive alla ricarica del mondo o al riavvio dell'host.
- Lettura dei file in versione 1: si aggiornano a mano, guidati dall'errore (YAML-001.e).

## Storie utente
- **US-1** Come autore, descrivo nel file del mondo cosa fa un personaggio (un giro, un saluto, una risposta) senza scrivere un programma e senza dare permessi.
- **US-2** Come autore, scrivo un comportamento con parametri e lo uso per più personaggi, ognuno con i suoi valori.
- **US-3** Come autore, do nome e descrizione a mondo, luoghi, strutture e personaggi, e li uso come mete: `walk_to: laghetto1`.
- **US-4** Come autore di un controllore (e in F07 come agente LLM), ricevo la mappa del mondo e mando il personaggio verso un elemento per id.
- **US-5** Come giocatore, leggo cosa dicono i personaggi e scrivo loro; a un personaggio che chiede «Dove devo andare?» rispondo «laghetto1» e lui ci va.
- **US-6** Come utente senza browser, parlo con i personaggi dal terminale dell'host.

## Decisioni prese prima della bozza
Discusse con l'utente il 2026-09-26, punto per punto e con alternative (D-009).

| Tema | Decisione |
|---|---|
| Linguaggio e controllori | Il linguaggio affianca i controllori esterni: è il modo normale di programmare un personaggio; stdio e WebSocket restano |
| Modello | Una routine che si ripete, reazioni che la interrompono e poi la riprendono, stati facoltativi |
| Espressività | Vocabolario chiuso di eventi, condizioni e istruzioni, con flag e contatori; estendibile da codice con un registro tipizzato |
| Riuso | Libreria di comportamenti con nome e parametri tipizzati; un comportamento può anche essere scritto nel personaggio o in un file esterno |
| Nomi | `name` obbligatorio e `description` facoltativa per mondo, strutture, distribuzioni, luoghi e personaggi; per il giocatore il nome è facoltativo |
| Identificatori | `id` tecnico distinto dal nome: obbligatorio per personaggi e luoghi, facoltativo per strutture e distribuzioni |
| Distribuzioni | Nome e descrizione vanno alla distribuzione, non alle strutture che genera |
| Luoghi | Sezione nuova per punti e aree con nome che non sono strutture |
| Versione | Schema alla versione 2; la versione 1 è rifiutata con un errore che spiega cosa aggiungere |
| Mappa | Tutti gli elementi; per chi si muove identità e partenza, la posizione attuale solo con la percezione |
| Mete | Punto d'arrivo dichiarato dal tipo di struttura, altrimenti il bordo più vicino |
| Id non dichiarati | Generati, usabili da protocollo e dialogo; il file del mondo riferisce solo id dichiarati |
| Accesso alla mappa | Nel messaggio di benvenuto e alla ricarica del mondo |
| Dialogo | Parlato nello spazio, con destinatario (il personaggio guardato o `@id`); fumetti e registro |
| Domande | Istruzione di domanda con tempo limite e rami; reazioni alle frasi che nominano un elemento |
| Comprensione | Una frase nomina un elemento se ne contiene id o nome come parole intere, senza maiuscole e accenti; capita se ne nomina uno solo |
| Canali del dialogo | Browser, terminale dell'host, client esterno |

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### BEHAV-001 — Comportamenti dei personaggi
Un comportamento descrive in YAML cosa fa un personaggio; non contiene codice. Le sue parti sono **istruzioni**, per distinguerle dai passi della simulazione.
- **a** `[unit]` Un personaggio può dichiarare un comportamento (`behavior`) in tre modi: scritto nel personaggio, in un file YAML esterno indicato con un percorso relativo alla cartella del mondo, o come uso di un comportamento della libreria con i suoi parametri (BEHAV-006). Un percorso che esce dalla cartella del mondo è un errore.
- **b** `[unit]` Un personaggio dichiara al più uno tra comportamento e controllore; entrambi sono un errore.
- **c** `[unit]` I comportamenti si validano con il file del mondo: costrutti sconosciuti, campi mancanti o fuori intervallo, riferimenti a stati, flag, contatori o id inesistenti sono errori nel formato di YAML-002, con il file (anche esterno), la riga e il percorso del campo.
- **d** `[unit]` Il comportamento si esegue nel passo di simulazione: stesso mondo, stesso stato iniziale e stessa sequenza di intenzioni e frasi del giocatore producono le stesse azioni negli stessi passi (P2).
- **e** `[unit]` Un comportamento non avvia programmi e non richiede il consenso di PROTO-005.
- **f** `[e2e]` In modalità solo browser i personaggi con un comportamento agiscono come con l'host.
- **g** `[unit]` Alla ricarica del mondo, anche quando si salva un file di comportamenti esterno (HOST-003), i comportamenti ripartono dallo stato iniziale con la memoria vuota.

### BEHAV-002 — Routine e reazioni
- **a** `[unit]` Una routine è una sequenza di istruzioni eseguite una dopo l'altra: finita l'ultima, ricomincia dalla prima. Può essere dichiarata da eseguire una volta sola; finita, il personaggio sta fermo e le reazioni restano attive.
- **b** `[unit]` Un'istruzione è un'azione di PROTO-001.b (`walk_to`, `look_at`, `say`, `follow`, `wait`) con gli stessi campi e limiti, oppure una domanda (BEHAV-005), una modifica della memoria, un'istruzione condizionale con i suoi rami, un cambio di stato (BEHAV-003). In un comportamento `follow` dichiara una durata, e `walk_to` con un elenco di mete le visita in ordine, come altrettante istruzioni `walk_to` consecutive (A6.1).
- **c** `[unit]` Una reazione dichiara un evento, condizioni facoltative e una sequenza di istruzioni. Quando scatta sostituisce l'azione in corso ed esegue le sue istruzioni; poi la routine riprende dall'istruzione interrotta, che ricomincia (Q3).
- **d** `[unit]` Le reazioni hanno la priorità dell'ordine in cui sono dichiarate: una reazione interrompe quella in corso solo se viene prima; un evento che non può interrompere si ignora (Q1).
- **e** `[unit]` Una reazione può essere limitata a scattare al più una volta in un intervallo dichiarato, oppure una volta sola.
- **f** `[unit]` Se l'azione di un'istruzione fallisce (per esempio una meta irraggiungibile) si eseguono le istruzioni di fallimento dichiarate, se ci sono, altrimenti l'istruzione successiva; il terminale dell'host segnala il fallimento con il personaggio e la causa (Q4).
- **g** `[unit]` Un comportamento non blocca la simulazione: in un passo esegue al più 100 istruzioni che non durano (memoria, condizioni, cambi di stato); le altre proseguono al passo successivo, e il terminale dell'host segnala il personaggio che ha raggiunto il limite (Q11).

### BEHAV-003 — Stati
- **a** `[unit]` Un comportamento può dichiarare più stati con nome, ognuno con routine e reazioni, e lo stato iniziale. Senza stati, routine e reazioni formano un unico stato.
- **b** `[unit]` Il cambio di stato interrompe ciò che è in corso e avvia dall'inizio la routine del nuovo stato.
- **c** `[unit]` Le reazioni dichiarate fuori dagli stati valgono in tutti gli stati, dopo quelle dello stato corrente nell'ordine di priorità.

### BEHAV-004 — Eventi, condizioni e memoria
Il vocabolario è chiuso: eventi, condizioni e istruzioni hanno forme predefinite, senza espressioni.
- **a** `[unit]` Eventi: interazione del giocatore (tasto E); frase sentita, con filtri facoltativi su chi parla, se è rivolta al personaggio e se nomina un elemento della mappa (DIALOG-003); un'entità (il giocatore o un id) che entra in un raggio dal personaggio o ne esce; un'entità che entra in un'area della mappa (luogo o distribuzione) o ne esce; un tempo trascorso nello stato corrente. Entrare e uscire scattano al passaggio, non finché si resta dentro o fuori.
- **b** `[unit]` Nelle istruzioni di una reazione a una frase, chi ha parlato e l'elemento nominato si possono usare come mete delle azioni.
- **c** `[unit]` Condizioni: flag attivo o no; contatore uguale, minore o maggiore di un numero; un'entità entro un raggio; un'entità o il personaggio stesso dentro un'area della mappa; caso con una probabilità. Più condizioni devono valere tutte insieme.
- **d** `[unit]` La memoria di un personaggio è fatta di flag e contatori dichiarati nel comportamento; un nome non dichiarato è un errore. Le istruzioni li attivano, disattivano, impostano e incrementano.
- **e** `[unit]` Il caso è deterministico: dipende dal seed del mondo, dall'id del personaggio e dal tempo di simulazione (P2).
- **f** `[unit]` Codice esterno al core può registrare eventi, condizioni e istruzioni nuovi con il loro schema, senza modificare il core (P5); sono subito validati e utilizzabili nel YAML.

### BEHAV-005 — Domande al giocatore
- **a** `[unit]` Una domanda dice il testo come `say` e aspetta, fermo, una risposta del giocatore: una frase detta entro 16 blocchi e rivolta al personaggio, oppure senza destinatario se il personaggio è il più vicino al giocatore tra quelli che aspettano una risposta (a parità di distanza, il primo per id) (Q7). Il tempo limite si dichiara; per default è 30 s.
- **b** `[unit]` La domanda dichiara cosa si aspetta: un elemento della mappa, sì o no, oppure una tra opzioni dichiarate. La risposta si interpreta con le regole di DIALOG-003.
- **c** `[unit]` La domanda ha rami facoltativi per la risposta capita, non capita e mancante entro il tempo limite. Nel ramo della risposta capita l'elemento risposto si usa come meta delle azioni; per sì/no e per le opzioni c'è un ramo per ogni risposta. Senza il ramo corrispondente si prosegue con l'istruzione successiva.
- **d** `[unit]` La frase che risponde a una domanda non fa scattare reazioni.
- **e** `[unit]` Il testo di `say` e delle domande può citare il nome di un riferimento: il giocatore, chi ha parlato, l'elemento risposto o nominato (per esempio «Vado al Laghetto del mulino!») (Q9).

### BEHAV-006 — Libreria di comportamenti
- **a** `[unit]` La sezione `behaviors` del file del mondo, e i file YAML esterni che essa indica, dichiarano comportamenti con nome e parametri tipizzati (tipo, intervallo, default), come i tipi di struttura (STRUCT-001). Tipi dei parametri: numero, testo, durata, punto, id della mappa e liste di questi. Un nome ripetuto è un errore.
- **b** `[unit]` Un personaggio usa un comportamento della libreria per nome, con i suoi parametri: quelli omessi prendono il default; parametri sconosciuti, mancanti senza default o fuori intervallo sono errori nel formato di YAML-002.
- **c** `[unit]` Personaggi con lo stesso comportamento lo eseguono in modo indipendente: memoria e caso sono di ciascuno.

### BEHAV-007 — Esempi e guida
- **a** `[manuale]` Le cartelle di esempio contengono personaggi guidati da comportamenti, tra cui uno che chiede dove andare e ci va, e una folla di 20 personaggi con lo stesso comportamento della libreria; si comportano come descritto nei commenti.
- **b** `[manuale]` Una guida del linguaggio descrive ogni evento, condizione e istruzione con un esempio.

### MAP-001 — Identificatori
- **a** `[unit]` Personaggi, luoghi, strutture posate e distribuzioni condividono un unico spazio di identificatori: un id ripetuto è un errore nel formato di YAML-002. `player` è riservato al giocatore. L'id è obbligatorio per personaggi e luoghi, facoltativo per strutture e distribuzioni.
- **b** `[unit]` Una struttura o una distribuzione senza id ne riceve uno generato dal tipo e da un progressivo nell'ordine del file, nella forma `tipo#n`, che un id dichiarato non può avere: `n` conta da 1, per tipo, i soli elementi senza id (`pond#1`, `stone_farmhouse#2`; `scatter#1` per le distribuzioni) (Q10). Lo stesso file produce gli stessi id generati.
- **c** `[unit]` Il file del mondo, comportamenti compresi, può riferire solo id dichiarati: un riferimento a un id inesistente o generato è un errore. Protocollo e dialogo accettano anche gli id generati.

### MAP-002 — Mappa del mondo
- **a** `[unit]` La mappa contiene nome e descrizione del mondo e una voce per ogni luogo, struttura posata, distribuzione e personaggio, e per il giocatore, con id, nome, descrizione e tipo.
- **b** `[unit]` Per luoghi, strutture e distribuzioni la voce riporta la posizione e l'ingombro orizzontale (punto, rettangolo o cerchio), e per le strutture la quota della base. Per personaggi e giocatore riporta la posizione di partenza: la posizione attuale arriva solo con la percezione (PROTO-002.a).
- **c** `[unit]` Le strutture generate da una distribuzione non hanno una voce propria.
- **d** `[unit]` La mappa dipende solo dal file del mondo e dal codice registrato, ed è la stessa per tutti i personaggi e su tutti i canali (comportamenti, stdio, WebSocket).

### MAP-003 — Elementi della mappa come mete
- **a** `[unit]` `walk_to` e `look_at` accettano come meta l'id di qualunque elemento della mappa; `follow` solo quello di un personaggio o del giocatore, altrimenti l'azione fallisce con la causa. `look_at` verso un elemento esteso guarda il centro del suo ingombro.
- **b** `[unit]` Verso una struttura, `walk_to` arriva al punto d'arrivo dichiarato dal suo tipo: per le case davanti alla porta, all'esterno; per i laghetti sulla sponda, nel punto più vicino al personaggio; per gli alberi ai piedi del tronco. Senza un punto dichiarato, arriva al punto raggiungibile del bordo dell'ingombro più vicino al personaggio.
- **c** `[unit]` Verso un luogo-punto arriva al punto; verso un'area (luogo o distribuzione) al punto raggiungibile dell'area più vicino al personaggio. Se il personaggio è già dentro l'area l'azione è subito completata.
- **d** `[unit]` Un elemento senza punti raggiungibili fa fallire l'azione con la causa (NAV-001.c).

### DIALOG-001 — Il giocatore parla
- **a** `[e2e]` Nella vista che guida il giocatore, Invio apre una casella di testo; Invio dice la frase, Esc la annulla. Mentre la casella è aperta i tasti non muovono il giocatore né la visuale. Le viste che guardano non scrivono.
- **b** `[unit]` Una frase del giocatore (1–500 caratteri) è sentita dai personaggi entro 16 blocchi, come le frasi dei personaggi (PROTO-002.b), e compare nel registro (DIALOG-002).
- **c** `[unit]` Il destinatario è il personaggio indicato con `@id` all'inizio della frase; altrimenti il personaggio guardato, cioè il più vicino al centro della visuale entro 10° e 16 blocchi; altrimenti nessuno. Con un `@id` inesistente la frase non parte e il registro mostra l'errore.
- **d** `[manuale]` La frase del giocatore compare in un fumetto sopra la sua figura, visibile in terza persona e dalle viste che guardano (CHAR-002.c).

### DIALOG-002 — Registro delle conversazioni
- **a** `[e2e]` Ogni vista mostra il registro delle frasi che il giocatore sente, cioè dette entro 16 blocchi da lui, sue comprese, con il nome di chi parla e, se c'è, del destinatario. Le frasi del giocatore compaiono come «Tu» nella vista che guida e con il suo nome nelle viste che guardano (A6.2).
- **b** `[manuale]` Il registro mostra le ultime righe senza coprire la scena; le righe vecchie sbiadiscono e tornano visibili quando la casella di testo è aperta.

### DIALOG-003 — Comprensione delle frasi
Regole deterministiche, senza LLM, uguali per comportamenti e protocollo.
- **a** `[unit]` Una frase nomina un elemento della mappa se ne contiene l'id o il nome come parole intere, ignorando maiuscole, accenti e punteggiatura. Una corrispondenza contenuta in una più lunga non conta: con gli elementi «Casa» e «Casa del fabbro», «vai alla casa del fabbro» nomina solo il secondo.
- **b** `[unit]` Una risposta che attende un elemento è capita se la frase nomina esattamente un elemento; se non ne nomina nessuno o più di uno, non è capita.
- **c** `[unit]` Una risposta sì/no è capita se contiene parole di assenso o di diniego, in italiano o in inglese, ma non di entrambi i tipi (Q5). Una risposta a opzioni è capita se nomina esattamente una delle opzioni dichiarate, con le regole di a.
- **d** `[unit]` Stessa frase e stessa mappa danno sempre la stessa interpretazione.

### DIALOG-004 — Console dell'host
- **a** `[unit]` Il terminale dell'host mostra le frasi che il giocatore sente, con il nome di chi parla e del destinatario, come il registro della vista che guida: le frasi del giocatore compaiono come «Tu» (Q6, A6.2).
- **b** `[unit]` Una riga scritta nel terminale è detta dal giocatore con le regole di DIALOG-001.b; il destinatario si indica con `@id`.
- **c** `[unit]` La console si attiva solo se il terminale è interattivo, e dopo l'eventuale richiesta di consenso (PROTO-005).

### PROTO-007 — Parlare come giocatore
- **a** `[unit]` Un client collegato al WebSocket dell'host può parlare come il giocatore, con le regole di DIALOG-001.b e un destinatario facoltativo, e riceve le frasi che il giocatore sente.

### YAML-009 — Nomi e descrizioni
- **a** `[unit]` Il mondo, ogni struttura posata, distribuzione, luogo e personaggio dichiarano un nome (`name`, testo libero di 1–60 caratteri) e, facoltativa, una descrizione (`description`, al più 1000 caratteri) (Q8). Un nome mancante, vuoto o troppo lungo è un errore nel formato di YAML-002.
- **b** `[unit]` Il giocatore può dichiarare nome e descrizione; senza, il suo nome è «viandante» (Q8).
- **c** `[e2e]` Il titolo della pagina è il nome del mondo.

### YAML-010 — Luoghi
- **a** `[unit]` La sezione `places` dichiara luoghi con id, nome, descrizione facoltativa e forma: un punto, un rettangolo o un cerchio, come le aree di YAML-005. Un luogo che esce dal mondo è un errore nel formato di YAML-002.
- **b** `[unit]` I luoghi non modificano il mondo: lo stesso file con o senza luoghi produce lo stesso hash.

### PERF-006 — Comportamenti
Stesso hardware di riferimento di PERF-001.
- **a** `[unit]` Con 20 personaggi guidati da comportamenti un passo di simulazione dell'host costa al più 4 ms.

## Requisiti MODIFICATI

### YAML-001 — File del mondo
- **Prima:** a `[unit]` Un file del mondo dichiara la versione dello schema (`version`), il terreno (`terrain`) e, facoltative, le strutture (`structures`) e le distribuzioni (`scatter`). Una versione dello schema non gestita è un errore.
- **Dopo:** criteri b, c e d invariati; il criterio a diventa, e si aggiunge e:
- **a** `[unit]` Un file del mondo dichiara la versione dello schema (`version: 2`), nome e descrizione del mondo (YAML-009), il terreno (`terrain`) e, facoltativi, il giocatore (`player`), le strutture (`structures`), le distribuzioni (`scatter`), i luoghi (`places`), i personaggi (`characters`) e la libreria dei comportamenti (`behaviors`). Una versione dello schema non gestita è un errore.
- **e** `[unit]` Un file in versione 1 produce un errore che indica cosa aggiungere per passare alla versione 2.
- **Motivo:** nomi, luoghi e comportamenti cambiano lo schema; tutte le modifiche della fase stanno in un solo salto di versione.

### CHAR-001 — Personaggi nel file del mondo
- **Prima:** a `[unit]` La sezione `characters` del file del mondo dichiara personaggi con identificativo univoco, posizione orizzontale di partenza, orientamento facoltativo, aspetto facoltativo (colori di pelle, capelli, maglia, pantaloni) e controllore facoltativo. […] c `[unit]` Un personaggio senza controllore, o con il controllore fermo o assente, sta fermo. d `[e2e]` Le viste mostrano i personaggi nelle posizioni simulate dall'host; in modalità solo browser i personaggi compaiono fermi nella posizione di partenza.
- **Dopo:** criterio b invariato; i criteri a, c e d diventano:
- **a** `[unit]` La sezione `characters` del file del mondo dichiara personaggi con id (MAP-001), nome e descrizione (YAML-009), posizione orizzontale di partenza, orientamento facoltativo, aspetto facoltativo (colori di pelle, capelli, maglia, pantaloni) e, facoltativo, un comportamento (BEHAV-001) o un controllore. Id ripetuti e posizioni fuori dal mondo sono errori nel formato di YAML-002.
- **c** `[unit]` Un personaggio senza comportamento né controllore, o con il controllore fermo o assente, sta fermo.
- **d** `[e2e]` Le viste mostrano i personaggi nelle posizioni simulate dall'host. In modalità solo browser i personaggi con un comportamento agiscono (BEHAV-001.f), quelli con un controllore compaiono fermi nella posizione di partenza.
- **Motivo:** i personaggi hanno nome, descrizione e, in alternativa al controllore, un comportamento che gira anche senza host.

### STRUCT-001 — Registro delle strutture
- **Prima:** a `[unit]` Un tipo di struttura ha: nome univoco, schema dei parametri con tipi, intervalli e default, un generatore deterministico e un modo di adattamento al terreno (STRUCT-003).
- **Dopo:** criteri b, c e d invariati; il criterio a diventa:
- **a** `[unit]` Un tipo di struttura ha: nome univoco, schema dei parametri con tipi, intervalli e default, un generatore deterministico, un modo di adattamento al terreno (STRUCT-003) e, facoltativo, il punto d'arrivo per chi va verso la struttura (MAP-003.b).
- **Motivo:** `walk_to` verso una casa deve arrivare alla porta, non contro il muro; anche i tipi dell'autore possono dichiararlo (P5).

### PROTO-001 — Modello dei messaggi
- **Prima:** a `[unit]` Il primo messaggio al controllore dichiara la versione del protocollo, l'identificativo del personaggio e le misure del mondo. b `[unit]` Il controllore chiede azioni: `walk_to` (un punto o un'entità), `look_at`, `say`, `follow` (un'entità, a una distanza), `wait`, `stop`. […]
- **Dopo:** criteri c e d invariati; i criteri a e b diventano, e si aggiunge e:
- **a** `[unit]` Il primo messaggio al controllore dichiara la versione del protocollo, id, nome e descrizione del personaggio, le misure del mondo e la mappa (MAP-002).
- **b** `[unit]` Il controllore chiede azioni: `walk_to` (un punto o un elemento della mappa), `look_at` (un punto o un elemento della mappa), `say`, `follow` (un personaggio o il giocatore, a una distanza), `wait`, `stop`, con le mete di MAP-003. `walk_to` e `follow` accettano una velocità in m/s tra 0,5 e 7; senza, il personaggio cammina a 1,5 m/s. Ogni azione ha un identificativo e riceve un esito: completata, fallita con la causa, o sostituita.
- **e** `[unit]` Alla ricarica del mondo il controllore riceve la mappa nuova.
- **Motivo:** mappa e mete per id (D-009).

### PROTO-002 — Percezione
- **Prima:** a `[unit]` Il controllore riceve la percezione del personaggio 4 volte al secondo: posizione, orientamento, se è a terra o in acqua, azione in corso, entità entro 32 blocchi (identificativo, tipo, posizione, distanza). b `[unit]` Il controllore riceve subito gli eventi: frasi dette entro 16 blocchi (chi, cosa), interazione del giocatore, esito delle azioni.
- **Dopo:** criterio c invariato; i criteri a e b diventano:
- **a** `[unit]` Il controllore riceve la percezione del personaggio 4 volte al secondo: posizione, orientamento, se è a terra o in acqua, azione in corso, entità entro 32 blocchi (id, nome, tipo, posizione, distanza).
- **b** `[unit]` Il controllore riceve subito gli eventi: frasi dette entro 16 blocchi, anche dal giocatore (chi, cosa, destinatario, elemento della mappa nominato secondo DIALOG-003), interazione del giocatore, esito delle azioni.
- **Motivo:** il giocatore parla (DIALOG-001) e un controllore esterno deve capire le frasi con le stesse regole dei comportamenti.

### PROTO-004 — Client esterni via WebSocket
- **Prima:** a `[unit]` Un client collegato al WebSocket dell'host può chiedere di guidare un personaggio che non ha già un controllore attivo, e da quel momento parla il protocollo di PROTO-001 e PROTO-002. b `[unit]` Alla chiusura del client il personaggio si ferma e può essere guidato da un altro client.
- **Dopo:**
- **a** `[unit]` Un client collegato al WebSocket dell'host può chiedere di guidare un personaggio che non ha già un controllore attivo, anche se ha un comportamento: il comportamento si sospende finché il client lo guida (Q2). Da quel momento il client parla il protocollo di PROTO-001 e PROTO-002.
- **b** `[unit]` Alla chiusura del client il personaggio si ferma, o riprende il suo comportamento da dov'era: stesso stato, istruzione interrotta che ricomincia (BEHAV-002.c), memoria intatta (Q2). Poi può essere guidato da un altro client.
- **Motivo:** un client, e in F07 un agente, può prendere e restituire un personaggio che ha una routine.

### HOST-001 — Host headless
- **Prima:** c `[unit]` Il terminale dell'host riporta: file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste, personaggi con il loro controllore, avvio e terminazione dei controllori.
- **Dopo:** criteri a e b invariati; il criterio c diventa:
- **c** `[unit]` Il terminale dell'host riporta: nome e file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste, personaggi con il loro comportamento o controllore, avvio e terminazione dei controllori, azioni fallite dei comportamenti.
- **Motivo:** senza un processo esterno, il terminale è l'unico posto dove vedere perché un comportamento non procede.

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` Il tasto F3 mostra e nasconde un overlay con: […] numero di personaggi e, per il più vicino, identificativo, controllore (tipo e stato) e azione in corso, […].
- **Dopo:**
- **a** `[manuale]` Come prima; per il personaggio più vicino anche il nome e, se ha un comportamento, lo stato e l'istruzione in corso. Un pulsante con la X riduce l'overlay a un piccolo pulsante trasparente «Stats», che lo riapre; la pagina ricorda la scelta. F3 continua a mostrare e nascondere tutto, pulsante compreso (A6.3).
- **Motivo:** serve a capire a che punto è un comportamento; l'overlay aperto copre la scena, e si vuole ridurlo senza perderlo.

### CHAR-002 — Figura e animazioni
- **Prima:** criteri a–c (posa, animazioni leggibili, fumetto).
- **Dopo:** criteri a, b e c invariati; si aggiunge d:
- **d** `[e2e]` Sopra ogni personaggio entro 48 blocchi (24 m) compare il suo nome, e sopra il giocatore dove si vede la sua figura (terza persona, camera libera, viste che guardano); quando parla, il fumetto sta sopra il nome (A6.4).
- **Motivo:** nella demo non si capiva chi fosse chi.

## Requisiti RIMOSSI
Nessuno.

## Domande risolte
Chiuse con l'utente il 2026-09-26, prima di G1, in tre blocchi di scelte guidate. Si discostano dalla bozza: Q2 e Q7, per proposte corrette durante la revisione; Q8, per scelta dell'utente; Q11 aggiunge un avviso.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Priorità tra reazioni | Ordine di dichiarazione, senza code: gli eventi che non possono interrompere si ignorano; la reazione interrotta non riprende | BEHAV-002.d invariato |
| Q2 | Client esterno su un personaggio con comportamento | Il comportamento si sospende e riprende da dov'era, con la memoria intatta, come dopo una reazione (la bozza diceva: dall'inizio della routine) | PROTO-004.b precisato |
| Q3 | Ripresa dopo una reazione | L'istruzione interrotta ricomincia | BEHAV-002.c invariato |
| Q4 | Istruzione fallita | Istruzioni di fallimento facoltative, altrimenti la successiva; il terminale lo segnala | BEHAV-002.f invariato |
| Q5 | Sì e no | Lista fissa in italiano e inglese, nella guida. Assenso: sì, si, certo, ok, va bene, d'accordo, volentieri, yes, yeah, sure. Diniego: no, nope, nah. «non» non conta («non lo so» non è capita; la bozza lo contava) | DIALOG-003.c invariato |
| Q6 | Cosa mostra la console | Le frasi che il giocatore sente, come il registro del browser | DIALOG-004.a invariato |
| Q7 | Frase senza destinatario | Vale come risposta solo per il personaggio più vicino che aspetta, entro 16 blocchi (la bozza diceva: per tutti quelli che aspettano) | BEHAV-005.a precisato |
| Q8 | Limiti dei nomi | Nome di 1–60 caratteri, descrizione fino a 1000, giocatore «viandante» per default | YAML-009.a: descrizione da 500 a 1000 caratteri |
| Q9 | Nomi nei testi | Sì, solo i riferimenti: giocatore, chi ha parlato, elemento risposto o nominato | BEHAV-005.e invariato |
| Q10 | Forma degli id generati | `tipo#n`, progressivo per tipo che conta solo gli elementi senza id; `scatter#n` per le distribuzioni | MAP-001.b precisato |
| Q11 | Limite delle istruzioni istantanee | 100 per passo, con avviso nel terminale quando un personaggio lo raggiunge | BEHAV-002.g: aggiunto l'avviso |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
| A6.1 | 2026-09-26 | BEHAV-002.b | `walk_to` con un elenco di mete le visita in ordine, come altrettante istruzioni `walk_to` consecutive | Emerso scrivendo il piano: senza, un comportamento della libreria non può percorrere tappe ricevute come parametro di tipo lista (BEHAV-006.a) | sì, utente, 2026-09-26 (con G2) |
| A6.2 | 2026-09-26 | DIALOG-002.a, DIALOG-004.a | Le frasi del giocatore compaiono come «Tu» nella vista che guida e nella console, con il suo nome nelle viste che guardano | Emerso nella revisione del piano (P17): ognuno legge il registro dal proprio punto di vista | sì, utente, 2026-09-26 (con G2) |
| A6.3 | 2026-09-27 | DEBUG-001.a | Pulsante X che riduce l'overlay a «Stats», che lo riapre; scelta ricordata; F3 invariato | Alla demo l'overlay copriva la scena | sì, utente, 2026-09-27 |
| A6.4 | 2026-09-27 | CHAR-002.d (nuovo) | Nome sopra i personaggi entro 24 m, e sopra il giocatore dove si vede la sua figura; il fumetto sopra il nome | Alla demo non si capiva chi fosse chi | sì, utente, 2026-09-27 |
