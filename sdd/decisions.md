# Registro delle decisioni

Formato: contesto, decisione, alternative, conseguenze. Una decisione non si riscrive: si supera con una nuova voce che la cita.

## D-001 — Piattaforma web: TypeScript, Three.js, Vite
Data: 2026-09-26 · Stato: **proposta**, si conferma con l'approvazione di F01

**Contesto.** Serve una base per un mondo a voxel programmabile via YAML e codice, sviluppato in larga parte da agenti AI dentro un processo SDD.

**Decisione.** Applicazione web in TypeScript, rendering con Three.js, build con Vite, test con Vitest e Playwright.

**Alternative.**
- *Godot 4*: editor, fisica e animazione pronti; ma scene e risorse passano dall'editor, e verifica e test headless da parte di un agente sono più scomodi.
- *Rust + Bevy*: prestazioni ottime; compilazioni lente, iterazione più costosa, API ancora in evoluzione rapida.
- *Unity*: pesante, centrato sull'editor, vincoli di licenza.

**Conseguenze.** Tutto è testo e la logica è testabile senza GPU, il che aiuta sia l'SDD sia gli agenti. Si esegue nel browser senza installazioni. Fisica voxel e animazioni si scrivono a mano; per un mondo a voxel è comunque la scelta tipica (collisioni AABB contro griglia, non un motore fisico generico). Prestazioni inferiori a un motore nativo, contenute con mondo finito e meshing per chunk.

## D-002 — Voxel da 0,5 m
Data: 2026-09-26 · Stato: **proposta** (spec F01, Q2)

**Contesto.** Differenziarsi da Minecraft (1 m) e permettere strutture più fini: tetti, finestre, alberi più organici.
**Decisione.** 1 blocco = 0,5 m; un personaggio adulto è alto circa 3,5 blocchi.
**Alternative.** 1 m: look Minecraft, strutture grezze. 0,25 m: molto dettaglio, ma 8 volte i blocchi di 0,5 m, con fisica, navigazione e meshing più costosi.
**Conseguenze.** A parità di area servono 8 volte i blocchi rispetto a 1 m: si compensa con un mondo finito (D-003).

## D-003 — Mondo finito
Data: 2026-09-26 · Stato: **proposta** (spec F01, Q3)

**Decisione.** Dimensioni fissate dalla configurazione (default 128 m × 128 m), senza streaming di chunk.
**Motivo.** Il mondo è scritto nel YAML, non esplorato all'infinito. Un mondo finito semplifica determinismo, fisica, navigazione e percezione dei personaggi AI.
**Alternative.** Mondo infinito con streaming: molta complessità, poco utile per un mondo dichiarativo.

## D-004 — Spec vive più spec di fase come delta
Data: 2026-09-26 · Stato: accettata

**Decisione.** Ogni fase ha una spec *delta* (AGGIUNTI, MODIFICATI, RIMOSSI). Alla chiusura il delta si fonde nelle spec vive per area (`sdd/specs/`), che descrivono il sistema com'è oggi.
**Alternative.** Solo spec per fase (stile Spec Kit): semplice, ma la verità si disperde tra le fasi. Un'unica spec monolitica sempre aggiornata: niente storia delle decisioni e documento sempre più difficile da revisionare.
**Conseguenze.** A ogni chiusura c'è un passo di merge da fare con cura. Il suo costo si misura nelle retro: è uno dei dati chiave dell'esperimento.

## D-005 — Strumentazione SDD fatta in casa
Data: 2026-09-26 · Stato: accettata, **da rivalutare nella retro di F02**

**Decisione.** Template markdown, convenzioni e uno script di tracciabilità, senza adottare un framework (Spec Kit, OpenSpec, Kiro).
**Motivo.** L'esperimento vuole osservare il processo in sé; un framework nasconde scelte e aggiunge dipendenze. Le convenzioni restano compatibili nello spirito (spec → piano → task; delta → spec vive), quindi un passaggio a un framework resta possibile.

## D-006 — Lingua
Data: 2026-09-26 · Stato: accettata

Documentazione in italiano; codice, identificatori, commenti nel codice e commit in inglese.
