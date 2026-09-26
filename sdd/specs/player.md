# Giocatore (PLAYER)

Spec viva: misure, controlli e visuali del giocatore. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PLAYER-001 — Giocatore
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[unit]` Il giocatore è un'entità fisica larga 1,2 blocchi (0,6 m) e alta 3,5 blocchi (1,75 m), con gli occhi a 3,2 blocchi (1,6 m) da terra.
- **b** `[unit]` Il giocatore passa per la porta di ogni casa (STRUCT-006.b) e ci entra camminando dall'esterno.
- **c** `[unit]` All'avvio il giocatore compare nel punto indicato dal file del mondo (YAML-008) o, senza indicazione, al centro del mondo; in entrambi i casi appoggiato sul primo spazio libero sopra la superficie.

### PLAYER-002 — Controlli del giocatore
*Introdotto in F03 · ultima modifica: F03 (emendamento A3.1).*
- **a** `[unit]` Camminata a 4 m/s, corsa a 7 m/s tenendo premuto Shift (Q2).
- **b** `[manuale]` Un click cattura il puntatore ed Esc lo rilascia; il mouse ruota la visuale con inclinazione limitata a ±89°. W/A/S/D muovono nel piano orizzontale secondo la direzione di vista (posizione fisica dei tasti); le frecce ↑/↓ vanno avanti e indietro come W/S, le frecce ←/→ ruotano la visuale a sinistra e a destra; Spazio salta. In acqua Spazio o Z fanno salire, X fa scendere.

### PLAYER-003 — Visuale in prima e terza persona
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[manuale]` All'avvio la visuale è in prima persona, all'altezza degli occhi. Il tasto V alterna prima e terza persona.
- **b** `[unit]` In terza persona la camera sta dietro e sopra il giocatore, a 8 blocchi (4 m); se un blocco solido si mette in mezzo, la camera si avvicina fino a non attraversarlo.
- **c** `[manuale]` In terza persona il giocatore è visibile come una figura a blocchi semplice, orientata come la visuale (Q4).
