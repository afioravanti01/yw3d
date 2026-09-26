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
| YAML | [`world-file.md`](world-file.md) | formato, validazione e caricamento dei file del mondo | F02 |
| STRUCT | [`structures.md`](structures.md) | registro e generazione delle strutture, adattamento al terreno | F02 |
| PHYS | [`physics.md`](physics.md) | entità fisiche, collisioni, salto, gradini, acqua | F03 |
| PLAYER | [`player.md`](player.md) | giocatore: misure, controlli, visuali | F03 |
| CLI | [`cli.md`](cli.md) | comando `yw3d`, cartella del mondo | F04 |
| HOST | [`host.md`](host.md) | host headless, viste collegate, ricaricamento | F04 |
| CHAR, NAV, PROTO | — | personaggi, navigazione, protocollo dei controllori | F05 (prevista) |
| AGENT, MCP, UI | — | agenti LLM, server MCP, dialogo | F06 (prevista) |

*Aggiornate alla chiusura di F04 (2026-09-26).*
