# Architettura (ARCH)

Spec viva: vincoli architetturali verificabili. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### ARCH-001 — Core indipendente dal rendering
*Introdotto in F01 · ultima modifica: F01.*
Il codice del core (stato e logica del mondo) non dipende da Three.js né dalle API del browser.
- **a** `[unit]` Un import di Three.js nel core fa fallire `npm run check`; lo stesso vale per l'uso di API del DOM.
- **b** `[unit]` Tutti i test del core girano in Node, senza browser né GPU.
