# Diagnostica (DEBUG)

Spec viva: strumenti diagnostici. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### DEBUG-001 — Overlay diagnostico
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, posizione della camera (in blocchi e in metri), velocità, seed, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione.
