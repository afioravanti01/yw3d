# F07 — Retrospettiva

Data di chiusura: 2026-09-27

## Verifica manuale

| Criterio | Esito | Note |
|---|---|---|
| DIALOG-001.d | ✓ | Il fumetto del giocatore mostra anche il Markdown (A7.8) |
| DIALOG-005.e | ✓ | Con la regola nuova: si parla solo con i personaggi vicini (A7.5) |
| DIALOG-005.g | ✓ | |
| PY-004.a | ✓ | Tobia fa la commissione da Marta e riferisce; Bruno saluta, Nina chiede, Marta risponde |
| PY-005.a | ✓ | |
| PY-005.b | ✓ | Template di 31 righe, provato da un test che lo fa girare così com'è |
| DEBUG-001.a | ✓ | Programma e stato del personaggio più vicino |
| PERF-005.a | — | Folla in Python: gli fps non sono stati misurati alla verifica |

L'utente ha accettato la fase con «tutto ok» (G3).

Verifica automatica: `npm run check` verde (297 test, compresi i test della libreria Python), `npm run e2e` verde (28 test), `npm run sdd:trace -- F07` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 6 / 13 / 8 (CHAR-002 modificato da A7.8) |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 29 / 6 / 6 |
| Righe spec / piano | `wc -l` a chiusura | 178 / 252 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 14 / 5 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 7 (A7.1, A7.2, A7.4–A7.8; A7.3 proposto e rifiutato) |
| Deviazioni | righe della tabella deviazioni | 1 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 41 / 41 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 894 (162 + 302 + 178 + 252) |
| LOC src / test | righe prodotte nella fase (saldo di `git diff` da F06) | −884 / −40 (aggiunte 2028 / 1642, tolte 2912 / 1682) |
| Doc/LOC | (righe spec + piano) / LOC src aggiunte | 0,21 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-27), una sessione |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

## Ipotesi
- **H1 — Contesto.** Torna a scendere: 894 righe contro le 979 di F06, con una fase che tocca nove aree.
- **H2 — Stabilità.** Smentita di nuovo, ma in modo diverso da F06: 7 emendamenti, **tutti nati usando il sistema** durante la prova d'uso e la verifica, nessuno da ambiguità della spec. Riguardano la forma della console (A7.1, A7.4, A7.8), un comando nuovo (A7.2) e soprattutto una regola del mondo che l'utente ha rovesciato (A7.5, A7.6: si parla solo da vicino; D-011), con la conseguenza di una funzione nuova (A7.7: i personaggi si fanno domande).
- **H3 — Qualità.** La lezione di F06 ha funzionato: i criteri sull'esperienza e la prova d'uso hanno portato i problemi a galla quando costavano poco. La libreria Python, la parte più delicata, non ha avuto emendamenti: la sua forma ha retto all'uso vero.
- **H4 — Overhead.** 0,21 sulle righe aggiunte. La fase ha tolto più codice di quanto ne abbia aggiunto: sostituire il linguaggio dei comportamenti con una libreria Python di circa 600 righe ha ridotto il sistema.
- **H5 — Tracciabilità.** Confermata: `sdd:trace` ha trovato un requisito (DEBUG-001) realizzato ma non citato da nessun task.

## Cosa ha funzionato
- **La prova d'uso presto** (T7.09). L'utente ha usato console e libreria prima di esempi e guida: sette cambiamenti sono entrati mentre erano ancora economici, e gli esempi e la guida sono nati già nella forma giusta.
- **Lo strumento di commit** (T7.01). Ha fermato due commit rossi (T7.06 con due test da aggiornare, T7.11 con un file non formattato), che prima sarebbero passati.
- **Python vero nei test.** I test Vitest lanciano la libreria e programmi veri contro un host vero. Così sono emersi due difetti che un test simulato non avrebbe mostrato: il tempo rimasto di una `wait` al primo invio, e l'arresto con `SIGABRT` di Python alla chiusura, causato dal thread che leggeva lo stdin bufferizzato.
- **Interruzione e ripresa nella libreria.** Un solo meccanismo (le azioni interrotte si chiedono di nuovo) copre gestori, domande e client che prendono il personaggio; nessuna riscrittura.
- **Scene provate senza browser.** Uno script sull'host ha mostrato l'intera commissione di Tobia prima di chiedere all'utente di provarla.

## Cosa non ha funzionato
- **Lo strumento di commit non esegue gli e2e.** Un commit (T7.18+) è passato con un e2e rosso, corretto nel commit successivo.
- **Una regola decisa a tavolino è stata rovesciata dall'uso.** «`@nome` a qualunque distanza» era nella decisione D-010, nella spec e nel piano; usandola, l'utente ha preferito il contrario (D-011). Come per il DSL in F06, ma stavolta la prova d'uso l'ha fatto emergere prima della chiusura.
- **Una regola della mappa sorprende.** `walk_to` verso «Alberi dei prati» non muove Tobia, perché l'area copre quasi tutto il mondo e lui ci è già dentro (MAP-003.c). L'utente ha scelto di lasciare la regola; il template ora risponde «Sono già qui!».
- **Una misura manuale mancante.** Gli fps della folla, ora in Python, non sono stati misurati alla verifica.

## Modifiche al processo proposte
- **Commit con gli e2e quando serve.** `npm run commit` esegue anche `npm run e2e` quando il commit tocca l'interfaccia (`src/app`, `index.html`, `e2e/`), o con un'opzione esplicita.
- **Le regole d'interazione si provano prima di scriverle.** Per regole come «a chi arriva un messaggio», la spec le propone ma il piano le mette alla prova d'uso prima di costruirci sopra.
- **Le misure della verifica si chiedono una per una.** La checklist di G3 separa le misure da riportare (fps, tempi) dai controlli sì/no, e la chiusura registra esplicitamente quelle mancanti.
