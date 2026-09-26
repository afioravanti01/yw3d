# Camera (CAM)

Spec viva: camera e controlli di visuale. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CAM-001 — Camera libera
*Introdotto in F01 · ultima modifica: F01 (emendamento A1.1).*
In F01 la camera non ha collisioni e attraversa il terreno.
- **a** `[manuale]` Un click sulla scena cattura il puntatore ed Esc lo rilascia; muovendo il mouse la visuale ruota, con inclinazione limitata a ±89°.
- **b** `[manuale]` W/A/S/D (posizione fisica dei tasti, indipendente dal layout della tastiera) muovono avanti, a sinistra, indietro e a destra nel piano orizzontale secondo la direzione di vista; le frecce ↑/←/↓/→ fanno lo stesso, in alternativa. Spazio sale, Shift scende.
- **c** `[manuale]` La rotella del mouse regola la velocità tra 2 e 40 m/s (default 8 m/s).
- **d** `[unit]` La camera resta entro i limiti del mondo estesi di 16 m su ogni lato e in alto, e non scende sotto y = 0.
- **e** `[manuale]` All'avvio la camera è sopra il centro del mondo, più in alto della superficie, e inquadra il terreno.
