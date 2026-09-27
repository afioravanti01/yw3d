# Personaggi (CHAR)

Spec viva: personaggi del file del mondo, figure animate, fumetti. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CHAR-001 — Personaggi nel file del mondo
*Introdotto in F05 · ultima modifica: F09 (emendamenti A9.1, A9.5).*
- **a** `[unit]` La sezione `characters` del file del mondo dichiara personaggi con id (MAP-001), nome e descrizione (YAML-009), posizione orizzontale di partenza, orientamento facoltativo, aspetto facoltativo (colori di pelle, capelli, maglia, pantaloni), corpo facoltativo (CHAR-003) e, facoltativo, un programma Python (PY-003), un controllore (PROTO-003) o un agente (AGENT-001): uno solo. Id ripetuti e posizioni fuori dal mondo sono errori nel formato di YAML-002.
- **b** `[unit]` Ogni personaggio è un'entità fisica con le misure del giocatore, o quelle del suo corpo (CHAR-003.a), che parte sul primo spazio libero sopra la superficie (PLAYER-001.c) e si muove solo con intenzioni (P3).
- **c** `[unit]` Un personaggio senza programma, controllore o agente, o con uno di questi fermo o assente, sta fermo.
- **d** `[e2e]` Le viste mostrano i personaggi nelle posizioni simulate dall'host; in modalità solo browser i personaggi compaiono fermi nella posizione di partenza.
- **e** `[unit]` Un personaggio fermo non resta appoggiato solo al bordo di un gradino: se sotto il suo centro non c'è appoggio, si scosta di quel poco che basta per scendere sulla propria colonna. Vale alla partenza e ogni volta che si ferma; il giocatore resta libero di stare sui bordi.

### CHAR-002 — Figura e animazioni
*Introdotto in F05 · ultima modifica: F08 (emendamento A8.1).*
- **a** `[unit]` La posa della figura (testa, busto, braccia, gambe) dipende solo dallo stato del personaggio: fermo, camminata e corsa con l'oscillazione degli arti proporzionale alla velocità, salto o caduta, nuoto, parlata.
- **b** `[manuale]` Le animazioni sono fluide e leggibili: si capisce a colpo d'occhio se un personaggio sta fermo, cammina, corre, salta, nuota o parla. Il giocatore in terza persona, e visto dagli spettatori, usa la stessa figura animata con i suoi colori (Q7).
- **c** `[manuale]` Ciò che un personaggio dice compare in un fumetto sopra la testa, per un tempo proporzionale alla lunghezza del testo e al più quello di una frase di 500 caratteri, con lo stesso Markdown della console (DIALOG-005.a); di un testo più lungo il fumetto mostra l'inizio, tagliato a una parola, e la console il testo intero.
- **d** `[e2e]` Sopra ogni personaggio entro 48 blocchi (24 m) compare il suo nome, e sopra il giocatore dove si vede la sua figura (terza persona, camera libera, viste che guardano); quando parla, il fumetto sta sopra il nome.

### CHAR-003 — Animali
*Introdotto in F09 (emendamento A9.1) · ultima modifica: F09.*
- **a** `[unit]` Un personaggio può dichiarare `body: monkey` (predefinito `human`): una scimmietta, alta circa 0,7 m, con un'entità fisica più piccola di quella di una persona. Si guida come ogni personaggio: con un agente, un programma o un controllore.
- **b** `[manuale]` La scimmietta ha una figura propria, simpatica e riconoscibile (pelo marrone, muso chiaro, coda lunga), che sta ferma, cammina, corre e salta con animazioni sue; ha il nome sopra la testa come gli altri.
- **c** `[unit]` L'agente di un animale riceve istruzioni da animale: non parla la lingua degli umani, si muove, guarda, segue, e al più emette versi brevi. Con l'iniziativa autonoma e un intervallo (`every`, AGENT-004.b) decide da sé dove andare.
- **d** `[manuale]` Con un agente autonomo, a ogni intervallo la scimmietta si sposta per il mondo in modo vivace e plausibile (verso alberi, persone, il laghetto), senza incastrarsi.
