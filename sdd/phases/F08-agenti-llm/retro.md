# F08 — Retrospettiva

Data di chiusura: 2026-09-27

## Verifica manuale

| Criterio | Esito | Note |
|---|---|---|
| AGENT-002.c | ✓ | «Cosa vedi?» con nomi, direzioni e distanze; fuori dal mondo risponde da esperta (Marta biologa marina) o per immagini (Anselmo) |
| AGENT-007.a | ✓ | Marta risponde e accompagna; provata con Claude Code e poi con Codex |
| AGENT-007.b | ✓ | |
| AGENT-007.c | ✓ | L'esempio minimo della guida sta in 6 righe |
| DEBUG-001.a | ✓ | Cervello, modello, stato e durata dell'ultima richiesta |

Misure (riportate a parte, come chiede process.md dopo F07):

| Misura | Valore |
|---|---|
| Latenza di una risposta, Claude Code `sonnet` effort `low` | 3,8–8,3 s (misurata); «qualche secondo» per l'utente |
| Latenza, Codex effort `low` | 8–10 s (misurata); l'utente: più di Claude |
| Latenza, opencode con il modello gratuito predefinito | 7,8–43 s (misurata); l'utente: almeno 10 s |
| Costo di una richiesta, Claude Code con il modello predefinito (Opus) | 0,046 $ |
| API di Anthropic e compatibili OpenAI dal vivo | non misurate: nessuna chiave |

L'utente ha accettato la fase con «tutto ok» (G3).

Verifica automatica: `npm run check` verde, `npm run e2e` verde (30 test, con un agente nel mondo dell'host), `npm run sdd:trace -- F08` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi | 7 / 7 / 0 (CHAR-002, DIALOG-005 e YAML-001 modificati dagli emendamenti) |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 21 / 0 / 5 |
| Righe spec / piano | `wc -l` a chiusura | 123 / 209 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 14 / 3 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 6 (A8.1–A8.6) |
| Deviazioni | righe della tabella deviazioni | 0 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 26 / 26 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 749 (162 + 255 + 123 + 209) |
| LOC src / test | saldo di `git diff` da F07 | 1796 / 1470 |
| Doc/LOC | (righe spec + piano) / LOC src | 0,18 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-27), una sessione |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

## Ipotesi
- **H1 — Contesto.** Scende ancora: 749 righe, la fase più piccola in documenti dopo F04.
- **H2 — Stabilità.** Sei emendamenti, tutti nati usando gli agenti veri e tutti richieste dell'utente: risposte lunghe, `/describe` con i dati tecnici, commissioni per passi, conversazioni tra agenti. Nessuno da ambiguità della spec. In più, prima della spec, la decisione D-012 è stata corretta dall'utente: l'agente doveva vivere nell'host, non in Python.
- **H3 — Qualità.** La prova d'uso ha trovato ciò che nessun test poteva trovare, perché dipende dal comportamento di un LLM vero: un personaggio «burbero» che rifiuta le richieste, un LLM che pianifica un passo alla volta e non viene più interrogato, un saluto che interrompe una commissione. Ogni correzione è poi diventata una regola provata con il cervello finto.
- **H4 — Overhead.** 0,18.
- **H5 — Tracciabilità.** Confermata; ha trovato anche un errore di formato nella spec (un criterio non su una riga propria).

## Cosa ha funzionato
- **Verifica delle CLI come primo task** (T8.01): opzioni e una chiamata vera per ciascuna prima di scrivere codice. Nessuna sorpresa dopo, salvo la vecchia Codex nel `PATH`.
- **Il cervello finto.** Tutte le regole del runtime (quando chiedere, una richiesta alla volta, tempi, frequenza, memoria, conversazioni) provate senza rete né costi; lo stesso cervello fa l'e2e.
- **Lo strumento di commit con gli e2e.** Nessun commit con un e2e rosso in questa fase; li ha eseguiti da solo a ogni commit che toccava l'host o le viste.
- **Scene provate dal vivo con uno script sull'host**, con il tracciato di richieste e risposte: hanno mostrato in pochi minuti perché Marta non faceva la commissione.

## Cosa non ha funzionato
- **La prima D-012 era sbagliata**: l'agente come programma Python. L'utente l'ha corretta prima della spec, ma per un'ora la decisione, la costituzione e la roadmap hanno detto una cosa diversa da ciò che l'utente voleva.
- **Un host avviato prima delle correzioni** ha fatto sembrare rotta una cosa già corretta. Il codice di yw3d si carica all'avvio dell'host: ricaricare la pagina non basta, e niente lo dice.
- **Le istruzioni agli agenti si sono messe a punto per tentativi**, dal vivo. Non c'è un test che dica se un'istruzione peggiora il comportamento di un LLM.
- **La latenza** delle CLI, che ripartono a ogni richiesta: 8–10 s con Codex e opencode.
- **Battute sovrapposte**: in una conversazione due agenti parlano talvolta quasi insieme, perché una battuta arriva mentre l'altro sta ancora pensando.

## Modifiche al processo proposte
Nessuna adottata: l'utente ha preferito non aggiungere regole a un processo che finora ha funzionato («perché imporre un processo troppo rigido?»). Restano qui come note.

- **Scene di prova per gli agenti nel repository.** Le scene usate per le prove dal vivo (commissione, «Cosa vedi?», conversazione tra agenti) diventano uno script del progetto, da lanciare quando cambiano le istruzioni: una regressione manuale, con costi dichiarati.
- **L'host segnala il proprio codice cambiato.** In sviluppo, se cambia il codice di yw3d mentre l'host gira, il terminale dice di riavviarlo.
- **Le decisioni che toccano l'architettura si rileggono con l'utente prima di scrivere costituzione e roadmap.**

Proposte tecniche per le fasi successive: una sessione della CLI tenuta aperta per ridurre la latenza; il turno di parola nelle conversazioni tra agenti; le API dal vivo quando ci saranno le chiavi.
