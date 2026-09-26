# F05 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-26) |
| Versione | 0.1 |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-26 |

## Panoramica
Tutto ciò che decide il comportamento dei personaggi sta nel **core**, puro e testabile in Node: la dichiarazione nel file del mondo, la griglia di navigazione con la ricerca del percorso, l'esecuzione delle azioni (che producono solo intenzioni per la fisica, P3) e la costruzione della percezione. L'**host** tiene i personaggi nella sua sessione, li fa avanzare a ogni passo e li collega ai controllori: processi lanciati con il loro stdio, o client sul WebSocket. Il **browser** riceve le posizioni dei personaggi insieme a quella del giocatore e le disegna con una figura animata, che diventa anche quella del giocatore.

Il protocollo dei controllori è un insieme di messaggi JSON in `snake_case`, validati con la libreria di schema di F02 e documentati per gli autori con esempi in Python e JavaScript.

## Struttura del codice

```
src/
├─ core/
│  ├─ characters/
│  │  ├─ appearance.ts              colori dichiarati o derivati dal seed
│  │  └─ characters.ts              personaggi dal file del mondo, spawn
│  ├─ nav/
│  │  ├─ navGrid.ts                 livelli su cui si può stare, per angolo della griglia
│  │  ├─ pathfinding.ts             A* sui livelli, costi, acqua
│  │  └─ pathFollower.ts            percorso → intenzioni, blocco e ricalcolo
│  ├─ agents/
│  │  ├─ actions.ts                 walk_to, look_at, say, follow, wait, stop; esiti e tempi limite
│  │  ├─ perception.ts              percezione ed eventi di un personaggio
│  │  └─ agentWorld.ts              personaggi + fisica + azioni + eventi, passo per passo
│  ├─ yaml/worldFile.ts             + `characters`, aspetto di `player`
│  └─ compose/composeWorld.ts       + personaggi nel risultato
├─ protocol/
│  ├─ messages.ts                   + personaggi nello stato delle viste
│  └─ controller.ts                 messaggi dei controllori (PROTO-001) e loro schema
├─ host/
│  ├─ session.ts                    + AgentWorld, eventi, tasto E, terminale
│  ├─ controllers/stdio.ts          processo, righe JSON, stderr, uscita
│  ├─ controllers/socket.ts         WebSocket `/controller`
│  ├─ controllers/link.ts           collega un canale a un personaggio: percezione compressa, messaggi
│  └─ consent.ts                    consenso ricordato in ~/.yw3d, verifica dei programmi
├─ render/
│  ├─ pose.ts                       posa della figura dallo stato (funzione pura)
│  └─ figure.ts                     figura articolata, colori, fumetto
└─ app/                             personaggi dall'host, figure, fumetti, tasto E, overlay
examples/valle/                     mondo d'esempio con controllori in Python e JavaScript
docs/controllori.md                 il protocollo per gli autori
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Nodi della navigazione sugli **angoli** della griglia: un angolo è percorribile a un certo livello se le 4 colonne intorno hanno lì una superficie su cui stare (±1 blocco) con 4 blocchi liberi sopra | Nodi al centro delle colonne | Il personaggio è largo 1,2 blocchi: al centro di una colonna urta le pareti vicine; sull'angolo occupa le 4 colonne intorno. Una porta larga 2 ha esattamente un angolo al centro. |
| P2 | Più livelli per colonna (terreno, pavimento di una casa, tetto): la griglia salva fino a 4 livelli per angolo | Solo la superficie più alta | Dentro una casa la superficie più alta è il tetto: con un solo livello le case sarebbero irraggiungibili. |
| P3 | A* con euristica ottile (8 direzioni), diagonali solo se entrambi i lati sono percorribili; salita ≤ 1, discesa ≤ 3; costo dell'acqua ×2 (Q3) | Dijkstra; griglia a 4 direzioni | Ottimo e veloce; con costo doppio si nuota solo quando il giro asciutto è più lungo del doppio. |
| P4 | Griglia di navigazione calcolata una volta per mondo composto (host e test), in array tipizzati | Calcolo pigro per colonna | Il mondo è statico tra una ricarica e l'altra; la ricerca resta sotto i 50 ms (NAV-001.d). |
| P5 | Il percorso si segue puntando al prossimo nodo con direzione normalizzata; si salta un nodo quando è entro 0,4 blocchi; blocco = meno di 0,5 blocchi di progresso in 2 s → ricalcolo, 3 volte al più | Controllo di sterzo continuo | Semplice e deterministico; i gradini li sale la fisica (PHYS-005.b). |
| P6 | Azioni in un `AgentWorld` del core: una per personaggio, la nuova sostituisce la vecchia con esito `replaced`; tempi limite: `walk_to` = 2 × durata del percorso a passo + 5 s; `wait` = la sua durata; `say` = 1 s + 0,06 s per carattere | Coda di azioni | Q5; esiti sempre definiti (PROTO-001.b, PROTO-006.b). |
| P7 | Orientamento dei personaggi (per la figura e `look_at`) nello stato dell'`AgentWorld`, non nella fisica | Campo nella fisica | Guardare non è movimento: la fisica resta autorità solo sulla posizione (P3). |
| P8 | Percezione a 4 Hz sul tempo simulato; per canale si tiene **al più una percezione in attesa** e la si sostituisce con la più recente; gli eventi invece si accodano (fino a 100, poi si scartano i più vecchi con un avviso) | Accodare tutto | PROTO-006.a: un controllore lento non riceve un arretrato infinito, ma non perde gli esiti delle sue azioni. |
| P9 | Controllori stdio con `child_process.spawn(command, { shell: true, cwd: cartella })`; righe JSON su stdout, stderr nel terminale come `yw3d  [id] …`; alla ricarica i processi vengono chiusi e rilanciati | Worker thread; esecuzione senza shell | Il comando è scritto dall'autore come in un terminale (`python guardiano.py`); la shell risolve il `PATH` come si aspetta. |
| P10 | WebSocket dei controllori su un percorso separato, `/controller`; il primo messaggio del client è `{ "type": "control", "character": "…" }` | Stesso percorso delle viste | Viste e controllori parlano protocolli diversi: tenerli separati evita ambiguità e rende il canale documentabile da solo. |
| P11 | Consenso in `~/.yw3d/consent.json`: per ogni cartella (percorso assoluto) l'impronta SHA-256 dell'elenco ordinato dei comandi. Domanda nel terminale solo se è interattivo; altrimenti niente consenso senza `--allow-commands` | File nella cartella del mondo | PROTO-005.c: una cartella non può portarsi dietro il consenso; i test e gli script non restano appesi a una domanda. |
| P12 | Verifica dei comandi: il primo termine del comando si cerca nella cartella del mondo e nel `PATH` (con le estensioni di Windows) | Eseguire e osservare il fallimento | PROTO-005.b: il problema si segnala prima, con personaggio e comando. |
| P13 | Posa della figura da una funzione pura `pose(stato, fase, tempo)`; la fase della camminata avanza con la distanza percorsa, non col tempo | Animazioni a fotogrammi | CHAR-002.a testabile; gli arti restano coerenti con i passi a ogni velocità. |
| P14 | Fumetti come elementi HTML sopra la scena, posizionati proiettando la testa del personaggio; testo come nodo di testo (mai HTML) | Testo nella scena 3D | Testo nitido e senza dipendenze; il testo viene da un controllore esterno e non deve poter iniettare markup. |
| P15 | Lo stato delle viste porta, per ogni personaggio: id, posizione, orientamento, velocità orizzontale, a terra, in acqua, frase in corso | Messaggi separati per personaggio | Un messaggio per passo, come per il giocatore (F04 P8). |

## Protocollo dei controllori (versione 1)
Dall'host: `hello` (versione, personaggio, misure del mondo), `perception` (4 Hz), `heard`, `interacted`, `action_done`, `action_failed`, `action_replaced`, `error`. Dal controllore: `action` con `id` e una tra `walk_to` (`x`, `z` oppure `target`), `look_at` (`x`, `z` oppure `target`), `say` (`text`), `follow` (`target`, `distance`), `wait` (`seconds`), `stop`; sul WebSocket, come primo messaggio, `control` (`character`). Il dettaglio dei campi va in `docs/controllori.md`.

## Strategia di test
- **Unit (Vitest, Node).** Navigazione e percorsi sul mondo predefinito (case, laghetti, bordi); azioni, percezione ed eventi con un `AgentWorld` su mondi costruiti a mano; validazione dei messaggi; controllori stdio con piccoli script Node come controllori di prova; consenso con una cartella home temporanea; WebSocket dei controllori con un client `ws`.
- **E2E (Playwright).** Il mondo `e2e/host` si arricchisce di un personaggio con un controllore JavaScript di prova; l'host dei test parte con `--allow-commands`. CHAR-001.d nelle due modalità.
- **Manuale.** Checklist a T5.14 con fps con 20 personaggi e con gli esempi.

## Dipendenze nuove
Nessuna.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Ricerca del percorso lenta su 512 × 512 angoli con più livelli | NAV-001.d | Array tipizzati, coda a priorità binaria, misura sul mondo predefinito già in T5.02. |
| Personaggi incastrati in porte e angoli | NAV-002 | Nodi sugli angoli (P1); ricalcolo su blocco (P5); test che entra in ogni casa. |
| Processi figli lasciati attivi alla chiusura dell'host o alla ricarica | Processi orfani | Chiusura esplicita (`kill`) alla ricarica e all'uscita; test che controlla l'uscita dei processi. |
| Differenze tra sistemi nel lancio dei comandi (Windows) | PROTO-003 | Shell del sistema (P9); verifica del `PATH` con le estensioni di Windows (P12). |
| Consenso chiesto quando il terminale non è interattivo | Host bloccato | Nessuna domanda senza terminale interattivo (P11). |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T5.01** Personaggi nel file del mondo
  - Req: CHAR-001, YAML-008 · Dip: —
  - Sezione `characters` e aspetto di `player` nello schema; colori derivati dal seed; personaggi nel risultato della composizione; spawn come entità fisiche.
  - Fatto quando: test di CHAR-001.a–c e YAML-008.a verdi.

- [x] **T5.02** Griglia di navigazione e ricerca del percorso
  - Req: NAV-001 · Dip: —
  - `navGrid.ts` (P1, P2, P4), `pathfinding.ts` (P3); misura sul mondo predefinito.
  - Fatto quando: test di NAV-001.a–d verdi.

- [x] **T5.03** Esecuzione dei percorsi
  - Req: NAV-002 · Dip: T5.02, T5.01
  - `pathFollower.ts` (P5): intenzioni, arrivo, blocco e ricalcolo.
  - Fatto quando: test di NAV-002.a–b verdi, compreso un personaggio che entra in ogni casa del mondo predefinito.

- [x] **T5.04** Azioni, percezione ed eventi
  - Req: PROTO-001, PROTO-002, PROTO-006 · Dip: T5.03
  - `AgentWorld` (P6, P7): azioni con esiti e tempi limite, percezione a 4 Hz, frasi udite, interazione.
  - Fatto quando: test di PROTO-001.b–c, PROTO-002.a–b e PROTO-006.b verdi.

- [x] **T5.05** Messaggi dei controllori
  - Req: PROTO-001 · Dip: T5.04
  - `protocol/controller.ts`: tipi, schema, messaggi d'errore.
  - Fatto quando: test di PROTO-001.a e PROTO-001.d verdi.

- [x] **T5.06** Personaggi nell'host
  - Req: HOST-001, PROTO-002, PROTO-003, PERF-005 · Dip: T5.05
  - Sessione con `AgentWorld`, stato dei personaggi alle viste (P15), tasto E dal giocatore, terminale, misura del passo con 20 personaggi.
  - Fatto quando: test di HOST-001.c, PROTO-002.c, PROTO-003.c e PERF-005.b verdi.

- [x] **T5.07** Controllori su stdio
  - Req: PROTO-003, PROTO-006 · Dip: T5.06
  - `controllers/stdio.ts` e `link.ts` (P8, P9): avvio, righe JSON, stderr, uscita e blocco, rilancio alla ricarica.
  - Fatto quando: test di PROTO-003.a–b e PROTO-006.a verdi.

- [x] **T5.08** Consenso e verifica dei comandi
  - Req: PROTO-005, CLI-001 · Dip: T5.07
  - `consent.ts` (P11, P12), opzione `--allow-commands`.
  - Fatto quando: test di PROTO-005.a–c verdi.

- [x] **T5.09** Controllori via WebSocket
  - Req: PROTO-004 · Dip: T5.07
  - `controllers/socket.ts` (P10).
  - Fatto quando: test di PROTO-004.a–b verdi.

- [x] **T5.10** Figura animata
  - Req: CHAR-002 · Dip: —
  - `pose.ts` (P13) e `figure.ts`: parti articolate, colori, pose per fermo, camminata, corsa, salto, nuoto, parlata.
  - Fatto quando: test di CHAR-002.a verde; screenshot delle pose.

- [ ] **T5.11** Personaggi nelle viste
  - Req: CHAR-001, CHAR-002, DEBUG-001 · Dip: T5.06, T5.10
  - Figure dei personaggi e del giocatore, fumetti (P14), tasto E, overlay; modalità solo browser con personaggi fermi. **Punto di controllo con l'utente**: demo con un controllore di prova.
  - Fatto quando: si vedono i personaggi muoversi, parlare e reagire al tasto E.

- [ ] **T5.12** Esempi e documentazione
  - Req: PROTO-003 · Dip: T5.08, T5.09, T5.11
  - `examples/valle/` con il guardiano in Python e un secondo personaggio in JavaScript; `docs/controllori.md`; README aggiornato.
  - Fatto quando: `yw3d examples/valle` mostra la demo della roadmap.

- [ ] **T5.13** Test end-to-end
  - Req: CHAR-001 · Dip: T5.11
  - Personaggio con controllore di prova in `e2e/host`, host dei test con `--allow-commands`; CHAR-001.d nelle due modalità.
  - Fatto quando: `npm run e2e` verde.

- [ ] **T5.14** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T5.12, T5.13
  - `check`, `e2e`, `sdd:trace -- F05`; checklist dei criteri `[manuale]` con i valori misurati; spec vive; `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T5.01 ─────────────┐
T5.02 ─────────────┴─ T5.03 ─ T5.04 ─ T5.05 ─ T5.06 ─ T5.07 ─┬─ T5.08 ─┐
T5.10 ─────────────────────────────────────────┐              ├─ T5.09 ─┤
                                                └─ T5.11 ◄────┘         ├─ T5.12 ─┐
                                                   └──────── T5.13 ─────┴─────────┴─ T5.14
```
Punti di controllo: G2 prima di T5.01; demo a T5.11; G3 a T5.14.

## Modalità di esecuzione
Come nelle fasi precedenti: task in ordine senza fermarsi fino al punto di controllo di T5.11; commit a fine task solo con `npm run check` verde (codice di uscita); il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T5.02 | Acqua nei percorsi con due ricerche (prima ammessa l'acqua, poi all'asciutto entro il doppio della lunghezza) invece del costo ×2 di P3 | Il costo doppio confronta il giro asciutto con «diretto + tratto bagnato», non con il doppio del diretto come chiede Q3. Con le mete in acqua la ricerca asciutta si salta; la potatura usa l'euristica | Nessuno |
| T5.05 | Ogni azione è un tipo di messaggio (`{"type": "walk_to", "id": …}`) invece di un messaggio `action` con il tipo dentro | Più semplice da scrivere e da leggere per gli autori dei controllori; la validazione resta uno schema per tipo | Nessuno |
