# Diagnostica (DEBUG)

Spec viva: strumenti diagnostici. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### DEBUG-001 — Overlay diagnostico
*Introdotto in F01 · ultima modifica: F05.*
- **a** `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, collegamento (host o solo browser; con l'host: indirizzo, numero di viste collegate, se questa vista guida il giocatore o guarda, ritardo di andata e ritorno), modalità (giocatore in prima o terza persona, camera libera), posizione della camera (in blocchi e in metri), posizione e velocità del giocatore, se è a terra o in acqua, numero di personaggi e, per il più vicino, identificativo, controllore (tipo e stato) e azione in corso, velocità della camera libera, seed, nome del file del mondo, numero di strutture per tipo, numero di avvisi, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione, durata dell'ultimo passo di simulazione.
