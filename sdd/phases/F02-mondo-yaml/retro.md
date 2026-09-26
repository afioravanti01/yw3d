# F02 — Retrospettiva

Data di chiusura: 2026-09-26

## Verifica manuale
Eseguita dall'utente: ricarica a caldo con `npm run dev`; prestazioni sulla build di produzione con Chrome sul PC Windows di riferimento, build servita da macOS (come in F01, opzione A).

| Criterio | Esito | Note |
|---|---|---|
| YAML-007.a | ✓ | `reload` 1 s (budget 5 s) |
| YAML-007.b | ✓ | |
| STRUCT-005.d | ✓ | |
| STRUCT-006.f | ✓ | |
| STRUCT-007.d | ✓ | |
| RENDER-007.b | ✓ | |
| RENDER-007.c | ✓ | |
| PERF-002.a | ✓ | `load` 2 s (budget 5 s), 60 fps |
| APP-002.a | ✓ | |
| DEBUG-001.a | ✓ | Nuovi campi: mondo, strutture per tipo, avvisi |
| CAM-001.b | ✓ | Z e X (A2.2) |

Verifica automatica: `npm run check` verde (135 test), `npm run e2e` verde (10 test), `npm run sdd:trace -- F02` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 17 / 4 / 0 |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 45 / 7 / 11 |
| Righe spec / piano | `wc -l` a chiusura | 182 / 227 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 16 / 2 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 2 |
| Deviazioni | righe della tabella deviazioni | 3 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 63 / 63 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 697 (69 + 86 + 133 + 182 + 227) |
| LOC src / test | righe prodotte nella fase (saldo di `git diff` da F01) | 2388 / 1362 (più 60 negli script) |
| Doc/LOC | (righe spec + piano) / LOC src | 0,17 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-26); sessioni non registrate |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

## Ipotesi
- **H1 — Contesto.** Dati non ancora decisivi: le righe di contesto passano da 536 a 697 (+30%), ma la fase è più grande (21 requisiti contro 19, 63 criteri contro 56). Le spec vive toccate pesano solo 133 righe: leggere lo stato attuale costa poco rispetto a spec e piano della fase.
- **H2 — Stabilità.** Confermata al limite: 2 emendamenti. A2.1 è di sola forma (i criteri modificati su righe proprie, per lo script); A2.2 è una richiesta nuova dell'utente (Z e X). Nessuno nasce da un'ambiguità della spec.
- **H3 — Qualità.** Primo dato: un difetto post-chiusura di F01, di origine codice (lo script di tracciabilità, vedi sotto). Nessun difetto da spec ambigua.
- **H4 — Overhead.** Scende: Doc/LOC da 0,21 a 0,17, con una fase di codice più grande.
- **H5 — Tracciabilità.** Confermata, con una correzione allo strumento: la matrice ha rivelato da sola il proprio difetto sui requisiti MODIFICATI (T2.18+).

## Cosa ha funzionato
- La pipeline pura nel core (analisi → validazione → composizione) ha reso verificabili in Node quasi tutti i criteri, compresi quelli sulle strutture posate nel mondo (porte raggiungibili nelle 4 rotazioni, acqua contenuta, raccordo del terreno su 20 seed).
- Le proiezioni ASCII di alberi, case e laghetti hanno anticipato difetti visivi (rami del salice fuori dalla chioma, finestra sulla trave d'angolo) prima che l'app potesse mostrare le strutture.
- Il prototipo dello schema proprio (P2) ha retto: un solo formato di messaggi dal terminale al pannello, con suggerimenti per i refusi.
- Il punto di controllo dopo T2.13, con screenshot reali, ha chiuso la revisione delle strutture in un solo giro.

## Cosa non ha funzionato
- **Un commit con un test rosso (T2.11).** La catena di comandi controllava l'esito di `grep`, non quello di `npm run check`. Corretto subito con un commit esplicito; da allora il commit parte solo se `check` termina con successo.
- **Difetto dello script di tracciabilità (F01).** Per un requisito MODIFICATO lo script teneva solo i criteri della fase e segnalava come inesistenti quelli invariati. Scoperto in T2.15, corretto in T2.18+. Il formato dei MODIFICATI aveva già richiesto l'emendamento di forma A2.1: il template e lo script non erano stati pensati insieme.
- **Ordine del piano.** Gli screenshot previsti a T2.07/T2.08 e il punto di controllo a T2.10 richiedevano l'app (T2.13): deviazione registrata. Un piano che promette verifiche visive deve mettere presto il modo di vederle.
- **Test lenti.** Un test sulle sponde superava i 5 s nella suite completa: le verifiche geometriche su mondi interi vanno scritte con attenzione al costo.

## Rivalutazione di D-005 (strumentazione SDD fatta in casa)
Dopo due fasi la strumentazione fatta in casa ha funzionato: template, convenzioni e `sdd:trace` hanno coperto spec delta, spec vive, emendamenti e task `+` senza attriti di processo. Il costo è stato un difetto dello script e un emendamento di forma, entrambi economici e visibili. **Proposta:** confermare D-005 senza framework, aggiungendo allo script un controllo di coerenza del formato della spec (criteri riconosciuti per ogni requisito, anche MODIFICATO).

## Modifiche al processo proposte
- Nel piano, le verifiche visive dei task devono dipendere da un task che renda visibile il risultato (o prevederne uno apposta).
- Il commit a fine task avviene solo se `npm run check` termina con successo (controllo del codice di uscita, non dell'output).
- `sdd:trace` avvisa quando un requisito della fase non ha criteri riconosciuti.
