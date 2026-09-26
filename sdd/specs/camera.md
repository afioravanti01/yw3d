# Camera (CAM)

Spec viva: camera e controlli di visuale. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CAM-001 — Camera libera
*Introdotto in F01 · ultima modifica: F03 (emendamenti A3.2, A3.3).*
Dalla F03 la camera libera è una modalità di debug: non ha collisioni e attraversa il terreno. I criteri a–d valgono in questa modalità.
- **a** `[manuale]` Un click sulla scena cattura il puntatore ed Esc lo rilascia; muovendo il mouse la visuale ruota, con inclinazione limitata a ±89°.
- **b** `[manuale]` W/A/S/D (posizione fisica dei tasti, indipendente dal layout della tastiera) muovono avanti, a sinistra, indietro e a destra nel piano orizzontale secondo la direzione di vista; le frecce ↑/↓ vanno avanti e indietro come W/S, le frecce ←/→ ruotano la visuale a sinistra e a destra, come per il giocatore. Spazio e Z salgono, Shift e X scendono (Z e X per posizione fisica, come W/A/S/D).
- **c** `[manuale]` La rotella del mouse regola la velocità tra 2 e 40 m/s (default 8 m/s).
- **d** `[unit]` La camera resta entro i limiti del mondo estesi di 16 m su ogni lato e in alto, e non scende sotto y = 0.
- **e** `[manuale]` Passando alla camera libera, la camera parte dalla visuale corrente del giocatore.
- **f** `[manuale]` Il tasto C alterna giocatore e camera libera (modalità di debug). Mentre la camera libera è attiva il giocatore resta fermo dov'era e non è visibile; tornando al giocatore la visuale riprende dal giocatore.
