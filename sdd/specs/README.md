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
| CHAR | [`characters.md`](characters.md) | personaggi, figure animate, fumetti | F05 |
| NAV | [`navigation.md`](navigation.md) | percorsi dei personaggi | F05 |
| PROTO | [`protocol.md`](protocol.md) | protocollo dei controllori | F05 |
| MAP | [`map.md`](map.md) | identificatori, mappa del mondo, mete | F06 |
| DIALOG | [`dialogue.md`](dialogue.md) | il giocatore parla con i personaggi: console dei messaggi, comprensione | F06 |
| PY | [`python.md`](python.md) | libreria Python, programmi nella cartella del mondo, esempi e guida | F07 |
| AGENT | [`agents.md`](agents.md) | agenti LLM guidati dall'host: configurazione, conoscenza del mondo, risposte, iniziativa, conversazioni, limiti | F08 |

*Aggiornate alla chiusura di F08 (2026-09-27). Il linguaggio dei comportamenti (BEHAV, F06) è stato rimosso in F07 (D-010).*
