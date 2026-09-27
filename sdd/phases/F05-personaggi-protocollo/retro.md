# F05 — Retrospettiva

Data di chiusura: 2026-09-26

## Verifica manuale
Eseguita dall'utente con gli esempi `examples/valle` (controllori in Python e JavaScript) ed `examples/folla` (20 personaggi, ognuno con il suo processo).

| Criterio | Esito | Note |
|---|---|---|
| CHAR-002.b | ✓ | Anche il giocatore in terza persona |
| CHAR-002.c | ✓ | |
| PROTO-003.d | ✓ | Guardiano in Python, pescatrice in JavaScript |
| PERF-005.a | ✓ | 75 fps con 20 personaggi e 20 controllori |
| DEBUG-001.a | ✓ | Riga `characters` dell'overlay |

Verifica automatica: `npm run check` verde (222 test), `npm run e2e` verde (20 test), `npm run sdd:trace -- F05` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 11 / 3 / 0 |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 30 / 1 / 5 |
| Righe spec / piano | `wc -l` a chiusura | 135 / 186 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 14 / 1 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 1 |
| Deviazioni | righe della tabella deviazioni | 3 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 36 / 36 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 678 (74 + 86 + 197 + 135 + 186) |
| LOC src / test | righe prodotte nella fase (saldo di `git diff` da F04) | 2226 / 1334 (più 170 negli esempi) |
| Doc/LOC | (righe spec + piano) / LOC src | 0,14 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-26); sessioni non registrate |
| Difetti post-chiusura | per origine spec / piano / codice | 1 / 0 / 0 (da aggiornare nelle fasi successive). Spec, trovato in F09 (A9.5): un personaggio fermo poteva restare appoggiato al bordo di un gradino, con i piedi in aria; nessun criterio diceva dove si ferma |

## Ipotesi
- **H1 — Contesto.** Stabile: 678 righe (F04: 633) con 65 requisiti vivi; le spec vive toccate pesano meno di 200 righe.
- **H2 — Stabilità.** Confermata: 1 emendamento (velocità dei personaggi), nato alla demo come nelle fasi precedenti.
- **H3 — Qualità.** Nessun difetto di spec. Una proposta della bozza (consenso a ogni avvio) è stata corretta prima di G1 dopo una domanda dell'utente: la spec l'ha intercettata prima del codice.
- **H4 — Overhead.** Scende al minimo finora: Doc/LOC 0,14, in una fase di molto codice.
- **H5 — Tracciabilità.** Confermata, senza correzioni.

## Cosa ha funzionato
- **Core prima, canali dopo.** Navigazione, azioni e percezione sono nate nel core, testate con mondi costruiti a mano; i controllori (processi e WebSocket) sono arrivati come strati sottili su una sessione già verificata.
- **Test con processi veri.** I controllori di prova sono piccoli programmi Node lanciati davvero: saluto, azioni, errori, uscita, blocco. Il test del controllore che non legge ha mostrato che il mondo non rallenta.
- **Misure prima delle ottimizzazioni.** La ricerca verso il laghetto è passata da 156 ms a 3 ms dopo averla misurata sul mondo predefinito; la griglia di navigazione da 673 a circa 500 ms.
- **Esempi come verifica.** Gli esempi in Python e JavaScript hanno fatto da prova d'uso del protocollo e da documentazione.

## Cosa non ha funzionato
- **Una regola della spec non tradotta bene nel piano.** Il costo doppio sull'acqua (P3) non realizzava Q3 alla lettera; scoperto scrivendo i test, corretto con due ricerche (deviazione).
- **Criteri di blocco ingenui.** La prima misura del blocco (distanza dalla meta) avrebbe fatto fallire i giri intorno alle case; corretta prima dei test sul mondo predefinito.
- **Conteggio nel riepilogo.** Nella presentazione della spec i requisiti aggiunti sono stati dichiarati 13 invece di 11: il riepilogo all'utente va derivato dal documento, non a memoria.
- **Script di modifica fragili.** Più volte le sostituzioni automatiche nei file sono fallite per la formattazione di Prettier; senza danni (lo script si fermava prima di scrivere), ma con tempo perso.

## Modifiche al processo proposte
- Quando una domanda risolta fissa una regola quantitativa (come Q3), il piano la riporta con un test che la esprime alla lettera, prima di scegliere l'algoritmo.
- I numeri dei riepiloghi per l'utente (requisiti, criteri) si ricavano con un comando, come quelli delle metriche.
