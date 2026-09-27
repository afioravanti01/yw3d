# F06 — Retrospettiva

Data di chiusura: 2026-09-27

Fase sviluppata su un altro computer (T6.01–T6.20+); verifica, correzione T6.21+ e chiusura su questo.

## Verifica manuale

| Criterio | Esito | Note |
|---|---|---|
| BEHAV-007.a | ✓ | Gli esempi si comportano come descritto; ma il linguaggio, usato, è risultato scomodo (vedi sotto) |
| BEHAV-007.b | ✓ | La guida descrive ogni elemento; stessa riserva |
| DIALOG-001.d | ✓ | |
| DIALOG-002.b | ✓ | Il registro funziona come specificato, ma il dialogo nel suo insieme è risultato scomodo |
| DEBUG-001.a | ✓ | Con il pulsante «Stats» (A6.3) |

Dopo l'uso l'utente ha segnalato anche le scie dietro i nomi dei personaggi (A6.4): corrette in T6.21+ e verificate a mano.

Verifica automatica: `npm run check` verde (312 test), `npm run e2e` verde (26 test), `npm run sdd:trace -- F06` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 18 / 9 / 0 |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 69 / 6 / 5 |
| Righe spec / piano | `wc -l` a chiusura | 256 / 300 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 17 / 4 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 4 |
| Deviazioni | righe della tabella deviazioni | 5 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 80 / 80 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 979 (160 + 263 + 256 + 300) |
| LOC src / test | righe prodotte nella fase (saldo di `git diff` da F05) | 4264 / 2998 |
| Doc/LOC | (righe spec + piano) / LOC src | 0,13 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 2 giorni (2026-09-26/27), su due computer; sessioni non registrate |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

## Ipotesi
- **H1 — Contesto.** Primo segnale contrario: 979 righe contro le 678 di F05. La fase attraversa otto aree e la spec è la più lunga finora (256 righe). Resta da vedere se è la dimensione della fase o una tendenza.
- **H2 — Stabilità.** Smentita: 4 emendamenti. Due nati scrivendo il piano (A6.1, A6.2), due alla demo (A6.3, A6.4). E soprattutto, dopo la fase, il rifiuto dell'intero linguaggio (D-010).
- **H3 — Qualità.** Il dato più importante dell'esperimento finora: **una spec può essere soddisfatta in ogni criterio e risultare sbagliata**. I criteri di BEHAV verificavano che il linguaggio funzionasse (80 su 80 al primo colpo), non che fosse comodo da scrivere e da leggere. Nessun criterio misurava l'esperienza dell'autore.
- **H4 — Overhead.** Scende ancora (0,13), ma con 4264 righe di codice di cui circa 2500 saranno rimosse.
- **H5 — Tracciabilità.** Confermata. La matrice non poteva però segnalare il problema vero: tracciava criteri che non erano quelli giusti.

## Cosa ha funzionato
- **Mappa, id e mete.** `walk_to: laghetto1` con il punto d'arrivo per tipo di struttura, e la mappa nel saluto ai controllori: la parte di F06 che resta, e che serve a F07 e agli agenti.
- **Simulazione condivisa nel core.** La stessa simulazione gira nell'host e nel browser senza host.
- **Decisioni prese prima della bozza.** Sedici scelte guidate, con alternative, prima di scrivere la spec: la spec è nata stabile rispetto a ciò che era stato deciso.

## Cosa non ha funzionato
- **Il linguaggio dei comportamenti.** Deciso a tavolino (D-009) e costruito per intero (interprete, libreria, esempi, guida) prima che l'utente ne scrivesse uno per un personaggio vero. Provato, si è rivelato scomodo e poco leggibile: la fase successiva lo rimuove (D-010).
- **Il dialogo.** Avvicinarsi, puntare il personaggio e premere Invio, con un registro che mostra solo ciò che si sente, è risultato scomodo; i messaggi si perdevano.
- **Il commit rosso si è ripetuto** (T6.04), con la stessa causa di F02. La contromisura di F02 era una regola di comportamento, non uno strumento: su un altro computer, con un'altra sessione, non ha tenuto.
- **Difetto visivo trovato solo a mano** (scie dei nomi): il browser dei test disegna in software e non lo mostra.

## Modifiche al processo proposte
- **Prova d'uso presto.** Per un linguaggio, un'interazione o un'API per gli autori, il piano prevede subito un punto di controllo in cui l'utente scrive o usa qualcosa di vero, **prima** di costruire libreria, esempi e guida.
- **Criteri sull'esperienza.** Accanto ai criteri funzionali, la spec di un linguaggio o di un'interazione dichiara criteri manuali sulla sua comodità (es. «un comportamento con tre reazioni si scrive e si rilegge in pochi minuti»).
- **Il controllo prima del commit diventa uno strumento.** Uno script del progetto (`npm run commit` o un hook di git) che registra il commit solo se `npm run check` termina con successo, invece di una regola affidata alla memoria.
