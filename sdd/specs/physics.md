# Fisica (PHYS)

Spec viva: entità fisiche, passo di simulazione, gravità, collisioni, salto, gradini e acqua. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PHYS-001 — Entità e intenzioni
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[unit]` Un'entità fisica ha un volume a scatola allineata agli assi (larghezza e altezza in blocchi), una posizione e una velocità.
- **b** `[unit]` Il codice che guida un'entità esprime solo intenzioni: direzione e andatura del movimento orizzontale, salto, salita e discesa in acqua. Dopo lo spawn la posizione cambia solo nel passo di simulazione (P3).
- **c** `[unit]` Lo spawn colloca l'entità in un punto libero: se il punto richiesto interseca blocchi solidi, l'entità sale fino al primo spazio libero sopra di essi.

### PHYS-002 — Passo fisso e determinismo
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[unit]` La simulazione avanza a passo fisso di 1/60 s, indipendentemente dal frame rate del rendering.
- **b** `[unit]` Stesso mondo, stesso stato iniziale e stessa sequenza di intenzioni per passo producono posizioni e velocità identiche in esecuzioni ripetute.
- **c** `[unit]` Simulare lo stesso tempo con frame rate diversi (30, 60, 144 fps) porta allo stesso stato.
- **d** `[e2e]` Una sequenza di intenzioni eseguita nel browser porta allo stesso stato che in Node.
- **e** `[manuale]` Il movimento a schermo è fluido anche con frame rate diverso da 60 fps (nessuno scatto dovuto al passo fisso).

### PHYS-003 — Gravità
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[unit]` Un'entità non sostenuta accelera verso il basso con l'accelerazione di gravità (Q1), fino a una velocità massima di caduta.
- **b** `[unit]` Un'entità che cade si ferma appoggiata sulla faccia superiore del primo blocco solido sotto di sé ed è "a terra".

### PHYS-004 — Collisioni con i blocchi
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[unit]` Dopo ogni passo il volume di un'entità non interseca alcun blocco solido. Verificato con percorsi casuali di almeno 10 000 passi nel mondo predefinito.
- **b** `[unit]` Contro un muro l'entità scivola: la componente del movimento parallela al muro si conserva.
- **c** `[unit]` Alla massima velocità (caduta e corsa) un'entità non attraversa un muro o un pavimento spesso un blocco.
- **d** `[unit]` I blocchi non solidi (aria, acqua, foglie: vedi WORLD-004 modificato) non fermano l'entità.

### PHYS-005 — Salto e gradini
*Introdotto in F03 · ultima modifica: F03.*
- **a** `[unit]` Il salto parte solo da terra (o dall'acqua, vedi PHYS-006) e porta i piedi a un'altezza massima di 2,0–2,4 blocchi (1,0–1,2 m) sopra il punto di partenza (Q1).
- **b** `[unit]` Camminando contro un gradino alto 1 blocco l'entità lo sale senza saltare; un gradino alto 2 blocchi la ferma.
- **c** `[manuale]` La salita dei gradini è morbida: la visuale non scatta di un blocco a ogni gradino.

### PHYS-006 — Acqua
*Introdotto in F03 · ultima modifica: F03.*
Un'entità è "in acqua" quando almeno metà del suo volume è in blocchi d'acqua.
- **a** `[unit]` In acqua la velocità orizzontale massima è al più metà di quella a terra.
- **b** `[unit]` Senza intenzioni, un'entità in acqua galleggia: entro 3 s si stabilizza con la sommità del volume sopra il pelo dell'acqua.
- **c** `[unit]` Con le intenzioni di salita e discesa l'entità nuota verso l'alto o verso il fondo.
- **d** `[unit]` Dall'acqua l'entità risale su una riva alta 1 blocco sopra il pelo dell'acqua.
