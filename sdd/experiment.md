# Esperimento: l'SDD scala su un progetto complesso?

## Domande
1. Il costo di specificare e implementare una fase cresce con la dimensione del progetto?
2. Le spec restano affidabili nel tempo (poche correzioni, poca divergenza dal codice)?
3. L'overhead documentale si ripaga in qualità?
4. Dove si rompe il processo, e perché?

## Ipotesi
Ogni retro dice se i dati le confermano, le smentiscono o non bastano ancora.

- **H1 — Contesto.** Grazie alle spec vive, la documentazione da leggere per implementare una fase cresce meno che linearmente con il numero di fasi.
- **H2 — Stabilità.** Gli emendamenti alla spec dopo l'approvazione restano pochi (≤ 2 per fase) e non aumentano col tempo.
- **H3 — Qualità.** I difetti dovuti a spec ambigue o incomplete diminuiscono dopo le prime fasi.
- **H4 — Overhead.** Il rapporto tra righe di documentazione e righe di codice per fase resta stabile o scende.
- **H5 — Tracciabilità.** A fine fase la matrice requisiti → task → test è completa senza correzioni manuali estese.

## Metriche
Raccolte in ogni `retro.md`; definizioni nel [template](templates/retro.md).

| Fase | Req. A/M/R | Criteri u/e/m | Task pian. / `+` | Emend. | Deviaz. | AC al 1° colpo | Righe contesto | LOC src/test | Doc/LOC | Difetti post-chiusura s/p/c |
|---|---|---|---|---|---|---|---|---|---|---|
| F01 | 19/0/0 | 34/4/17 | 14 / – | – | – | – | – | – | – | – |

*Legenda:* A/M/R = aggiunti/modificati/rimossi; u/e/m = unit/e2e/manuale; s/p/c = origine del difetto: spec/piano/codice.

## Diario
Note brevi e datate su ciò che si osserva del processo, anche quando non rientra nelle metriche.

- **2026-09-26** Avvio. Per F01 spec e piano sono scritti insieme, perché lo stack va validato insieme ai requisiti. Dalla F02 si segue il gate G1 → piano.
- **2026-09-26** Domande aperte di F01 chiuse con l'utente, una per una (Q1–Q5, D-001…D-006). Due risposte si sono discostate dalle proposte. (1) Mondo da 256 m invece di 128 m (Q3): da sola ha toccato 2 criteri della spec (WORLD-002.a, PERF-001.a) e 6 punti del piano, e ha richiesto una sotto-decisione (budget di caricamento 5 s). Prima del codice, il cambiamento è costato solo modifiche ai documenti. (2) D-005: niente comandi Claude Code per i passi del processo; si procede a voce seguendo `process.md`.
