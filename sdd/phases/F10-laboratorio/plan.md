# F10 — Piano di implementazione

| | |
|---|---|
| Stato | draft |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-28 |

## Panoramica
Il laboratorio vive nell'host, accanto agli agenti (D-012): il core si limita a validare gli scenari nel file del mondo e a saper posare blocchi durante la simulazione. Un **motore degli scenari** (`src/host/lab/`) parte a ogni caricamento del mondo. Assegna il compito al runtime dell'agente, conta passi e tempo simulato, fa scattare le perturbazioni, raccoglie l'esito e scrive il tracciato. La sessione dell'host (`HostSession.advance`) smette di avanzare mentre un agente con uno scenario aspetta il suo cervello: questo è il tempo a turni.

Sopra il motore stanno tre comandi: `yw3d run`, che esegue le serie senza server; `yw3d show`, che legge un tracciato; `--replay`, che rimette in scena un tracciato con un cervello che rilegge le risposte registrate. I cervelli imparano a riportare token e costo, e le istruzioni agli agenti ricevono una versione.

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
| `src/host/agents/runtime.ts` | modalità scenario: compito all'avvio, nuova domanda a fine azioni, esito dichiarato, attesa visibile al motore |
| `src/host/agents/brains/fake.ts` | comportamento da scenario, deterministico |
| `src/host/agents/brains/replay.ts` (nuovo) | cervello che ridà le risposte di un tracciato (LAB-006) |
| `src/host/lab/scenarioRun.ts` (nuovo) | motore degli scenari: avvio, limiti, perturbazioni, esiti |
| `src/host/lab/trace.ts` (nuovo) | scrittura e lettura del tracciato (JSON a righe) in `runs/` |
| `src/host/lab/series.ts` (nuovo) | `yw3d run`: condizioni, esecuzioni, consenso, tetto di spesa |
| `src/host/lab/report.ts` (nuovo) | statistiche della serie, tabella nel terminale e `report.json` |
| `src/host/lab/show.ts` (nuovo) | `yw3d show`: cronologia e dettaglio di un passo |
| `src/host/session.ts` | tempo a turni in `advance`, motore degli scenari a ogni caricamento, modifiche di blocchi alle viste |
| `src/host/args.ts`, `cli.ts` | sottocomandi `run` e `show`, opzione `--replay` |
| `src/protocol/messages.ts` | attesa degli agenti nello stato, modifiche di blocchi, esiti e perturbazioni per la console |
| `src/app/*` | indicatore di attesa, blocchi modificati, righe del laboratorio nella console |
| `examples/laboratorio/`, `docs/laboratorio.md` (nuovi) | esempi e guida (LAB-009) |

## Decisioni tecniche
| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Il motore degli scenari sta in `src/host/lab`; nel core vanno solo lo schema e le modifiche di blocchi | Motore nel core | Gli agenti esistono solo nell'host (D-012); senza host gli scenari si ignorano (fuori scope) |
| P2 | `scenarios` è una lista i cui elementi sono uno scenario scritto per intero oppure una stringa con il percorso di un file YAML della cartella. Il core valida la forma, l'host legge e valida i file importati | Chiave `import:` generale per ogni sezione | Basta per Q1 e resta piccolo; il browser, che non legge i file importati, valida il `world.yaml` senza risolverli |
| P3 | Tempo a turni: `advance` esce dal ciclo dei passi appena un agente con uno scenario è «in attesa» e scarta il tempo accumulato dallo stepper. «In attesa» vale anche per una richiesta ferma per il limite di frequenza | Pausa solo durante la richiesta | Con il limite di 6 richieste al minuto (tempo reale) il mondo scorrerebbe durante l'attesa e le esecuzioni con il cervello finto non sarebbero ripetibili (LAB-003.c) |
| P4 | L'esito entra nello schema della risposta come campo sempre presente e nullo (`outcome: null` oppure `{ result, reason }`); fuori da uno scenario l'host lo scarta con un avviso | Schema diverso per gli agenti con scenario | Uno schema solo per tutte le CLI e le API; le istruzioni ne parlano solo con uno scenario |
| P5 | In modalità scenario il runtime interroga di nuovo l'agente a fine azioni anche senza `continue`, e anche dopo una risposta senza azioni né esito. Il numero massimo di passi e il limite di frequenza fermano i cicli | Rispettare `continue` | LAB-002.b; senza questa regola un LLM «di un passo alla volta» si fermerebbe (retro di F08) |
| P6 | `Brain.think` restituisce `{ reply, usage }`, dove `usage` contiene token in ingresso, token in uscita e costo in dollari, ciascuno con `null` quando non è riportato | Stimare dai caratteri | LAB-005.b vieta le stime; ciò che ogni CLI riporta si verifica in T10.01 |
| P7 | Versione delle istruzioni: la costante `INSTRUCTIONS_NAME` (es. `f10-1`) più i primi 12 caratteri dello SHA-256 del testo fisso delle istruzioni | Numero di versione a mano | L'impronta cambia anche quando qualcuno dimentica di aggiornare il nome |
| P8 | Tracciato in JSON a righe: `runs/<serie o data-ora>/<esecuzione>/trace.jsonl`, con la prima riga d'intestazione e una riga per evento; `report.json` accanto alle esecuzioni della serie | Un JSON unico, SQLite | Si scrive mentre l'esecuzione procede e un'interruzione non perde nulla; SQLite arriverà con la memoria (R3) |
| P9 | Blocchi posati o tolti: il core li applica al `World` con `setBlock`, saltando le celle occupate da entità, e ricostruisce per intero la `NavGrid`. L'host invia le modifiche alle viste e le ripete nel `hello` a chi si collega dopo | Ricostruzione parziale della griglia | Le perturbazioni sono rare; la ricostruzione completa è semplice. Si misura in T10.10 e si ottimizza solo se serve |
| P10 | `yw3d run` usa una `HostSession` senza server né viste, guidata da un temporizzatore a 60 Hz in tempo reale (Q5); ogni esecuzione è una sessione nuova | Riusare la sessione ricaricando | Una sessione nuova garantisce memoria vuota e mondo iniziale (LAB-007.a) |
| P11 | Formato dei cervelli sulla riga di comando: `--brain fake`, `--brain claude[:modello[:effort]]`, `codex[…]`, `opencode[:modello]`, `anthropic:modello[:effort]`, `openai:modello[:effort]`; ripetibile, una condizione per `--brain`. Persona, obiettivi, `base_url` e chiave restano quelli del file | Un file di condizioni | È sufficiente per F10 e si legge nel rapporto |
| P12 | Rigioco: il cervello `replay` restituisce le risposte registrate di quel personaggio in ordine; se le risposte finiscono, l'agente resta fermo e il terminale lo dice | Rigiocare le azioni invece delle risposte | Rigiocando le risposte si rivede anche l'effetto del mondo (fisica, percorsi) |

## Strategia di test
- **Unit (Vitest):** schema degli scenari e importazione con errori sul file giusto; modifiche di blocchi con P3 e griglia ricostruita; runtime in modalità scenario con orologio finto; motore degli scenari con il cervello finto (esiti, limiti, perturbazioni); tempo a turni (il mondo non avanza mentre un agente aspetta, anche per il limite di frequenza); **determinismo** (LAB-003.c: due esecuzioni con il cervello finto danno lo stesso tracciato, esclusi i tempi reali); tracciato senza chiave; serie con tetto di spesa usando cervelli finti con costo simulato; statistiche del rapporto; `show`; rigioco allo stesso esito.
- **E2E (Playwright):** una vista collegata a un mondo con uno scenario e il cervello finto: indicatore d'attesa, esito nella console, blocchi posati da una perturbazione visibili anche a una vista che si collega dopo.
- **Manuale:** comodità di scrittura di uno scenario (LAB-002.e), leggibilità dell'attesa (LAB-003.d), del rigioco (LAB-006.b) e del rapporto (LAB-007.f), esempi, guida, prima serie (LAB-009).
- Titoli dei test con i criteri, come sempre (P7 della costituzione).

## Dipendenze nuove
Nessuna. SHA-256 viene da `node:crypto`.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Le CLI non riportano token o costo (Codex senza costo, opencode da verificare) | Rapporto incompleto; tetto di spesa inefficace per quelle CLI | T10.01 per primo; il rapporto dice «non disponibile» e avvisa che quei costi non contano per il tetto (LAB-007.c) |
| Asincronia delle promesse: una risposta applicata tra due passi in punti diversi rende non ripetibile l'esecuzione | LAB-003.c fallisce | P3: il ciclo dei passi si ferma nell'istante in cui parte la richiesta; la risposta si applica prima del passo successivo; test di determinismo in T10.07 |
| Blocchi modificati nelle viste: il rendering ricostruisce le regioni? | Perturbazione invisibile | In T10.10 si verifica la ricostruzione delle regioni toccate (`World.onChange`), con un e2e |
| Il mondo fermo a lungo (CLI lente, 8–10 s) sembra bloccato | Esperienza d'osservazione confusa | LAB-003.d: indicatore con il nome del personaggio e la durata dell'attesa |
| Costi della prima serie | Spesa inattesa | Tetto di spesa obbligatorio per la serie di T10.16, concordato con l'utente prima di lanciarla |
| Scenari che ripartono a ogni ricarica mentre l'autore modifica il file | Tanti tracciati inutili in `runs/` | Accettato (spec, Q2); la guida lo spiega e consiglia di escludere `runs/` da git |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [ ] **T10.01** Cosa riportano CLI e API
  - Req: LAB-005.b · Dip: —
  - Una chiamata vera per CLI (Claude Code, Codex, opencode) per capire dove si trovano token e costo nell'output e quali opzioni servono (es. `--json` per Codex); per le API, dalla documentazione dei campi `usage`. Esito in una tabella nella sezione «Deviazioni» o in nota al piano. Nessun codice di prodotto.
  - Fatto quando: la tabella dice, per ogni cervello, cosa si legge e cosa è «non disponibile».
- [ ] **T10.02** Scenari nel file del mondo
  - Req: LAB-001.a–c, YAML-001.a · Dip: —
  - Schema di `scenarios` (P2) e dello scenario: id, nome, descrizione, agente, compito, tempo limite, passi (predefinito 50), perturbazioni (solo la forma; l'effetto arriva in T10.10). Importazione dai file della cartella nell'host, con errori sul file importato; controlli incrociati (agente esistente e con `agent:`, uno scenario per agente); l'hash del mondo non cambia.
  - Fatto quando: test unit verdi, compresi un file importato con un errore e un file importato salvato che ricarica il mondo.
- [ ] **T10.03** Consumo dei cervelli
  - Req: LAB-005.b · Dip: T10.01
  - `Brain.think` restituisce `{ reply, usage }` (P6) per tutti i cervelli, secondo la tabella di T10.01; il cervello finto riporta consumo zero.
  - Fatto quando: test unit dei cervelli con gli output registrati in T10.01; gli agenti di F08 funzionano come prima.
- [ ] **T10.04** Istruzioni versionate
  - Req: LAB-008.a · Dip: —
  - Il testo fisso delle istruzioni viene separato dal contesto variabile; `INSTRUCTIONS_NAME` e impronta (P7) sono esposti al runtime.
  - Fatto quando: un test verifica che cambiando il testo cambi l'impronta e che il contesto costruito resti invariato rispetto a F08.
- [ ] **T10.05** L'agente svolge uno scenario
  - Req: LAB-002.a–c, AGENT-003.a · Dip: T10.04
  - Sezione del compito nel contesto e istruzioni sull'esito, solo con uno scenario; campo `outcome` nella risposta (P4); runtime in modalità scenario (P5): trigger `task` all'avvio a prescindere dall'iniziativa, nuova domanda a fine azioni, esito dichiarato che chiude. Il cervello finto svolge un compito: va alla meta nominata e poi dichiara «riuscito».
  - Fatto quando: test unit con orologio finto: il compito parte senza messaggi, le domande proseguono, l'esito arriva; fuori da uno scenario `outcome` si scarta.
- [ ] **T10.06** Motore degli scenari
  - Req: LAB-002.b–d · Dip: T10.02, T10.03, T10.05
  - `scenarioRun`: parte a ogni caricamento del mondo, conta passi e tempo simulato, chiude con il primo esito (dichiarato, tempo scaduto, passi esauriti, errore), poi l'agente torna com'era nel file. Esiti nel terminale e nella console delle viste.
  - Fatto quando: test unit per ogni esito, con il cervello finto e con cervelli che falliscono.
- [ ] **T10.07** Tempo a turni
  - Req: LAB-003.a–c, AGENT-006.a, TIME-002.a · Dip: T10.06
  - `advance` si ferma mentre un agente con uno scenario è in attesa, anche per il limite di frequenza (P3); il mondo resta fermo: ora, tempi limite, iniziativa, giocatore. Senza scenari tutto resta come in F08.
  - Fatto quando: test unit sulla pausa e test di determinismo LAB-003.c (due esecuzioni, stessa sequenza e stessi tempi simulati).
- [ ] **T10.08** L'attesa nelle viste
  - Req: LAB-003.d · Dip: T10.07
  - Lo stato inviato alle viste dice chi sta pensando e da quanto; un indicatore nella vista; righe del laboratorio (inizio, esito) nella console.
  - Fatto quando: e2e con il cervello finto (con un ritardo simulato) che vede l'indicatore e l'esito.
- [ ] **T10.09** Tracciato
  - Req: LAB-005.a–c · Dip: T10.03, T10.06
  - `runs/<data-ora>/trace.jsonl` a ogni esecuzione dal vivo: intestazione (impronte, versione, cervelli, istruzioni, seed, data) ed eventi (richieste con contesto e risposta grezza, consumo, latenza, azioni, parti scartate, frasi, perturbazioni, esiti). La chiave API non compare mai.
  - Fatto quando: test unit sul contenuto e sull'assenza della chiave; un'esecuzione con il cervello finto produce un tracciato completo.
- [ ] **PC1 — Prova d'uso** (punto di controllo con l'utente)
  - Dip: T10.08, T10.09
  - L'utente scrive uno scenario (commissione con tempo limite) nel suo `world.yaml`, oppure in un file importato, e lo guarda dal vivo con un modello vero. Si raccolgono le osservazioni su formato, attesa ed esito prima di costruire serie, rapporto ed esempi (process.md, «prova d'uso presto»).
- [ ] **T10.10** Perturbazioni
  - Req: LAB-004.a–c · Dip: T10.06
  - Frase di un personaggio o del giocatore, luogo spostato (con le mete che cambiano), obiettivi cambiati, blocchi posati o tolti (P9) con il rispetto di P3, griglia dei percorsi ricostruita, viste aggiornate anche se collegate dopo; tutto nel tracciato e nel terminale.
  - Fatto quando: test unit per ogni perturbazione ed e2e dei blocchi; tempo di ricostruzione della griglia misurato e annotato.
- [ ] **T10.11** Serie di esecuzioni
  - Req: LAB-007.a–d, CLI-001.c · Dip: T10.07, T10.09
  - `yw3d run <cartella> [--runs N] [--brain …]… [--budget USD] [--allow-commands]` (P10, P11): consenso una volta, esecuzioni in sequenza da mondo iniziale, tetto di spesa, righe di avanzamento; aiuto aggiornato.
  - Fatto quando: test unit con cervelli finti, anche con costo simulato per il tetto.
- [ ] **T10.12** Rapporto
  - Req: LAB-007.e–f · Dip: T10.11
  - Statistiche per condizione e scenario (esiti; media e deviazione standard di passi, azioni, tempo simulato, token, costo; latenza anche massima; parti scartate), intestazione comune, elenco delle esecuzioni; tabella nel terminale e `report.json`; nota «esito dichiarato dall'agente».
  - Fatto quando: test unit sulle statistiche e sul file.
- [ ] **T10.13** `yw3d show`
  - Req: LAB-005.d · Dip: T10.09
  - Cronologia di un tracciato, un passo per riga; `--step n` per contesto e risposta completi.
  - Fatto quando: test unit su un tracciato d'esempio.
- [ ] **T10.14** Rigioco
  - Req: LAB-006.a–b · Dip: T10.09, T10.10
  - `yw3d <cartella> --replay <esecuzione>` con il cervello `replay` (P12); avviso se le impronte dei file non coincidono.
  - Fatto quando: test unit: rigiocare un'esecuzione con il cervello finto dà gli stessi esiti; avviso sui file cambiati.
- [ ] **T10.15** Esempi e guida
  - Req: LAB-009.a–b, LAB-002.e · Dip: T10.12, T10.13, T10.14
  - `examples/laboratorio/` con tre scenari (commissione in più passi, esplorazione con resoconto a un personaggio, compito in due agenti), provati con il cervello finto e con un modello vero; `docs/laboratorio.md`; rimandi da README e `docs/agenti.md`.
  - Fatto quando: gli scenari girano con il cervello finto in un test; la guida copre tutte le voci di LAB-009.b.
- [ ] **T10.16** Prima serie
  - Req: LAB-009.c · Dip: T10.15
  - I tre scenari, il cervello finto e almeno un modello vero, 5 esecuzioni ciascuno, con un tetto di spesa concordato con l'utente. Risultati, costo reale e osservazioni nel diario di `research.md`.
  - Fatto quando: la serie è registrata nel diario con il rapporto.

## Ordine e parallelismo
```
T10.01 → T10.03 ─┐
T10.02 ──────────┼→ T10.06 → T10.07 → T10.08 ─┐
T10.04 → T10.05 ─┘      │                     ├→ PC1 → T10.10 → T10.11 → T10.12 ─┐
                        └→ T10.09 ────────────┘                  T10.13 ──────────┼→ T10.14 → T10.15 → T10.16
```
T10.01, T10.02 e T10.04 sono indipendenti. PC1 viene prima di perturbazioni, serie ed esempi, così il formato degli scenari e l'esperienza d'osservazione si correggono prima di costruirci sopra. T10.16 ha un costo reale e parte solo con il tetto concordato.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
