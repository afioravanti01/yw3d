# Spec vive

Descrivono **come si comporta il sistema oggi**, area per area. Nascono e si aggiornano solo alla chiusura di una fase, fondendo il delta della sua spec (vedi [process.md](../process.md)). Tra una chiusura e l'altra la spec della fase in corso è la fonte per le modifiche in arrivo.

Ogni file riporta, per ogni requisito, il testo in vigore, i criteri di accettazione e la fase che l'ha introdotto o modificato per ultima.

| Area | File | Contenuto | Introdotta in |
|---|---|---|---|
| ARCH | [`architecture.md`](architecture.md) | vincoli architetturali verificabili | F01 |
| WORLD | [`world.md`](world.md) | unità, coordinate, blocchi, generazione del terreno | F01 |
| RENDER | [`rendering.md`](rendering.md) | stile visivo e rendering | F01 |
| PERF | [`performance.md`](performance.md) | budget di prestazioni | F01 |
| CAM | [`camera.md`](camera.md) | camera e controlli di visuale | F01 |
| APP | [`app.md`](app.md) | avvio e parametri | F01 |
| DEBUG | [`debug.md`](debug.md) | strumenti diagnostici | F01 |
| SDD | [`tooling.md`](tooling.md) | strumenti del processo SDD | F01 |
| YAML, STRUCT | — | formato del mondo, strutture | F02 (prevista) |
| PHYS, PLAYER | — | fisica, giocatore | F03 (prevista) |
| CHAR, NAV, BEHAV | — | personaggi, navigazione, comportamenti | F04 (prevista) |
| AI, UI | — | personaggi AI, interfaccia di dialogo | F05 (prevista) |

*Aggiornate alla chiusura di F01 (2026-09-26).*
