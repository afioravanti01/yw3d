# F10 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-28) |
| Spec | [spec.md](spec.md) v0.3 |
| Data | 2026-09-28 |

## Panoramica
Il laboratorio vive nell'host, accanto agli agenti (D-012): il core si limita a validare gli scenari nel file del mondo e a saper posare blocchi durante la simulazione. Un **motore degli scenari** (`src/host/lab/`) parte a ogni caricamento del mondo. Assegna il compito al runtime dell'agente, conta passi e tempo simulato, fa scattare le perturbazioni, raccoglie l'esito e scrive il tracciato. Il mondo non si ferma mai (D-014): la simulazione avanza come in F08 e le risposte degli agenti arrivano quando arrivano.

Sopra il motore stanno tre comandi: `yw3d run`, che esegue le serie senza server; `yw3d show`, che legge un tracciato; `--replay`, che rimette in scena un tracciato con un cervello che ridà le risposte registrate agli stessi tempi simulati. I cervelli imparano a riportare token e costo, e le istruzioni agli agenti ricevono una versione.

## Struttura del codice
| Modulo | Responsabilità |
|---|---|
| `src/core/yaml/worldFile.ts` | schema di `scenarios`: scenario scritto per intero oppure percorso di un file della cartella |
| `src/core/yaml/scenarioFile.ts` (nuovo) | schema e validazione di uno scenario, anche da un file importato (errori con il suo file) |
| `src/core/world/edits.ts` (nuovo) | posare e togliere blocchi in un parallelepipedo, saltando i blocchi occupati da entità (LAB-004.b) |
| `src/core/sim/simulation.ts` | applica le modifiche di blocchi e ricostruisce la griglia dei percorsi |
| `src/host/agents/brain.ts`, `brains/*` | il cervello restituisce la risposta e il consumo (token, costo, oppure `null`) |
| `src/host/agents/context.ts` | istruzioni fisse separate dal contesto, con nome e impronta (LAB-008); sezione del compito |
| `src/host/agents/reply.ts` | campo `outcome` della risposta (LAB-002.c) |
| `src/host/agents/runtime.ts` | modalità scenario: compito all'avvio, nuova domanda a fine azioni, esito dichiarato; eventi per il tracciato |
| `src/host/agents/brains/fake.ts` | comportamento da scenario |
| `src/host/agents/brains/replay.ts` (nuovo) | cervello che ridà le risposte di un tracciato agli stessi tempi simulati (LAB-006) |
| `src/host/lab/scenarioRun.ts` (nuovo) | motore degli scenari: avvio, limiti, perturbazioni, esiti |
| `src/host/lab/trace.ts` (nuovo) | scrittura e lettura del tracciato (JSON a righe) in `runs/` |
| `src/host/lab/series.ts` (nuovo) | `yw3d run`: condizioni, esecuzioni, consenso, tetto di spesa |
| `src/host/lab/report.ts` (nuovo) | statistiche della serie, tabella nel terminale e `report.json` |
| `src/host/lab/show.ts` (nuovo) | `yw3d show`: cronologia e dettaglio di un passo |
| `src/host/session.ts` | motore degli scenari a ogni caricamento, modifiche di blocchi alle viste |
| `src/host/args.ts`, `cli.ts` | sottocomandi `run` e `show`, opzione `--replay` |
| `src/protocol/messages.ts` | modifiche di blocchi; esiti e perturbazioni per la console |
| `src/app/*` | blocchi modificati, righe del laboratorio nella console |
| `examples/laboratorio/`, `docs/laboratorio.md` (nuovi) | esempi e guida (LAB-009) |

## Decisioni tecniche
| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Il motore degli scenari sta in `src/host/lab`; nel core vanno solo lo schema e le modifiche di blocchi | Motore nel core | Gli agenti esistono solo nell'host (D-012); senza host gli scenari si ignorano (fuori scope) |
| P2 | `scenarios` è una lista i cui elementi sono uno scenario scritto per intero oppure una stringa con il percorso di un file YAML della cartella. Il core valida la forma, l'host legge e valida i file importati | Chiave `import:` generale per ogni sezione | Basta per Q1 e resta piccolo; il browser, che non legge i file importati, valida il `world.yaml` senza risolverli |
| P3 | Il mondo avanza come in F08 anche durante gli scenari (D-014). Ogni richiesta registra il tempo simulato della partenza e dell'arrivo della risposta | Tempo a turni (spec v0.2) | A10.1: la latenza fa parte del risultato |
| P4 | L'esito entra nello schema della risposta come campo sempre presente e nullo (`outcome: null` oppure `{ result, reason }`); fuori da uno scenario l'host lo scarta con un avviso | Schema diverso per gli agenti con scenario | Uno schema solo per tutte le CLI e le API; le istruzioni ne parlano solo con uno scenario |
| P5 | In modalità scenario il runtime interroga di nuovo l'agente a fine azioni anche senza `continue`, e anche dopo una risposta senza azioni né esito. Il numero massimo di passi e il limite di frequenza fermano i cicli | Rispettare `continue` | LAB-002.b; senza questa regola un LLM «di un passo alla volta» si fermerebbe (retro di F08) |
| P6 | `Brain.think` restituisce `{ reply, usage }`, dove `usage` contiene token in ingresso, token in uscita e costo in dollari, ciascuno con `null` quando non è riportato | Stimare dai caratteri | LAB-005.b vieta le stime; ciò che ogni CLI riporta si verifica in T10.01 |
| P7 | Versione delle istruzioni: la costante `INSTRUCTIONS_NAME` (es. `f10-1`) più i primi 12 caratteri dello SHA-256 del testo fisso delle istruzioni | Numero di versione a mano | L'impronta cambia anche quando qualcuno dimentica di aggiornare il nome |
| P8 | Tracciato in JSON a righe: `runs/<serie o data-ora>/<esecuzione>/trace.jsonl`, con la prima riga d'intestazione e una riga per evento; `report.json` accanto alle esecuzioni della serie | Un JSON unico, SQLite | Si scrive mentre l'esecuzione procede e un'interruzione non perde nulla; SQLite arriverà con la memoria (R3) |
| P9 | Blocchi posati o tolti: il core li applica al `World` con `setBlock`, saltando le celle occupate da entità, e ricostruisce per intero la `NavGrid`. L'host invia le modifiche alle viste e le ripete nel `hello` a chi si collega dopo | Ricostruzione parziale della griglia | Le perturbazioni sono rare; la ricostruzione completa è semplice. Si misura in T10.08 e si ottimizza solo se serve |
| P10 | `yw3d run` usa una `HostSession` senza server né viste, guidata da un temporizzatore a 60 Hz in tempo reale (Q5); ogni esecuzione è una sessione nuova | Riusare la sessione ricaricando | Una sessione nuova garantisce memoria vuota e mondo iniziale (LAB-007.a) |
| P11 | Formato dei cervelli sulla riga di comando: `--brain fake`, `--brain claude[:modello[:effort]]`, `codex[…]`, `opencode[:modello]`, `anthropic:modello[:effort]`, `openai:modello[:effort]`; ripetibile, una condizione per `--brain`. Persona, obiettivi, `base_url` e chiave restano quelli del file | Un file di condizioni | È sufficiente per F10 e si legge nel rapporto |
| P12 | Rigioco: il cervello `replay` ridà le risposte registrate di quel personaggio in ordine, e restituisce ciascuna non prima del tempo simulato in cui era arrivata nell'originale (o subito, se quel tempo è già passato). Se le risposte finiscono, l'agente resta fermo e il terminale lo dice | Rigiocare le azioni invece delle risposte | Rigiocando le risposte si rivede anche l'effetto del mondo (fisica, percorsi); i tempi registrati mantengono il ritmo dell'originale |

## Consumo dei cervelli (esito di T10.01)
Verificato il 2026-09-28 con una chiamata vera per CLI; per le API, dai campi `usage` della documentazione e dal codice dei cervelli di F08.

| Cervello | Token in ingresso | Token in uscita | Costo | Come |
|---|---|---|---|---|
| Claude Code 2.1.283 | `usage.input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` | `usage.output_tokens` | `total_cost_usd` (prezzo di listino, anche con un abbonamento) | l'output `--output-format json` che il cervello già legge |
| Codex 0.157.1 | `usage.input_tokens` (comprende `cached_input_tokens`) | `usage.output_tokens` + `reasoning_output_tokens` | non disponibile | `--json`: eventi su stdout, l'ultimo `turn.completed` porta `usage`; la risposta resta nel file di `-o` |
| opencode 2.0.18 | `info.tokens.input` + `cache.read` + `cache.write` | `info.tokens.output` + `reasoning` | `info.cost` (0 con i modelli gratuiti) | `--format json` non riporta il consumo: si legge l'id della sessione dagli eventi e poi `opencode session export <id>`, una seconda chiamata locale per richiesta |
| API Anthropic | `usage.input_tokens` + campi della cache | `usage.output_tokens` | non disponibile | risposta di `/v1/messages` |
| API compatibili OpenAI | `usage.prompt_tokens` | `usage.completion_tokens` | non disponibile | risposta di `/chat/completions`; alcuni servizi compatibili non mandano `usage`: allora anche i token sono non disponibili |
| Finto | 0 | 0 | 0 | — |

Conseguenza: il tetto di spesa di una serie è efficace con Claude Code e opencode; con Codex e le API il costo è «non disponibile» e il rapporto lo segnala (LAB-007.c).

## Strategia di test
- **Unit (Vitest):** schema degli scenari e importazione con errori sul file giusto; modifiche di blocchi con P3 e griglia ricostruita; runtime in modalità scenario con orologio finto; motore degli scenari con il cervello finto (esiti, limiti, perturbazioni); tracciato completo e senza chiave; serie con tetto di spesa, usando cervelli finti con un costo simulato; statistiche del rapporto; `show`; cervello `replay` con i tempi registrati.
- **E2E (Playwright):** una vista collegata a un mondo con uno scenario e il cervello finto: esito nella console; blocchi posati da una perturbazione, visibili anche a una vista che si collega dopo.
- **Manuale:** comodità di scrittura di uno scenario (LAB-002.e), rigioco (LAB-006.b), leggibilità del rapporto (LAB-007.f), esempi, guida, prima serie (LAB-009).
- Titoli dei test con i criteri, come sempre (P7 della costituzione).

## Dipendenze nuove
Nessuna. SHA-256 viene da `node:crypto`.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Le CLI non riportano token o costo (Codex senza costo, opencode da verificare) | Rapporto incompleto; tetto di spesa inefficace per quelle CLI | T10.01 per primo; il rapporto dice «non disponibile» e avvisa che quei costi non contano per il tetto (LAB-007.c) |
| Test del motore instabili, perché il mondo non aspetta le risposte | Test che falliscono a caso | Nei test il cervello finto risponde subito e l'orologio del runtime è finto; si verificano sequenze ed esiti, non tempi esatti |
| Blocchi modificati nelle viste: il rendering ricostruisce le regioni? | Perturbazione invisibile | In T10.08 si verifica la ricostruzione delle regioni toccate (`World.onChange`), con un e2e |
| Costi della prima serie | Spesa inattesa | Tetto di spesa obbligatorio per la serie di T10.14, concordato con l'utente prima di lanciarla |
| Scenari che ripartono a ogni ricarica mentre l'autore modifica il file | Tanti tracciati inutili in `runs/` | Accettato (spec, Q2); la guida lo spiega e consiglia di escludere `runs/` da git |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T10.01** Cosa riportano CLI e API
  - Req: LAB-005.b · Dip: —
  - Una chiamata vera per CLI (Claude Code, Codex, opencode) per capire dove si trovano token e costo nell'output e quali opzioni servono (es. `--json` per Codex); per le API, i campi `usage` dalla documentazione. Nessun codice di prodotto.
  - Fatto quando: una tabella nel piano dice, per ogni cervello, cosa si legge e cosa è «non disponibile».
- [x] **T10.02** Scenari nel file del mondo
  - Req: LAB-001.a–c, YAML-001.a · Dip: —
  - Schema di `scenarios` (P2) e dello scenario: id, nome, descrizione, agente, compito, tempo limite, passi (predefinito 50), perturbazioni (solo la forma; l'effetto arriva in T10.08). Importazione dai file della cartella nell'host, con gli errori sul file importato; controlli incrociati (agente esistente e con `agent:`, uno scenario per agente); l'hash del mondo non cambia.
  - Fatto quando: test unit verdi, compresi un file importato con un errore e un file importato salvato che ricarica il mondo.
- [ ] **T10.03** Consumo dei cervelli
  - Req: LAB-005.b · Dip: T10.01
  - `Brain.think` restituisce `{ reply, usage }` (P6) per tutti i cervelli, secondo la tabella di T10.01; il cervello finto riporta consumo zero.
  - Fatto quando: test unit dei cervelli con gli output registrati in T10.01; gli agenti di F08 funzionano come prima.
- [x] **T10.04** Istruzioni versionate
  - Req: LAB-008.a · Dip: —
  - Il testo fisso delle istruzioni si separa dal contesto variabile; `INSTRUCTIONS_NAME` e impronta (P7) sono esposti al runtime.
  - Fatto quando: un test verifica che cambiando il testo cambi l'impronta e che il contesto costruito resti invariato rispetto a F08.
- [ ] **T10.05** L'agente svolge uno scenario
  - Req: LAB-002.a–c, AGENT-003.a · Dip: T10.04
  - Sezione del compito nel contesto e istruzioni sull'esito, solo con uno scenario; campo `outcome` nella risposta (P4); runtime in modalità scenario (P5): trigger `task` all'avvio a prescindere dall'iniziativa, nuova domanda a fine azioni, esito dichiarato che chiude lo scenario. Il cervello finto svolge un compito: va alla meta nominata e poi dichiara «riuscito».
  - Fatto quando: test unit con orologio finto: il compito parte senza messaggi, le domande proseguono, l'esito arriva; fuori da uno scenario `outcome` si scarta.
- [ ] **T10.06** Motore degli scenari
  - Req: LAB-002.b–d · Dip: T10.02, T10.03, T10.05
  - `scenarioRun`: parte a ogni caricamento del mondo, conta passi e tempo simulato, chiude con il primo esito (dichiarato, tempo scaduto, passi esauriti, errore), poi l'agente torna com'era nel file. Esiti nel terminale e nella console delle viste.
  - Fatto quando: test unit per ogni esito, con il cervello finto e con cervelli che falliscono; e2e dell'esito nella console.
- [ ] **T10.07** Tracciato
  - Req: LAB-005.a–c · Dip: T10.03, T10.06
  - `runs/<data-ora>/trace.jsonl` a ogni esecuzione dal vivo: intestazione (impronte, versione, cervelli, istruzioni, seed, data) ed eventi (richieste con contesto, tempo simulato di partenza e arrivo, risposta grezza, consumo, latenza, azioni, parti scartate, frasi, perturbazioni, esiti). La chiave API non compare mai.
  - Fatto quando: test unit sul contenuto e sull'assenza della chiave; un'esecuzione con il cervello finto produce un tracciato completo.
- [ ] **PC1 — Prova d'uso** (punto di controllo con l'utente)
  - Dip: T10.07
  - L'utente scrive uno scenario (commissione con tempo limite) nel suo `world.yaml`, oppure in un file importato, e lo guarda dal vivo con un modello vero; poi apre il tracciato. Si raccolgono le osservazioni su formato, svolgimento ed esito prima di costruire perturbazioni, serie, rapporto ed esempi (process.md, «prova d'uso presto»).
- [ ] **T10.08** Perturbazioni
  - Req: LAB-004.a–c · Dip: T10.06
  - Frase di un personaggio o del giocatore, luogo spostato (con le mete che cambiano), obiettivi cambiati, blocchi posati o tolti (P9) con il rispetto di P3, griglia dei percorsi ricostruita, viste aggiornate anche se collegate dopo; tutto nel tracciato e nel terminale.
  - Fatto quando: test unit per ogni perturbazione ed e2e dei blocchi; tempo di ricostruzione della griglia misurato e annotato.
- [ ] **T10.09** Serie di esecuzioni
  - Req: LAB-007.a–d, CLI-001.c · Dip: T10.07
  - `yw3d run <cartella> [--runs N] [--brain …]… [--budget USD] [--allow-commands]` (P10, P11): consenso una volta, esecuzioni in sequenza dal mondo iniziale, tetto di spesa, righe di avanzamento; aiuto aggiornato.
  - Fatto quando: test unit con cervelli finti, anche con un costo simulato per il tetto.
- [ ] **T10.10** Rapporto
  - Req: LAB-007.e–f · Dip: T10.09
  - Statistiche per condizione e scenario (esiti; media e deviazione standard di passi, azioni, tempo simulato, token, costo; latenza anche massima; parti scartate), intestazione comune, elenco delle esecuzioni; tabella nel terminale e `report.json`; nota «esito dichiarato dall'agente».
  - Fatto quando: test unit sulle statistiche e sul file.
- [ ] **T10.11** `yw3d show`
  - Req: LAB-005.d · Dip: T10.07
  - Cronologia di un tracciato, un passo per riga; `--step n` per contesto e risposta completi.
  - Fatto quando: test unit su un tracciato d'esempio.
- [ ] **T10.12** Rigioco
  - Req: LAB-006.a–b · Dip: T10.07, T10.08
  - `yw3d <cartella> --replay <esecuzione>` con il cervello `replay` (P12); avviso se le impronte dei file non coincidono.
  - Fatto quando: test unit: le risposte arrivano in ordine e non prima dei tempi registrati; avviso sui file cambiati.
- [ ] **T10.13** Esempi e guida
  - Req: LAB-009.a–b, LAB-002.e · Dip: T10.10, T10.11, T10.12
  - `examples/laboratorio/` con tre scenari (commissione in più passi, esplorazione con resoconto a un personaggio, compito in due agenti), provati con il cervello finto e con un modello vero; `docs/laboratorio.md`; rimandi da README e `docs/agenti.md`.
  - Fatto quando: gli scenari girano con il cervello finto in un test; la guida copre tutte le voci di LAB-009.b.
- [ ] **T10.14** Prima serie
  - Req: LAB-009.c · Dip: T10.13
  - I tre scenari, il cervello finto e almeno un modello vero, 5 esecuzioni ciascuno, con un tetto di spesa concordato con l'utente. Risultati, costo reale e osservazioni nel diario di `research.md`.
  - Fatto quando: la serie è registrata nel diario con il rapporto.

## Ordine e parallelismo
```
T10.01 → T10.03 ─┐
T10.02 ──────────┼→ T10.06 → T10.07 → PC1 → T10.08 ─┬→ T10.09 → T10.10 ─┐
T10.04 → T10.05 ─┘                                   └→ T10.11 ──────────┼→ T10.12 → T10.13 → T10.14
```
T10.01, T10.02 e T10.04 sono indipendenti. PC1 viene prima di perturbazioni, serie ed esempi, così il formato degli scenari e lo svolgimento si correggono prima di costruirci sopra. T10.14 ha un costo reale e parte solo con il tetto concordato.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T10.04 | Il contesto invariato rispetto a F08 è stato verificato una volta, confrontando byte per byte i contesti prodotti prima e dopo la modifica (persona umana con risposte brevi e lunghe, animale), non con un test permanente | Un test «invariato rispetto a F08» andrebbe riscritto già in T10.05, che cambia le istruzioni; il test permanente verifica nome e impronta | Nessuno |
