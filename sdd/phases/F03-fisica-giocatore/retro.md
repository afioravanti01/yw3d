# F03 — Retrospettiva

Data di chiusura: 2026-09-26

## Verifica manuale
Eseguita dall'utente sulla build di produzione, con Chrome sul PC Windows di riferimento e build servita da macOS (come in F01 e F02).

| Criterio | Esito | Note |
|---|---|---|
| PHYS-002.e | ✓ | |
| PHYS-005.c | ✓ | |
| PLAYER-002.b | ✓ | Con le frecce ←/→ che ruotano (A3.1) |
| PLAYER-003.a | ✓ | |
| PLAYER-003.c | ✓ | Dopo la correzione dei capelli che sfarfallavano |
| PERF-003.a | ✓ | `step` 0,000 ms: sotto la risoluzione del timer del browser; in Node circa 0,0013 ms |
| PERF-003.b | ✓ | `load` 1 s, 75 fps |
| CAM-001.b | ✓ | Frecce ←/→ che ruotano anche nella camera libera (A3.3) |
| CAM-001.e | ✓ | |
| CAM-001.f | ✓ | Tasto C (A3.2), giocatore nascosto (A3.3) |
| DEBUG-001.a | ✓ | |

Verifica automatica: `npm run check` verde (164 test), `npm run e2e` verde (12 test), `npm run sdd:trace -- F03` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 11 / 3 / 0 |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 26 / 1 / 11 |
| Righe spec / piano | `wc -l` a chiusura | 137 / 163 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 13 / 2 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 3 |
| Deviazioni | righe della tabella deviazioni | 3 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 38 / 38 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 595 (69 + 86 + 140 + 137 + 163) |
| LOC src / test | righe prodotte nella fase (saldo di `git diff` da F02) | 853 / 689 (più 6 negli script) |
| Doc/LOC | (righe spec + piano) / LOC src | 0,35 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-26); sessioni non registrate |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

## Ipotesi
- **H1 — Contesto.** Favorevole: 595 righe contro 697 di F02, con 47 requisiti vivi invece di 36. Le spec vive toccate pesano 140 righe; il costo è dominato da spec e piano della fase.
- **H2 — Stabilità.** Smentita in questa fase: 3 emendamenti, oltre la soglia di 2. Tutti nati alla demo, come richieste nuove dell'utente usando il gioco (frecce che ruotano, tasto C, figura nascosta nella camera libera), nessuno da ambiguità della spec. I controlli sono il punto in cui la spec scritta prima dell'uso si dimostra meno stabile.
- **H3 — Qualità.** Nessun difetto di spec. Due difetti di codice trovati dall'utente prima di G3 e corretti: capelli che sfarfallano (alla demo) e tasti bloccati dopo Esc (in verifica, T3.15+).
- **H4 — Overhead.** Sale: Doc/LOC da 0,17 a 0,35. La fisica ha molte regole in poco codice: le spec scalano con il comportamento, non con le righe di codice. Il rapporto va letto insieme al numero di criteri (38 in F03, 63 in F02).
- **H5 — Tracciabilità.** Confermata: copertura completa senza correzioni; il nuovo controllo di D-007 non ha segnalato problemi di formato.

## Cosa ha funzionato
- La fisica nel core, a passo fisso e senza trigonometria, è stata verificabile in Node regola per regola, e il determinismo browser/Node si è confermato su 20 s di movimento reale (PHYS-002.d).
- I test sul mondo predefinito (10 000 passi casuali, ingresso in ogni casa) hanno legato la fisica alle strutture di F02 senza mondi finti. La prova di mutazione ha confermato che il test dei passi casuali rileva davvero le compenetrazioni.
- Le tre richieste della demo sono passate dagli emendamenti senza attriti, compresa la modifica di un requisito vivo (CAM-001).

## Cosa non ha funzionato
- **Modello dell'acqua.** Il galleggiamento pianificato (P5) non rispettava i tempi della spec: due iterazioni prima del modello a molla con nuoto come comando di velocità. Una stima numerica già in fase di piano (tempo di risalita dal fondo) l'avrebbe mostrato.
- **Test scritti male al primo colpo.** Tre fallimenti erano errori del test, non del codice: un tempo di 0,05 s che è esattamente 3 passi, uno spawn che non intersecava il pavimento, un punto d'arrivo dentro la casa più vicino del previsto. Costo basso, ma ricorrente.
- **Tasti bloccati dopo Esc (T3.15+).** Il rilascio di un tasto durante l'uscita dalla cattura del mouse non arriva alla pagina: nessun test automatico poteva vederlo, perché dipende dal browser reale. Lo ha trovato l'utente in verifica.
- **Controlli definiti prima di provarli.** Tutti gli emendamenti riguardano tasti e visuali: scegliere i controlli a tavolino, prima di vederli, si è rivelato fragile.

## Modifiche al processo proposte
- Per i requisiti di controlli e interazione, prevedere nel piano un punto di controllo con l'utente **prima** di fissare i criteri manuali, oppure marcarli come provvisori fino alla demo.
- Nei piani con modelli numerici (fisica, acqua), aggiungere una verifica a tavolino dei tempi e delle grandezze richieste dalla spec prima di scegliere il modello.
