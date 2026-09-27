# F08 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-27) |
| Versione | 0.1 |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-27 |

## Panoramica
L'agente è un **controllore interno dell'host**: riceve eventi e percezione del suo personaggio come un controllore stdio, decide quando interrogare l'LLM, costruisce il contesto del mondo, legge la risposta strutturata e la esegue con le azioni dei personaggi (`AgentWorld`). Non c'è nessun programma dell'autore e nessun Python.

Il **cervello** è un'interfaccia con più realizzazioni: tre CLI in modalità headless (Claude Code, Codex, opencode), due API (Anthropic, compatibile OpenAI) e un cervello finto (`fake`) per i test e per provare un mondo senza LLM. Contesto, risposta e regole (quando chiedere, una richiesta alla volta, tempi, frequenza, memoria) non dipendono dal cervello, e si provano tutte con quello finto.

Il primo task verifica sulle CLI e sulle API reali le opzioni per modello, effort e risposta strutturata. A metà fase c'è la **prova d'uso**: l'utente parla con un agente Claude Code vero, prima degli altri cervelli, degli esempi e della guida.

## Struttura del codice

```
src/
├─ core/
│  ├─ yaml/worldFile.ts             `agent` del personaggio: modalità, cli/fornitore, modello, effort…
│  └─ compose/composeWorld.ts       configurazione dell'agente in `CharacterStart`
├─ host/
│  ├─ agents/
│  │  ├─ context.ts                 contesto del mondo per l'LLM: identità, mappa, dintorni, memoria
│  │  ├─ reply.ts                   schema della risposta, validazione, parti scartate
│  │  ├─ runtime.ts                 l'agente: quando chiedere, una richiesta alla volta, esecuzione
│  │  ├─ brain.ts                   interfaccia del cervello, tempo limite, errori
│  │  └─ brains/
│  │     ├─ fake.ts                 risposte fisse, senza LLM
│  │     ├─ claude.ts, codex.ts, opencode.ts   CLI in modalità headless
│  │     └─ anthropic.ts, openai.ts            API
│  ├─ session.ts                    avvio degli agenti con consenso; stato per l'overlay
│  └─ consent.ts                    gli agenti nell'elenco del consenso
├─ protocol/messages.ts             stato dell'agente nell'istantanea del personaggio
└─ app/main.ts                      overlay con l'agente del personaggio più vicino
examples/agenti/                    la pescatrice agente, con le varianti commentate
docs/agenti.md                      guida
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | L'agente è un `ControllerSink` dell'host, come i controllori stdio: gli arrivano eventi e percezione, e chiede azioni all'`AgentWorld` | Un processo figlio per agente | Nessun programma in più; stessa via (fisica, distanze, esiti) degli altri controllori |
| P2 | **Cervello** come interfaccia: `think(richiesta, segnale di annullamento) → testo della risposta`. Ogni realizzazione rispetta il tempo limite e l'annullamento | Codice separato per ogni CLI dentro il runtime | Il runtime si prova tutto con il cervello finto; aggiungere un cervello non tocca le regole |
| P3 | **Contesto** come un unico testo: istruzioni fisse (in inglese: chi sei, il mondo prima delle tue conoscenze, rispondi nella lingua di chi ti parla, rispondi solo nella forma richiesta) più i dati del mondo in JSON: identità, posizione e luoghi in cui si trova, mappa, dintorni entro 32 blocchi con distanza e direzione in otto settori, tempo, memoria, ciò che ha fatto scattare la richiesta | Messaggi separati per ruolo; solo testo libero | Uguale per CLI e API; il JSON è compatto e non ambiguo per coordinate e id |
| P4 | **Risposta**: `{ say?: { text, to? }, actions?: [ { type, target? , x?, z?, distance?, seconds? } ] }`, al più 5 azioni tra `walk_to`, `look_at`, `follow`, `wait`, `stop`. Si esegue prima la frase, poi le azioni in ordine, ognuna al termine della precedente. Una nuova risposta ferma la sequenza in corso | Una sola azione per risposta | «Seguimi» e poi `walk_to` è il caso della demo |
| P5 | **Risposta strutturata** dove il cervello la offre: Claude Code `--json-schema`, Codex `--output-schema` (da verificare, T8.01), Anthropic con uno strumento obbligato che ha lo schema come input, compatibile OpenAI con `response_format` `json_schema`. Altrimenti (opencode, servizi che non la gestiscono) istruzione nel contesto ed estrazione del primo oggetto JSON dal testo | Solo estrazione dal testo | Meno risposte scartate dove il cervello può garantirle |
| P6 | **CLI**: un processo per richiesta, contesto sullo stdin, senza sessione salvata (`--no-session-persistence` per Claude Code), senza strumenti (niente file né comandi: per Claude Code gli strumenti disattivati, per Codex sandbox in sola lettura), con cartella di lavoro temporanea fuori dalla cartella del mondo. Al tempo limite il processo si termina | Una sessione della CLI tenuta aperta | Più semplice e sicuro: un agente non può toccare file; il costo è la partenza della CLI a ogni richiesta, coperto dal tempo limite di 60 s |
| P7 | **Effort** `low`/`medium`/`high`: Claude Code `--effort`; Codex `-c model_reasoning_effort=…` (da verificare); opencode e servizi senza effort: avviso una volta; Anthropic e OpenAI: il parametro dell'API per il ragionamento (da verificare, T8.01) | Valori propri di ogni cervello nel YAML | Un solo vocabolario per l'autore (Q6) |
| P8 | **Quando chiedere** (Q1): messaggio con `to` uguale all'agente; tasto E; giocatore che entra entro 8 blocchi dopo essere stato oltre 16 per almeno 60 s. Autonomia: a ogni intervallo, se non ha azioni in corso né richieste in attesa. Tra agenti: un contatore di scambi consecutivi con altri agenti, azzerato da ogni evento del giocatore; a 4 i messaggi degli agenti non fanno più partire richieste (Q5) | Chiedere a ogni frase sentita | Costi contenuti; nessuna conversazione infinita |
| P9 | **Una richiesta alla volta**; ciò che arriva nel frattempo si accoda e confluisce nella richiesta successiva come elenco di eventi. **Frequenza**: finestra scorrevole di 60 s con al più 6 richieste (Q4) | Una richiesta per evento | AGENT-006.b–d |
| P10 | **Memoria**: gli ultimi 12 eventi della sessione (messaggi sentiti e detti, azioni con esito), nel contesto. Si perde alla ricarica (Q3) | Riassunti generati dall'LLM | Semplice e prevedibile; F08 non ha memoria persistente |
| P11 | **Cervello finto** (`mode: fake`): risposte deterministiche calcolate dal contesto. A «vedi/guardi/intorno» descrive i dintorni; a una frase che nomina un elemento della mappa risponde e ci va; altrimenti ripete il messaggio. Serve ai test (anche e2e) e a provare un mondo senza chiavi | Risposte scritte nel YAML | Mostra il circuito completo (contesto → risposta → azioni) senza LLM |
| P12 | **Consenso**: gli agenti entrano nell'elenco di PROTO-005 come righe `agent: claude (modello predefinito)`, `agent: anthropic claude-… (ANTHROPIC_API_KEY)`, e nell'impronta; l'agente `fake` non chiede consenso | Consenso separato per gli agenti | Una sola domanda per cartella, come oggi |
| P13 | **Chiavi**: lette dall'ambiente dell'host al momento della richiesta; mai nei log, negli errori (i messaggi d'errore delle API si ripuliscono), nelle istantanee | Chiave nel YAML | AGENT-001.c; il file del mondo va in git |
| P14 | **Stato per l'overlay**: `agent: { mode, brain, model, state, last_ms }` nell'istantanea del personaggio; `state` tra `idle`, `thinking`, `acting`, `stopped`, `error` | Solo nel terminale | DEBUG-001.a |
| P15 | **Test senza rete**: CLI finte (script nel `PATH` di un test che registrano gli argomenti e rispondono), un server HTTP locale al posto delle API. Le chiamate vere solo in T8.01 e alla prova d'uso, con il consenso dell'utente | Chiamate vere nei test | Niente costi né dipendenze dalla rete in `npm run check` |

## Strategia di test
- **Unit (Vitest).**
  - Schema `agent` con tutti gli errori; consenso con gli agenti.
  - Contesto su un mondo piccolo: identità, luoghi in cui si trova, dintorni con direzioni, memoria; nessuna chiave nel testo.
  - Risposta: valida, parziale, non JSON, con JSON dentro il testo.
  - Runtime con il cervello finto e un cervello scriptato: ogni regola di P8–P10 e AGENT-006, con il tempo simulato dove possibile.
  - Cervelli: argomenti delle CLI finte per ogni combinazione di modello ed effort; richieste al server locale per Anthropic e OpenAI, errori e tempo limite.
- **E2E (Playwright).** Nel mondo dell'host un agente `fake`: gli si scrive dalla console e risponde; «Cosa vedi?» elenca i dintorni.
- **Manuale.** Checklist a T8.14, con le misure a parte (process.md): latenza di una risposta con Claude Code, AGENT-002.c, AGENT-007.a–c, DEBUG-001.a.

## Dipendenze nuove
Nessuna in npm: HTTP con `fetch` di Node, processi con `child_process`. Le CLI e le chiavi sono dell'utente.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Opzioni delle CLI diverse da quelle attese o cambiate tra versioni | Cervelli che non partono | T8.01 le verifica sulle versioni installate; il terminale mostra l'errore della CLI |
| Codex non interrogabile dal sandbox di sviluppo; opencode non installato | Cervelli non provati dal vivo | Verifica di Codex con l'utente (`! codex exec --help`); opencode con una CLI finta secondo la sua documentazione, e dal vivo se l'utente lo installa |
| L'LLM non rispetta la forma della risposta | Agente muto o incoerente | Risposta strutturata dove esiste (P5), estrazione del JSON, parti valide eseguite, terminale che mostra lo scarto |
| Latenza alta delle CLI (partenza a ogni richiesta) | Risposte lente | Tempo limite 60 s, stato «thinking» nell'overlay, misura alla prova d'uso; una sessione persistente come ottimizzazione successiva |
| Costi | Spesa inattesa | Iniziativa reattiva predefinita, 6 richieste al minuto, 4 scambi tra agenti, cervello `fake` per le prove |
| Un agente che agisce sul computer dell'utente | Sicurezza | Strumenti disattivati, cartella temporanea, consenso (P6, P12) |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T8.01** Verifica delle CLI e delle API
  - Req: AGENT-001 · Dip: —
  - Nessun codice di prodotto. Per Claude Code e Codex (con l'utente, che esegue i comandi dove il sandbox non arriva): opzioni per modello, effort, risposta strutturata, strumenti disattivati, una chiamata vera con un contesto di prova. Per opencode le opzioni documentate. Per le API il parametro dell'effort. Esiti nella tabella «Cervelli» di questo piano.
  - Fatto quando: la tabella dice, per ogni cervello, come si passano modello, effort e schema, e la chiamata di prova ha risposto.

- [ ] **T8.02** Agenti nel file del mondo e consenso
  - Req: AGENT-001, CHAR-001, PROTO-005, HOST-001 · Dip: T8.01
  - Schema `agent` (P4 della spec, Q6–Q8), esclusivo con `program` e `controller`; configurazione nel risultato della composizione; agenti nell'elenco e nell'impronta del consenso (P12); righe del terminale.
  - Fatto quando: test di AGENT-001.a e .d, CHAR-001.a e .c, PROTO-005.a verdi.

- [ ] **T8.03** Contesto del mondo
  - Req: AGENT-002 · Dip: T8.02
  - `context.ts` (P3): identità, posizione e luoghi, mappa, dintorni con direzioni, tempo, memoria, eventi.
  - Fatto quando: test di AGENT-002.a–b verdi.

- [ ] **T8.04** Risposta strutturata ed esecuzione
  - Req: AGENT-003 · Dip: T8.02
  - `reply.ts` (P4, P5): schema, validazione, parti scartate, estrazione del JSON; esecuzione in sequenza con l'`AgentWorld`.
  - Fatto quando: test di AGENT-003.a–b verdi.

- [ ] **T8.05** Runtime dell'agente e cervello finto
  - Req: AGENT-003, AGENT-004, AGENT-005, AGENT-006 · Dip: T8.03, T8.04
  - `runtime.ts` (P8–P10), `brain.ts`, `brains/fake.ts` (P11); stato per l'overlay (P14).
  - Fatto quando: test di AGENT-003.c, AGENT-004.a–c, AGENT-005.a, AGENT-006.a–d verdi; un agente `fake` risponde nella console.

- [ ] **T8.06** Cervello Claude Code
  - Req: AGENT-001 · Dip: T8.05
  - `brains/claude.ts` (P5–P7): argomenti, stdin, schema, tempo limite, errori della CLI nel terminale.
  - Fatto quando: test di AGENT-001.b con una CLI finta verdi; un agente con Claude Code vero risponde (manuale).

- [ ] **T8.07** Prova d'uso con l'utente
  - Req: AGENT-002, AGENT-007 · Dip: T8.06
  - **Punto di controllo**: in una bozza di `examples/agenti` l'utente parla con la pescatrice guidata da Claude Code: «Cosa vedi?», «dove si pesca meglio?», una domanda fuori dal mondo. Si misura la latenza. Le osservazioni diventano deviazioni o emendamenti prima di T8.08.
  - Fatto quando: l'utente ha parlato con l'agente e le osservazioni sono registrate nel piano.

- [ ] **T8.08** Cervelli Codex e opencode
  - Req: AGENT-001 · Dip: T8.07
  - `brains/codex.ts`, `brains/opencode.ts` secondo la tabella «Cervelli».
  - Fatto quando: test con CLI finte verdi; Codex provato dal vivo dall'utente.

- [ ] **T8.09** Cervelli API: Anthropic e compatibile OpenAI
  - Req: AGENT-001 · Dip: T8.07
  - `brains/anthropic.ts`, `brains/openai.ts` (P5, P7, P13): chiavi, indirizzo, effort, errori ripuliti.
  - Fatto quando: test di AGENT-001.c con il server locale verdi.

- [ ] **T8.10** Overlay e terminale
  - Req: DEBUG-001, HOST-001 · Dip: T8.05
  - Stato e latenza dell'agente nell'overlay; righe del terminale per richieste fallite, scadute e parti scartate.
  - Fatto quando: test di HOST-001.c verdi; overlay provato nel browser.

- [ ] **T8.11** Esempi
  - Req: AGENT-007 · Dip: T8.08, T8.09
  - `examples/agenti`: la pescatrice agente con Claude Code, e nei commenti le varianti per Codex, opencode, Anthropic, OpenAI, Ollama e `fake`.
  - Fatto quando: `yw3d examples/agenti` fa la demo della roadmap; con `mode: fake` parte senza CLI né chiavi.

- [ ] **T8.12** Guida
  - Req: AGENT-007 · Dip: T8.11
  - `docs/agenti.md`: configurazione, un esempio per modalità e CLI, cosa sa l'agente, iniziativa, limiti, costi, errori frequenti; README e `worlds/README.md`.
  - Fatto quando: la guida copre ogni campo di `agent`; l'esempio minimo sta sotto le 10 righe.

- [ ] **T8.13** Test end-to-end
  - Req: AGENT-002, AGENT-003, CHAR-001 · Dip: T8.10
  - Un agente `fake` nel mondo dell'host risponde dalla console e descrive i dintorni.
  - Fatto quando: `npm run e2e` verde.

- [ ] **T8.14** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T8.11, T8.12, T8.13
  - `check`, `e2e`, `sdd:trace -- F08`; checklist con le misure a parte; spec vive (nuova `agents.md`); `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Cervelli
Esiti di T8.01 (2026-09-27): opzioni lette dall'aiuto delle versioni installate e una chiamata vera per CLI, con lo stesso contesto di prova (la pescatrice a cui si chiede dove pescare).

| Cervello | Chiamata | Modello | Effort | Risposta strutturata | Senza strumenti né sessione | Chiamata di prova |
|---|---|---|---|---|---|---|
| Claude Code 2.1.283 | `claude -p`, contesto sullo stdin | `--model` | `--effort low\|medium\|high` | `--output-format json --json-schema <schema>`: la risposta è in `structured_output` | `--tools ""`, `--no-session-persistence` | ✓ 4,5 s (3 s di API), 0,046 $ con il modello predefinito (Opus); risposta conforme |
| Codex 0.157.1 | `codex exec -`, contesto sullo stdin | `-m` | `-c model_reasoning_effort=low\|medium\|high` | `--output-schema <file>`, `-o <file>` con l'ultimo messaggio | `-s read-only`, `--ephemeral`, `--skip-git-repo-check`, `-C <cartella temporanea>` | ✓ 5,3 s con effort `low`; risposta conforme |
| opencode 2.0.18 | `opencode run --agent plan <messaggio>` | `-m provider/modello` | variante del modello `#…`, solo con un modello indicato (non provato) | nessuna: il JSON si estrae dal testo (arriva anche in un blocco di codice) | agente `plan`, senza strumenti di modifica | ✓ 22,6 s con l'agente predefinito, 3,5 s con `plan` (modello `longcat-2.5-preview-free`); una volta un'azione inesistente (`move`) |
| Anthropic API | `POST /v1/messages` | `model` | da definire in T8.09 | strumento obbligato con lo schema | — | non provata: nessuna chiave nell'ambiente |
| Compatibile OpenAI | `POST <indirizzo>/chat/completions` | `model` | `reasoning_effort` | `response_format` `json_schema`, o estrazione dal testo | — | non provata: nessuna chiave nell'ambiente |

Osservazioni: le istruzioni devono elencare le azioni ammesse (opencode ha inventato `move`); con il modello predefinito di Claude Code una richiesta costa circa 5 centesimi, quindi la guida consiglierà un modello più economico per gli agenti. Nel `PATH` di questa macchina c'è anche una Codex 0.125.0 installata con npm (`/usr/local/bin/codex`), trovata prima della 0.157.1 in `~/.local/bin`: l'host usa la CLI del `PATH`, quindi va tolta o messa dopo.

## Ordine e parallelismo

```
T8.01 ─ T8.02 ─┬─ T8.03 ─┐
               └─ T8.04 ─┴─ T8.05 ─┬─ T8.06 ─ T8.07 ─┬─ T8.08 ─┬─ T8.11 ─ T8.12 ─┐
                                   │                 └─ T8.09 ─┘                  │
                                   └─ T8.10 ─ T8.13 ──────────────────────────────┴─ T8.14
```
Punti di controllo: G2 prima di T8.01; T8.01 con l'utente per le chiamate vere; prova d'uso a T8.07; G3 a T8.14.

## Modalità di esecuzione
Task in ordine; ci si ferma a T8.01 per i comandi che l'utente esegue e a T8.07 per la prova d'uso. Commit a fine task con `npm run commit`, che esegue anche gli e2e quando servono; il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
