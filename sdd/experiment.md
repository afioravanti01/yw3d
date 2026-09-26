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
| F01 | 19/0/0 | 35/4/17 | 14 / 2 | 2 | 16 | 56/56 | 536 | 1833/1229 | 0,21 | 0/0/1 |
| F02 | 17/4/0 | 45/7/11 | 16 / 2 | 2 | 3 | 63/63 | 697 | 2388/1362 | 0,17 | 0/0/0 |

*Legenda:* A/M/R = aggiunti/modificati/rimossi; u/e/m = unit/e2e/manuale; s/p/c = origine del difetto: spec/piano/codice.

## Diario
Note brevi e datate su ciò che si osserva del processo, anche quando non rientra nelle metriche.

- **2026-09-26** Avvio. Per F01 spec e piano sono scritti insieme, perché lo stack va validato insieme ai requisiti. Dalla F02 si segue il gate G1 → piano.
- **2026-09-26** Domande aperte di F01 chiuse con l'utente, una per una (Q1–Q5, D-001…D-006). Due risposte si sono discostate dalle proposte. (1) Mondo da 256 m invece di 128 m (Q3): da sola ha toccato 2 criteri della spec (WORLD-002.a, PERF-001.a) e 6 punti del piano, e ha richiesto una sotto-decisione (budget di caricamento 5 s). Prima del codice, il cambiamento è costato solo modifiche ai documenti. (2) D-005: niente comandi Claude Code per i passi del processo; si procede a voce seguendo `process.md`.
- **2026-09-26** Revisione del piano F01 punto per punto: 17 domande in 5 blocchi tematici. L'utente ha accettato tutte le proposte, ma 3 proposte erano già migliorie emerse rileggendo il piano per preparare le domande (P5 variazione di colore a chiazze, P12 screenshot per la revisione visiva, P14 domain warping del terreno). Osservazione: costruire le alternative di ogni decisione ha migliorato il piano più delle risposte stesse. Il gate G2 fatto così costa, ma rende esplicite scelte che altrimenti resterebbero implicite nel codice.
- **2026-09-26** F01, T1.01–T1.12 completati in autonomia fino al punto di controllo. 0 emendamenti alla spec, 13 deviazioni dal piano, tutte sul *come* (versioni degli strumenti, parametri e componenti in più del generatore di terreno, ottimizzazioni, ordine di installazione di Playwright). Nessun task imprevisto. Il costo maggiore non è venuto dal processo ma dall'ambiente: un blocco di npm con molte connessioni parallele ha fatto perdere circa 15 minuti. Il processo ha retto: ogni scostamento aveva un posto dove essere registrato e la matrice di tracciabilità è stata utile a ogni commit. Due volte ho corretto la matrice verso l'onestà: ho tolto dai titoli dei test ID che coprivano criteri solo in parte, e ho spostato i dati di prova dello script perché gonfiavano la copertura.
- **2026-09-26** F01, dal punto di controllo alla verifica. Dalla demo sono nati 2 emendamenti, entrambi richieste nuove dell'utente e non correzioni di ambiguità: frecce oltre a WASD (A1.1) e terreno con aree pianeggianti per costruirci sopra in F02 (A1.2). A1.2 è stato deciso con un prototipo fuori dal codice e misure su 5 seed, poi tradotto in un criterio `[unit]` nuovo (WORLD-006.h): il giudizio estetico è diventato un vincolo verificabile. I 2 task `+` e l'aggiornamento dell'hash hanno trovato posto nel processo senza attriti. Il cambio di macchina (da WSL2 a macOS) ha prodotto 2 deviazioni. Dalla domanda «il mondo cambia al refresh?» sono nate 3 note per la spec di F02 (seed nel YAML, posizione relativa al suolo, versione del generatore).
- **2026-09-26** F02 dalla spec alla verifica nella stessa giornata. Le domande aperte (Q1–Q8) sono state chiuse con l'utente in due blocchi di scelte guidate, tutte sulle proposte. Il piano ha retto con 3 deviazioni, tutte di ordine o di strumenti. Due episodi da ricordare: (1) un commit con un test rosso in T2.11, perché la catena di comandi controllava l'esito di `grep` invece di quello di `npm run check`, corretto con un commit esplicito; (2) il primo difetto post-chiusura, nello script di tracciabilità di F01, rivelato dalla prima fase con requisiti MODIFICATI. La modifica di un requisito di una fase chiusa (Z e X per la camera) è passata come previsto dalla spec della fase in corso (A2.2), senza toccare la spec storica. Le proiezioni ASCII delle strutture si sono rivelate un controllo visivo economico quando l'app non poteva ancora mostrarle.
