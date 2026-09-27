# Personaggi (CHAR)

Spec viva: personaggi del file del mondo, figure animate, fumetti. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CHAR-001 — Personaggi nel file del mondo
*Introdotto in F05 · ultima modifica: F06.*
- **a** `[unit]` La sezione `characters` del file del mondo dichiara personaggi con id (MAP-001), nome e descrizione (YAML-009), posizione orizzontale di partenza, orientamento facoltativo, aspetto facoltativo (colori di pelle, capelli, maglia, pantaloni) e, facoltativo, un comportamento (BEHAV-001) o un controllore. Id ripetuti e posizioni fuori dal mondo sono errori nel formato di YAML-002.
- **b** `[unit]` Ogni personaggio è un'entità fisica con le misure del giocatore, che parte sul primo spazio libero sopra la superficie (PLAYER-001.c) e si muove solo con intenzioni (P3).
- **c** `[unit]` Un personaggio senza comportamento né controllore, o con il controllore fermo o assente, sta fermo.
- **d** `[e2e]` Le viste mostrano i personaggi nelle posizioni simulate dall'host. In modalità solo browser i personaggi con un comportamento agiscono (BEHAV-001.f), quelli con un controllore compaiono fermi nella posizione di partenza.

### CHAR-002 — Figura e animazioni
*Introdotto in F05 · ultima modifica: F06 (emendamento A6.4).*
- **a** `[unit]` La posa della figura (testa, busto, braccia, gambe) dipende solo dallo stato del personaggio: fermo, camminata e corsa con l'oscillazione degli arti proporzionale alla velocità, salto o caduta, nuoto, parlata.
- **b** `[manuale]` Le animazioni sono fluide e leggibili: si capisce a colpo d'occhio se un personaggio sta fermo, cammina, corre, salta, nuota o parla. Il giocatore in terza persona, e visto dagli spettatori, usa la stessa figura animata con i suoi colori (Q7).
- **c** `[manuale]` Ciò che un personaggio dice compare in un fumetto sopra la testa, per un tempo proporzionale alla lunghezza del testo.
- **d** `[e2e]` Sopra ogni personaggio entro 48 blocchi (24 m) compare il suo nome, e sopra il giocatore dove si vede la sua figura (terza persona, camera libera, viste che guardano); quando parla, il fumetto sta sopra il nome.
