# F06 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-26) |
| Versione | 0.2: decisioni riviste con l'utente |
| Spec | [spec.md](spec.md) v0.2, con A6.1 e A6.2 |
| Data | 2026-09-26 |

## Panoramica
Tutto ciò che decide cosa fa un personaggio resta nel **core**: la mappa del mondo, le mete per id, la comprensione delle frasi e il linguaggio dei comportamenti, compilato al caricamento del file del mondo ed eseguito a ogni passo. Un comportamento parla con l'`AgentWorld` di F05 come un controllore interno: chiede le stesse azioni e riceve gli stessi esiti, in modo sincrono e quindi deterministico.

Oggi la simulazione dei personaggi vive nella sessione dell'host, mentre in modalità solo browser la pagina simula soltanto il giocatore. Per avere lo stesso comportamento nei due casi (BEHAV-001.d, f) si estrae una **simulazione condivisa** nel core: fisica, giocatore, personaggi, comportamenti e dialogo. L'host la usa al posto del codice attuale, il browser senza host la usa al posto del solo giocatore locale.

Il **dialogo** è una funzione della simulazione: il giocatore dice una frase (dal browser, dalla console dell'host o da un client WebSocket), la simulazione ne ricava il destinatario, la fa sentire ai personaggi vicini, la consegna a chi aspetta una risposta e la registra per le viste. Il protocollo dei controllori passa alla versione 2 con la mappa, i nomi e il giocatore come client.

Il primo task porta tutti i file del mondo alla versione 2 dello schema, test compresi: da lì in poi ogni task lavora su file validi.

## Struttura del codice

```
src/
├─ core/
│  ├─ yaml/worldFile.ts             versione 2: nomi, id, luoghi, comportamenti; errore della v1
│  ├─ map/
│  │  ├─ worldMap.ts                voci della mappa, id generati, forme, punti d'arrivo
│  │  └─ goals.ts                   da un id della mappa a una meta: punto o insieme di colonne
│  ├─ structures/registry.ts        + `approach` facoltativo nel tipo (punto d'arrivo)
│  ├─ nav/pathfinding.ts            + ricerca verso un insieme di colonne
│  ├─ agents/agentWorld.ts          + mete della mappa, nomi, destinatario ed elemento nominato
│  ├─ dialogue/
│  │  ├─ understand.ts              normalizzazione, parole intere, sì/no, opzioni (DIALOG-003)
│  │  └─ speech.ts                  destinatario (`@id`, personaggio guardato), registro
│  ├─ behaviors/
│  │  ├─ registry.ts                istruzioni, eventi e condizioni registrabili (P5)
│  │  ├─ builtin.ts                 vocabolario predefinito
│  │  ├─ compile.ts                 YAML → programma; libreria, parametri, file esterni
│  │  └─ runner.ts                  esecuzione: pile, reazioni, stati, memoria, domande
│  ├─ sim/simulation.ts             fisica + giocatore + personaggi + comportamenti + dialogo
│  └─ compose/composeWorld.ts       + mappa, comportamenti compilati, lettore di file esterni
├─ protocol/
│  ├─ controller.ts                 versione 2: mappa, `map`, nomi, `heard` esteso, client giocatore
│  └─ messages.ts                   + frasi del giocatore e registro tra host e viste
├─ host/
│  ├─ session.ts                    usa la simulazione condivisa; terminale; ricarica
│  ├─ controllers/                  sospensione dei comportamenti; client come giocatore
│  ├─ console.ts                    console di dialogo sullo stdin interattivo
│  └─ watch.ts                      ricarica per ogni `.yaml` della cartella
└─ app/
   ├─ localSimulation.ts            modalità solo browser con la simulazione condivisa
   ├─ chat.ts                       casella di testo e registro delle conversazioni
   └─ main.ts, worlds.ts, …         titolo, file esterni, fumetto del giocatore, overlay
examples/valle, examples/paese      personaggi con comportamenti; folla con la libreria
docs/comportamenti.md               guida del linguaggio
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Una **simulazione condivisa** nel core (`Simulation`): fisica, giocatore, `AgentWorld`, comportamenti, dialogo. L'host la avanza con le intenzioni della vista che guida; il browser senza host la avanza da sé | Comportamenti solo nell'host; logica duplicata nella pagina | BEHAV-001.d e f: stesso comportamento con e senza host, un solo codice da testare |
| P2 | Forma delle istruzioni: un oggetto con una **chiave principale** (il nome dell'istruzione) e le opzioni come chiavi sorelle; forme brevi per i casi comuni (`- say: Ciao`, `- walk_to: casa_fabbro`, `- walk_to: [120, 100]`) | Sempre annidato (`walk_to: { target: … }`); istruzioni come stringhe (`"walk_to casa"`) | Si legge come gli esempi discussi con l'utente; ogni istruzione ha comunque uno schema, quindi gli errori restano puntuali. Parole chiave in inglese, come il resto del file del mondo e il protocollo; i testi restano liberi |
| P3 | **Registro tipizzato** di istruzioni, eventi e condizioni (`defineInstruction`, `defineEvent`, `defineCondition`), con schema e funzione di esecuzione; il vocabolario predefinito si registra allo stesso modo | Un `switch` chiuso nel runner | BEHAV-004.f e P5: estendere senza toccare il core, come le strutture |
| P4 | I comportamenti si **compilano al caricamento**: dal YAML a un programma con i riferimenti risolti (id della mappa, stati, flag e contatori, parametri). Gli errori usano la riga del file che li contiene, anche esterno | Interpretare il YAML durante l'esecuzione | BEHAV-001.c: nessun riferimento sbagliato arriva all'esecuzione; il runner resta semplice |
| P5 | Parametri della libreria come `$nome`, sostituiti alla compilazione per ogni personaggio, solo come valore intero di un campo; tipi `number`, `text`, `duration`, `point`, `id` e `list`. Le durate sono secondi o stringhe come `30s`, `2min` | Interpolazione dentro le stringhe; parametri valutati durante l'esecuzione | Nessuna espressione (vocabolario chiuso); i tipi si controllano una volta sola |
| P6 | Esecuzione a **pile**: la routine ha una pila di istruzioni (i rami di `if` e delle domande vi si annidano), una reazione ne ha una sua. Finita la reazione si torna alla pila della routine e l'istruzione in cima ricomincia (Q3). Un cambio di stato svuota le pile; la sospensione (Q2) le conserva | Un solo indice di istruzione | La ripresa funziona anche dentro un ramo o una domanda, con la stessa regola ovunque |
| P7 | Il comportamento è un **controllore interno** dell'`AgentWorld`: richieste con id interni, esiti come eventi sincroni nello stesso passo. Entrate e uscite da raggi e aree si calcolano a ogni passo per fronte. Budget di 100 istruzioni istantanee per passo, con un avviso per personaggio (Q11) | Canale dedicato; percezione a 4 Hz come i controllori esterni | Determinismo senza code; le reazioni scattano nel passo in cui avviene l'evento |
| P8 | Caso da `hash` di seed del mondo, id del personaggio, numero del passo e numero di estrazioni nel passo | Un generatore per personaggio con stato | BEHAV-004.e: il risultato dipende solo da ciò che dice la spec, anche dopo una sospensione |
| P9 | La **mappa** si costruisce nella composizione, quindi è uguale nell'host e nel browser. Le voci hanno forma (punto, rettangolo, cerchio), quota della base e partenza; gli id generati sono `tipo#n` (Q10). Nei messaggi è in `snake_case` | Mappa calcolata dall'host e inviata alle viste | MAP-002.d: dipende solo dal file; il browser senza host la ha comunque |
| P10 | **Punto d'arrivo** come insieme di colonne: il tipo di struttura può dichiarare `approach` (colonne locali, ruotate con la struttura). Case: le 2 colonne davanti alla porta; tipi a bacino: l'anello asciutto intorno all'acqua; alberi: le 4 colonne attorno al tronco; senza dichiarazione: l'anello intorno all'impronta. Aree: le loro colonne. La ricerca va verso **qualunque colonna dell'insieme** (A* con più mete, euristica verso il rettangolo che le contiene) e arriva alla più vicina lungo il percorso | La colonna più vicina in linea d'aria, poi il percorso verso di lei | In linea d'aria la colonna più vicina può stare dietro un muro; lungo il percorso «più vicino» significa ciò che il giocatore vede |
| P11 | **Comprensione**: minuscole, accenti tolti (Unicode NFD), punteggiatura come spazio tranne `#`, `_` e `-` dentro le parole; confronto per sequenze di parole intere; vince la corrispondenza più lunga; sì/no dalla lista di Q5 | Espressioni regolari scritte a mano per ogni nome; somiglianza approssimata | DIALOG-003: regole deterministiche, spiegabili nella guida |
| P12 | **Dialogo nella simulazione**: `playerSays(testo, { to?, view? })`. Un `@id` iniziale sceglie il destinatario; altrimenti il personaggio guardato (entro 10° dal centro della visuale e 16 blocchi, dagli occhi del giocatore); altrimenti nessuno. Prima si consegnano le risposte alle domande (Q7), poi le frasi sentite. Ogni frase, dei personaggi o del giocatore, produce una riga di registro | Destinatario calcolato dalla pagina | Stessa regola da browser, console e client; l'host conosce già la visuale di chi guida |
| P13 | **Protocollo dei controllori v2**: `hello` con `character: { id, name, description }` e `map`; messaggio `map` alla ricarica per i client WebSocket (i processi ripartono e ricevono un nuovo `hello`); `nearby[].name`; `heard` con `to` e `mentions`; client come giocatore: primo messaggio `{ "type": "player" }`, poi `say` con `text` e `to` facoltativo, e riceve le frasi che il giocatore sente | Versione 1 con campi in più | I campi nuovi cambiano il significato di `target`; dichiarare la versione costa poco |
| P14 | **File esterni** letti con un lettore sincrono passato alla composizione, con percorsi relativi alla cartella del mondo. Host: dal disco, rifiutando i percorsi fuori cartella; vista collegata: testi inviati dall'host nel messaggio del mondo; solo browser: `import.meta.glob('/worlds/**/*.yaml')`, e i mondi restano i soli file al primo livello di `worlds/` | Caricamento asincrono dentro la composizione | La composizione resta sincrona e pura; host e vista compongono dagli stessi testi, quindi lo stesso hash |
| P15 | L'host ricarica per **ogni `.yaml`** della cartella, non solo `world.yaml` | Seguire solo i file citati | Semplice; salvare un file non citato ricompone lo stesso mondo, senza danni |
| P16 | **Console**: un solo `readline` sullo stdin interattivo, condiviso con la domanda di consenso, che ha la precedenza. Una riga diventa una frase del giocatore; le frasi sentite si stampano con i nomi, come nel registro della vista che guida: `yw3d  Tobia: Dove devo andare?`, `yw3d  Tu → Tobia: laghetto1` | Due `readline` sullo stesso stdin | Due lettori sullo stesso stdin si rubano le righe; la domanda di consenso non deve perdere la risposta |
| P17 | **Browser**: casella HTML (Invio apre e invia, Esc annulla); mentre è aperta i controlli del giocatore sono spenti e i tasti premuti dimenticati. Registro HTML con le ultime 8 righe, che sbiadiscono dopo 15 s; le frasi del giocatore compaiono come «Tu» nella vista che guida e con il suo nome nelle viste che guardano. Testo sempre come nodo di testo. Fumetto del giocatore come per i personaggi; titolo della pagina dal nome del mondo | Chat nella scena 3D | Come i fumetti di F05 (P14): testo nitido, niente markup iniettabile |
| P18 | **Migrazione alla v2** con uno script una tantum, non versionato, su mondi, esempi e YAML dei test. L'errore della v1 elenca cosa aggiungere: `version: 2`, `name` del mondo, `name` di strutture, distribuzioni e personaggi | Leggere ancora la v1 | Fuori scope nella spec; i file da migrare sono solo quelli del progetto |

## Linguaggio dei comportamenti (sintesi)
La guida completa arriva con T6.15 (`docs/comportamenti.md`); qui c'è la forma che i task implementano.

```yaml
behaviors:                          # library (BEHAV-006)
  - name: giro
    params:
      tappe: { type: list, of: id }
      pausa: { type: duration, default: 3s }
    routine:
      - walk_to: $tappe             # visits them in order (A6.1)
      - wait: $pausa
  - file: comportamenti/comuni.yaml # a list of library behaviors

characters:
  - id: tobia
    name: Tobia
    at: [150, 70]
    behavior:                       # inline; or { file: … } or { use: giro, params: { … } }
      memory: { flags: [salutato], counters: [domande] }
      routine:
        - ask: Dove devo andare?
          expect: place             # place | yes_no | { one_of: [...] }
          timeout: 30s
          then:
            - say: Vado subito a {answer}!
            - walk_to: answer
              on_fail:
                - say: Non riesco ad arrivarci.
          not_understood:
            - say: Non conosco quel posto.
      reactions:
        - on: interacted
          once: true
          do:
            - look_at: player
            - say: Ciao {player}!
            - set: salutato
        - on: { heard: { from: player, mentions: any } }
          do:
            - walk_to: heard.mentions
```
Istruzioni predefinite: `walk_to`, `look_at`, `say`, `follow` (con `for`), `wait`, `ask`, `set` e `unset` (flag), `count` (contatori: `set`, `add`), `if` (`then`, `else`), `goto` (stato). Eventi: `interacted`, `heard`, `near` e `far` (raggio), `enter` e `leave` (area), `after` (tempo nello stato). Condizioni: `flag`, `counter`, `near`, `inside`, `chance`. Riferimenti: `player`, `answer`, `heard.from`, `heard.mentions`; nei testi `{player}`, `{speaker}`, `{answer}`, `{mentions}`.

## Emendamenti alla spec
Nati durante la revisione del piano e approvati dall'utente con G2; sono nel registro della spec.

- **A6.1 — BEHAV-002.b.** «`walk_to` con un elenco di mete le visita in ordine, come altrettante istruzioni `walk_to` consecutive.» Motivo: i parametri di tipo lista (BEHAV-006.a) servono soprattutto per i giri, e senza questa regola un comportamento della libreria non può percorrere tappe ricevute come parametro. È zucchero sintattico: nell'esecuzione restano istruzioni `walk_to` di PROTO-001.b, e la ripresa riparte dalla tappa interrotta.
- **A6.2 — DIALOG-002.a, DIALOG-004.a.** Le frasi del giocatore compaiono come «Tu» nella vista che guida e nella console, con il suo nome nelle viste che guardano (P16, P17).

## Protocollo dei controllori (versione 2)
Dall'host: `hello` (versione, personaggio con nome e descrizione, misure del mondo, mappa), `map` (alla ricarica), `perception` (con i nomi), `heard` (con `to` e `mentions`), `interacted`, esiti delle azioni, `error`. Dal controllore: le azioni di F05, con `target` che accetta ogni id della mappa. Sul WebSocket, come primo messaggio, `control` (un personaggio, anche con un comportamento) oppure `player` (parlare come il giocatore, poi messaggi `say`). Il dettaglio va in `docs/controllori.md`.

## Strategia di test
- **Unit (Vitest, Node).**
  - Schema v2, id e mappa su file costruiti nei test; punti d'arrivo su ogni casa e laghetto del mondo predefinito.
  - Comprensione con tabelle di frasi.
  - Compilazione con errori puntuali (file, riga, percorso), anche da file esterni in memoria.
  - Runner su mondi costruiti a mano, con un caso per ogni regola: interruzione a ogni livello di annidamento, priorità, ripresa, fallimento, limite, stati, fronti di raggi e aree, domande.
  - Determinismo: due esecuzioni della simulazione con la stessa sequenza di intenzioni e frasi.
  - Host: sessione, console con uno stdin finto, client WebSocket `ws` come giocatore e su un personaggio con comportamento.
  - PERF-006.a come PERF-005.b.
- **E2E (Playwright).**
  - Un mondo di prova con comportamenti in `e2e/worlds` (solo browser) e in `e2e/host`.
  - Si verificano casella e tasti (DIALOG-001.a), registro (DIALOG-002.a), personaggi che agiscono senza host (BEHAV-001.f, CHAR-001.d) e titolo della pagina (YAML-009.c).
- **Manuale.** Checklist a T6.17: esempi (BEHAV-007), guida, fumetto del giocatore (DIALOG-001.d), registro (DIALOG-002.b), overlay (DEBUG-001.a).
- **Criteri modificati.** `sdd:trace` considera coperti CHAR-001.a/c, PROTO-001.a/b, PROTO-002.a/b, PROTO-004.a/b, HOST-001.c e STRUCT-001.a già dai test di F05, che verificano il testo precedente. Per ciascuno si aggiorna o si aggiunge un test che verifica il testo nuovo; la checklist di T6.17 lo controlla uno per uno.

## Dipendenze nuove
Nessuna.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Il linguaggio cresce oltre il vocabolario chiuso | Complessità, spec tradita | Ogni istruzione, evento o condizione nuova passa dal registro e dalla guida; niente espressioni (spec, fuori scope) |
| Ripresa sbagliata dopo interruzioni annidate | BEHAV-002.c, Q2, Q3 | Modello a pile (P6) con un test per ogni livello di annidamento e per ogni tipo di istruzione |
| Host e browser divergono sul comportamento | BEHAV-001.d, f | Una sola `Simulation` (P1); test di determinismo in Node; e2e nel browser |
| Migrazione dei test alla v2 lunga o con errori | T6.01 | Script una tantum (P18), poi `npm run check` completo prima di proseguire |
| Stdin conteso tra consenso e console | Risposte perse, host bloccato | Un solo `readline` (P16); console solo con terminale interattivo (DIALOG-004.c) |
| Ricerca verso aree grandi (distribuzioni di migliaia di colonne) lenta | NAV-001.d, PERF-006.a | Insieme di mete come bit per nodo; euristica verso il rettangolo; misura sul mondo predefinito in T6.03 |
| Il refactoring dell'host rompe F04–F05 | Regressioni | T6.10 riusa i test esistenti di sessione, viste, ricarica e controllori senza cambiarne le attese |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T6.18+** Tempo limite dei test unitari
  - Req: — · Dip: —
  - Con tutti i file in parallelo, i test che compongono il mondo predefinito (PERF-005.b, YAML-005.c) superavano il limite predefinito di 5 s di Vitest; da soli passano in meno di 4 s. Limite portato a 30 s nella configurazione: i budget di tempo restano verificati dai test stessi.
  - Fatto quando: due esecuzioni di fila di `npm run check` verdi.

- [x] **T6.01** Schema della versione 2 e migrazione dei file
  - Req: YAML-001, YAML-009, YAML-010, CHAR-001, BEHAV-001 · Dip: —
  - Nomi e descrizioni (Q8) con il default del giocatore. Id facoltativo di strutture e distribuzioni. Sezione `places` e campi `behavior` e `behaviors` (il contenuto si valida in T6.05). Comportamento e controllore esclusivi. Errore della v1 (P18). Migrazione di mondi, esempi e test.
  - Fatto quando: test di YAML-001.a e .e, YAML-009.a–b, YAML-010.a–b, CHAR-001.a, BEHAV-001.b verdi; `npm run check` verde con tutti i file in v2.

- [x] **T6.02** Identificatori e mappa del mondo
  - Req: MAP-001, MAP-002, STRUCT-001 · Dip: T6.01
  - Unico spazio di id, `player` riservato, id generati (Q10). Mappa nel risultato della composizione (P9). `approach` nel tipo di struttura e punti d'arrivo di case, laghetti e alberi (P10).
  - Fatto quando: test di MAP-001.a–b, MAP-002.a–d, STRUCT-001.a verdi.

- [x] **T6.03** Mete della mappa
  - Req: MAP-003, PROTO-001 · Dip: T6.02
  - Ricerca verso un insieme di colonne (P10). L'`AgentWorld` risolve gli id della mappa per `walk_to`, `look_at` e `follow`, e completa subito un `walk_to` quando si è già dentro l'area. Misura sul mondo predefinito.
  - Fatto quando: test di MAP-003.a–d e PROTO-001.b verdi; da ogni punto del borgo si arriva davanti alla porta di ogni casa.

- [ ] **T6.04** Comprensione delle frasi
  - Req: DIALOG-003 · Dip: T6.02
  - `understand.ts` (P11).
  - Fatto quando: test di DIALOG-003.a–d verdi.

- [ ] **T6.05** Linguaggio dei comportamenti: registro e compilazione
  - Req: BEHAV-001, BEHAV-002, BEHAV-003, BEHAV-004, MAP-001 · Dip: T6.02
  - Registro (P3) e vocabolario predefinito; forma delle istruzioni (P2); compilazione con i riferimenti (P4); memoria dichiarata; stati.
  - Fatto quando: test di BEHAV-001.c, BEHAV-004.f, MAP-001.c e degli errori di BEHAV-003 e BEHAV-004.d verdi.

- [ ] **T6.06** Libreria, parametri e file esterni
  - Req: BEHAV-001, BEHAV-006 · Dip: T6.05
  - Sezione `behaviors`, `use` con parametri (P5), comportamenti in file esterni con il lettore (P14), percorsi fuori dalla cartella; `walk_to` con un elenco di mete (A6.1).
  - Fatto quando: test di BEHAV-001.a e BEHAV-006.a–b verdi.

- [ ] **T6.07** Esecuzione dei comportamenti
  - Req: BEHAV-002, BEHAV-003, BEHAV-004, BEHAV-006 · Dip: T6.03, T6.06
  - Runner (P6, P7, P8): routine, reazioni con priorità, ripresa, fallimenti, limite con avviso, stati, eventi, condizioni, memoria, caso, `follow` con durata.
  - Fatto quando: test di BEHAV-002.a–g, BEHAV-003.a–c, BEHAV-004.a e .c–e, BEHAV-006.c verdi.

- [ ] **T6.08** Domande e frasi nei comportamenti
  - Req: BEHAV-004, BEHAV-005 · Dip: T6.04, T6.07
  - `ask` con attese, rami e tempo limite; la risposta come meta; le risposte non fanno scattare reazioni; riferimenti nelle reazioni alle frasi; nomi nei testi (Q9).
  - Fatto quando: test di BEHAV-004.b e BEHAV-005.a–e verdi.

- [ ] **T6.09** Simulazione condivisa e dialogo nel core
  - Req: BEHAV-001, DIALOG-001, PROTO-002, PERF-006 · Dip: T6.08
  - `Simulation` (P1); frasi del giocatore con destinatario e registro (P12); frasi sentite con destinatario ed elemento nominato; nomi nella percezione; misura con 20 personaggi.
  - Fatto quando: test di BEHAV-001.d–e, DIALOG-001.b–c, PROTO-002.a–b, PERF-006.a verdi.

- [ ] **T6.10** Host con la simulazione condivisa
  - Req: HOST-001, BEHAV-001, CHAR-001 · Dip: T6.09
  - La sessione usa la `Simulation`. Terminale: nome del mondo, comportamenti, azioni fallite, limite raggiunto. Ricarica per ogni `.yaml` (P15), con i comportamenti che ripartono. Frasi alle viste filtrate sul giocatore.
  - Fatto quando: test di HOST-001.c, BEHAV-001.g, CHAR-001.c verdi; test di F04 e F05 verdi senza cambiarne le attese.

- [ ] **T6.11** Protocollo dei controllori, versione 2
  - Req: PROTO-001, PROTO-002, PROTO-004, PROTO-007 · Dip: T6.10
  - P13: `hello` con nome e mappa, `map` alla ricarica, client su un personaggio con comportamento (sospensione e ripresa, Q2), client come giocatore.
  - Fatto quando: test di PROTO-001.a e .e, PROTO-004.a–b, PROTO-007.a verdi.

- [ ] **T6.12** Console dell'host
  - Req: DIALOG-004 · Dip: T6.10
  - `console.ts` e `readline` condiviso con il consenso (P16).
  - Fatto quando: test di DIALOG-004.a–c verdi.

- [ ] **T6.13** Modalità solo browser con la simulazione condivisa
  - Req: BEHAV-001, CHAR-001, YAML-009 · Dip: T6.09
  - `localSimulation.ts` al posto del solo giocatore locale; file esterni (P14) nella modalità solo browser e nel messaggio del mondo; titolo della pagina.
  - Fatto quando: senza host un personaggio con comportamento cammina e parla; stesso hash della vista collegata con file esterni.

- [ ] **T6.14** Dialogo nelle viste
  - Req: DIALOG-001, DIALOG-002, DEBUG-001 · Dip: T6.10, T6.13
  - `chat.ts` (P17): casella, registro, spettatori; fumetto del giocatore; messaggi tra viste e host; overlay con nome, stato e istruzione.
  - Fatto quando: si parla con un personaggio dal browser, con e senza host.

- [ ] **T6.15** Esempi e guida
  - Req: BEHAV-007 · Dip: T6.11, T6.12, T6.14
  - Esempi:
    - `examples/valle`: nomi e luoghi; Tobia che chiede dove andare; un personaggio con stati e reazioni.
    - `examples/paese`: 20 abitanti con un comportamento della libreria in un file esterno.
    - `examples/folla` resta con i processi (PERF-005.a), in v2.
  - Documenti: `worlds/README.md`, `docs/comportamenti.md`, `docs/controllori.md`, README.
  - **Punto di controllo con l'utente**: la demo della roadmap.
  - Fatto quando: `yw3d examples/valle` mostra la demo; la guida copre ogni istruzione, evento e condizione.

- [ ] **T6.16** Test end-to-end
  - Req: DIALOG-001, DIALOG-002, BEHAV-001, CHAR-001, YAML-009 · Dip: T6.14
  - Mondi di prova con comportamenti in `e2e/worlds` e `e2e/host`.
  - Fatto quando: `npm run e2e` verde, con DIALOG-001.a, DIALOG-002.a, BEHAV-001.f, CHAR-001.d, YAML-009.c.

- [ ] **T6.17** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T6.15, T6.16
  - `check`, `e2e`, `sdd:trace -- F06`; checklist dei criteri `[manuale]`; spec vive (nuove: `behaviors.md`, `map.md`, `dialogue.md`); `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T6.01 ─ T6.02 ─┬─ T6.03 ──────────────────┐
               ├─ T6.04 ──────────────────┼────────┐
               └─ T6.05 ─ T6.06 ─ T6.07 ◄─┘        │
                                    └─ T6.08 ◄─────┘
                                         └─ T6.09 ─┬─ T6.10 ─┬─ T6.11 ─┐
                                                   │         ├─ T6.12 ─┤
                                                   └─ T6.13 ─┴─ T6.14 ─┼─ T6.15 ─┐
                                                                       └─ T6.16 ─┴─ T6.17
```
Punti di controllo: G2 prima di T6.01; demo a T6.15; G3 a T6.17.

## Modalità di esecuzione
Come nelle fasi precedenti: task in ordine senza fermarsi fino al punto di controllo di T6.15; commit a fine task solo con `npm run check` verde (codice di uscita); il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T6.03 | Verso un'area il personaggio si ferma su un posto che sta tutto dentro l'area (le 4 colonne che occupa), verso una struttura su un posto che tocca le sue colonne d'arrivo | Con il solo «tocca» il personaggio poteva fermarsi sul bordo, fuori dall'area, e un secondo `walk_to` non risultava «già dentro» (MAP-003.c) | Nessuno |
