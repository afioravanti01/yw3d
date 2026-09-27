# Rendering (RENDER)

Spec viva: stile visivo e rendering. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### RENDER-001 — Colore senza texture
*Introdotto in F01 · ultima modifica: F01.*
Palette naturalistica calda e leggermente desaturata, con luce dorata da tardo pomeriggio (Q4).
- **a** `[unit]` Sui blocchi non si applicano texture bitmap: il colore di ogni vertice deriva dal colore base del tipo di blocco.
- **b** `[unit]` Ogni blocco ha una variazione di colore deterministica che dipende dalla sua posizione: stessa posizione, stesso colore. La luminosità resta entro l'ampiezza di variazione del tipo (es. ±8% per l'erba).
- **c** `[manuale]` I prati mostrano variazioni organiche: né un colore piatto, né un rumore a scacchiera.

### RENDER-002 — Occlusione ambientale per vertice
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` Ogni vertice di una faccia visibile ha uno di 4 livelli di occlusione, calcolato dai 3 blocchi che toccano il vertice dal lato della faccia (due laterali e uno d'angolo). Se entrambi i laterali sono opachi il livello è il massimo.
- **b** `[unit]` La diagonale di ogni faccia è scelta in modo che l'occlusione si interpoli senza artefatti legati alla direzione.
- **c** `[manuale]` Spigoli interni e piedi dei gradini sono visibilmente più scuri; nessuna cucitura evidente tra regioni del mondo.

### RENDER-003 — Luce e ombre
*Introdotto in F01 · ultima modifica: F09.*
- **a** `[manuale]` Il sole si muove secondo l'ora: sorge a est, è alto a mezzogiorno, tramonta a ovest; le ombre di rilievi, alberi e case lo seguono. Di notte la luce viene dalla luna.
- **b** `[manuale]` Una luce ambientale cielo/terra, che cambia con l'ora, dà luminosità diverse a facce con orientamenti diversi; le facce in ombra non sono mai nere, nemmeno di notte.

### RENDER-004 — Cielo e nebbia
*Introdotto in F01 · ultima modifica: F09.*
- **a** `[manuale]` Il cielo è un gradiente verticale, chiaro all'orizzonte e più saturo allo zenit, con colori che seguono l'ora: azzurro di giorno, caldi all'alba e al tramonto, blu scuro con le stelle di notte. Si vedono il sole e, di notte, la luna.
- **b** `[manuale]` La nebbia aumenta con la distanza e ha il colore dell'orizzonte: il terreno lontano sfuma nel cielo senza uno stacco netto.

### RENDER-005 — Aggiornamento incrementale
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` Dopo la modifica di un blocco si ricostruisce solo la geometria della regione che lo contiene e, se il blocco è sul confine di una regione, delle regioni confinanti.
- **b** `[e2e]` Una modifica fatta tramite l'API del core si vede nella scena entro il frame successivo.
- **c** `[manuale]` Ricostruire una regione richiede al più 16 ms sull'hardware di riferimento (valore mostrato nell'overlay).

### RENDER-006 — Bordi del mondo
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` Le facce dei blocchi sul confine esterno del mondo vengono generate: il mondo appare come un plastico chiuso, con la sezione degli strati visibile ai lati.
- **b** `[manuale]` Guardando verso il bordo dall'interno, la nebbia lo attenua; guardando dall'esterno, la sezione del terreno si legge bene.

### RENDER-007 — Acqua
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[unit]` Le facce tra due blocchi d'acqua non si generano; le facce tra acqua e un blocco opaco nemmeno.
- **b** `[manuale]` L'acqua è semitrasparente: si vede il fondale vicino alla riva, meno dove è profonda. Il colore è in armonia con la palette di RENDER-001.
- **c** `[manuale]` Nessun artefatto evidente tra acqua e terreno (facce che tremolano, buchi, ordine di disegno sbagliato) guardando da sopra e di lato.

### RENDER-008 — Notte leggibile
*Introdotto in F09 · ultima modifica: F09.*
- **a** `[manuale]` Di notte il mondo si vede: una luce lunare fredda e debole, il cielo blu scuro con le stelle, le forme riconoscibili a qualche decina di metri.
- **b** `[manuale]` Di notte le finestre delle case sono illuminate di una luce calda, visibile da lontano; di giorno no.
