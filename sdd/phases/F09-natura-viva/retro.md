# F09 — Retrospettiva

Data di chiusura: 2026-09-27

## Verifica manuale

| Criterio | Esito | Note |
|---|---|---|
| RENDER-003.a | ✓ | |
| RENDER-003.b | ✓ | |
| RENDER-004.a | ✓ | Stelle rimpicciolite e tolte da alba e tramonto durante la prova d'uso (T9.05) |
| RENDER-008.a | ✓ | |
| RENDER-008.b | ✓ | |
| TIME-003.a | ✓ | Ombre a scatti ogni decimo del giorno dopo A9.2: «ora va bene» |
| DEBUG-001.a | ✓ | |
| CHAR-003.b | ✓ | Screenshot di controllo in `e2e/screenshots/monkey.png` |
| CHAR-003.d | ✓ | Elisa in `examples/agenti`, Claude Code `haiku`, ogni 20 s |

Misure (riportate a parte, come chiede process.md dopo F07):

| Misura | Valore |
|---|---|
| fps medi a mezzogiorno, 30 s di volo a quota media (PERF-001.b) | circa 60 |
| fps medi di notte, 30 s di volo a quota media (PERF-001.b) | circa 60 |

L'utente ha confermato tutti i controlli e riportato le misure: «confermo tutto» (G3).

Verifica automatica: `npm run check` verde (349 test), `npm run e2e` verde (32 test), `npm run sdd:trace -- F09` con copertura completa dopo l'emendamento A9.6.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi | 5 / 10 / 1 (RENDER-009 aggiunto e poi rimosso nella fase stessa; CHAR-001 modificato da A9.1 e A9.5) |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 12 / 1 / 10 |
| Righe spec / piano | `wc -l` a chiusura | 145 / 174 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 13 / 2 / 2 annullati (T9.07 vento, T9.08 acqua) |
| Emendamenti | righe del registro emendamenti dopo G1 | 6 (A9.1–A9.6) |
| Deviazioni | righe della tabella deviazioni | 5 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 23 / 23 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 826 (162 + 345 + 145 + 174) |
| LOC src / test | saldo di `git diff` da F08 | 979 / 527 |
| Doc/LOC | (righe spec + piano) / LOC src | 0,33 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-27), almeno due sessioni (T9.10 e la verifica in una nuova) |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

Difetti di fasi chiuse emersi in F09:
- **F08, codice** (T9.15+): una CLI di un agente fermata per tempo limite lasciava vivi i processi che aveva lanciato, e la richiesta finiva solo con loro. Su macOS il test passava per una questione di tempi; su Linux fallisce sempre.
- **F05, spec** (A9.5, T9.14+): un personaggio fermo poteva restare appoggiato al bordo di un gradino, con i piedi in aria. Nessun criterio diceva dove si ferma un personaggio.

## Ipotesi
- **H1 — Contesto.** Sale a 826 righe da 749. Il motivo è l'ampiezza della fase, non la storia: l'ora tocca nove spec vive (percezione, libreria, agenti, console, overlay, file del mondo, prestazioni, personaggi, rendering). La crescita da F01 (536 righe) resta molto meno che lineare nel numero di fasi.
- **H2 — Stabilità.** Sei emendamenti, per la quarta fase di fila oltre la soglia di 2. Nessuno nasce da ambiguità della spec: uno è una richiesta nuova (la scimmietta), due sono rinunce dell'utente dopo aver visto (vento, acqua), uno è un aggiustamento della prova d'uso (ombre), uno è un difetto visto usando il mondo (gradino) e uno allinea il testo agli altri. Nella forma scritta H2 è smentita; nella sostanza gli emendamenti sono decisioni prese guardando, non errori della spec.
- **H3 — Qualità.** Nessun difetto da spec ambigue in F09. Sono però emersi due difetti di fasi chiuse. Uno era nascosto dai tempi di un sistema operativo (F08), l'altro si vedeva solo guardando i personaggi fermi (F05).
- **H4 — Overhead.** 0,33, da 0,18: una fase con poco codice e molti criteri sparsi su molte aree, come F03 (0,35). Il vento, scritto e poi tolto, non compare nel saldo.
- **H5 — Tracciabilità.** In parte confermata. Alla verifica `sdd:trace` ha segnalato sei problemi, tutti di testo: criteri rimossi rimasti al loro posto, un requisito modificato che non cambiava più nulla, due «Dopo» scritti in prosa. Riscrivendo DIALOG-005.f per intero è emerso anche un test mancante (`/time` in `/help`).

## Cosa ha funzionato
- **La luce come funzione pura dell'ora** (`daylight.ts`): colori, direzione del sole, stelle e finestre si provano senza browser, e la prova d'uso ha cambiato solo i valori, non la struttura.
- **La prova d'uso subito dopo il ciclo di luce** (T9.05): ha deciso il ritmo delle ombre (A9.2), la rinuncia all'acqua prima di scriverla (A9.4) e l'ombra a disco sotto le figure.
- **Lo strumento di commit** ha fermato un commit con un test rosso di un'altra area. Il test non era instabile: nascondeva un difetto vero di F08.
- **Gli e2e che leggono valori** (colore del cielo, finestre accese) invece di confrontare immagini: stabili anche con il WebGL software.

## Cosa non ha funzionato
- **Gli emendamenti che tolgono qualcosa non hanno aggiornato il resto della spec.** Dopo A9.3 e A9.4 l'obiettivo, PERF-001.b e RENDER-007 parlavano ancora di vento e acqua fino alla verifica. `sdd:trace` li ha trovati, ma solo alla fine.
- **Il vento è stato scritto e poi tolto** (T9.07): l'utente non poteva giudicarlo senza vederlo, ma nemmeno vedendolo si notava.
- **Test legati ai tempi della macchina.** Il test dell'ora nel browser pretendeva la velocità del tempo reale anche con i frame lenti. Il test di AGENT-006.c passava su macOS e falliva su Linux.
- **La rete di WSL in modalità `mirrored`** fa aspettare circa 2 minuti a ogni porta chiusa: ogni `npm run e2e` perde circa 4 minuti prima di iniziare.
- **Una richiesta a metà prova d'uso** (la scimmietta) ha spostato l'ordine dei task (deviazione), senza danni.

## Modifiche al processo proposte
Nessuna. Come deciso alla chiusura di F08, una regola nuova entra solo per un problema osservato. Quelli di questa fase sono stati presi dagli strumenti che ci sono già: `sdd:trace` per il testo della spec, lo strumento di commit per il test rosso.

Proposte tecniche per le fasi successive:
- particelle e audio ambientale, rinviati dalla spec;
- evitare l'attesa delle porte di Playwright sotto WSL `mirrored`.
