# Mappa (MAP)

Spec viva: identificatori, mappa del mondo e mete. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### MAP-001 — Identificatori
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` Personaggi, luoghi, strutture posate e distribuzioni condividono un unico spazio di identificatori: un id ripetuto è un errore nel formato di YAML-002. `player` è riservato al giocatore. L'id è obbligatorio per personaggi e luoghi, facoltativo per strutture e distribuzioni.
- **b** `[unit]` Una struttura o una distribuzione senza id ne riceve uno generato dal tipo e da un progressivo nell'ordine del file, nella forma `tipo#n`, che un id dichiarato non può avere: `n` conta da 1, per tipo, i soli elementi senza id (`pond#1`, `stone_farmhouse#2`; `scatter#1` per le distribuzioni) (Q10). Lo stesso file produce gli stessi id generati.
- **c** `[unit]` Il file del mondo, comportamenti compresi, può riferire solo id dichiarati: un riferimento a un id inesistente o generato è un errore. Protocollo e dialogo accettano anche gli id generati.

### MAP-002 — Mappa del mondo
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` La mappa contiene nome e descrizione del mondo e una voce per ogni luogo, struttura posata, distribuzione e personaggio, e per il giocatore, con id, nome, descrizione e tipo.
- **b** `[unit]` Per luoghi, strutture e distribuzioni la voce riporta la posizione e l'ingombro orizzontale (punto, rettangolo o cerchio), e per le strutture la quota della base. Per personaggi e giocatore riporta la posizione di partenza: la posizione attuale arriva solo con la percezione (PROTO-002.a).
- **c** `[unit]` Le strutture generate da una distribuzione non hanno una voce propria.
- **d** `[unit]` La mappa dipende solo dal file del mondo e dal codice registrato, ed è la stessa per tutti i personaggi e su tutti i canali (comportamenti, stdio, WebSocket).

### MAP-003 — Elementi della mappa come mete
*Introdotto in F06 · ultima modifica: F06.*
- **a** `[unit]` `walk_to` e `look_at` accettano come meta l'id di qualunque elemento della mappa; `follow` solo quello di un personaggio o del giocatore, altrimenti l'azione fallisce con la causa. `look_at` verso un elemento esteso guarda il centro del suo ingombro.
- **b** `[unit]` Verso una struttura, `walk_to` arriva al punto d'arrivo dichiarato dal suo tipo: per le case davanti alla porta, all'esterno; per i laghetti sulla sponda, nel punto più vicino al personaggio; per gli alberi ai piedi del tronco. Senza un punto dichiarato, arriva al punto raggiungibile del bordo dell'ingombro più vicino al personaggio.
- **c** `[unit]` Verso un luogo-punto arriva al punto; verso un'area (luogo o distribuzione) al punto raggiungibile dell'area più vicino al personaggio. Se il personaggio è già dentro l'area l'azione è subito completata.
- **d** `[unit]` Un elemento senza punti raggiungibili fa fallire l'azione con la causa (NAV-001.c).
