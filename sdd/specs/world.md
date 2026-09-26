# Mondo (WORLD)

Spec viva: unità, coordinate, blocchi, generazione del terreno. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### WORLD-001 — Unità e coordinate
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` La posizione di un blocco è una terna di interi (x, y, z) in unità blocco; il blocco (x, y, z) occupa il cubo [x, x+1) × [y, y+1) × [z, z+1).
- **b** `[unit]` Un blocco misura 0,5 m di lato. Il core espone un'unica definizione di questo fattore e le funzioni di conversione tra blocchi e metri.

### WORLD-002 — Mondo finito
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` Le dimensioni del mondo (X, Y, Z in blocchi) sono configurabili; default 512 × 96 × 512, cioè 256 m × 48 m × 256 m.
- **b** `[unit]` Sono valide dimensioni multiple di 32, con X e Z tra 32 e 1024 e Y tra 32 e 256. Un valore non valido produce un errore che indica il valore e il vincolo violato.
- **c** `[unit]` La lettura di un blocco fuori dai limiti restituisce `air`.
- **d** `[unit]` La scrittura fuori dai limiti non modifica il mondo e restituisce un esito negativo, senza lanciare eccezioni.

### WORLD-003 — Lettura, scrittura e notifica delle modifiche
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` Dopo aver scritto un tipo in una posizione, la lettura della stessa posizione restituisce quel tipo.
- **b** `[unit]` Ogni scrittura che cambia davvero un blocco produce una notifica con la posizione; una scrittura che non cambia nulla non produce notifiche.
- **c** `[unit]` Un osservatore delle modifiche può registrarsi e deregistrarsi.

### WORLD-004 — Registro dei tipi di blocco
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` Ogni tipo di blocco ha: id numerico stabile, nome univoco, colore base, ampiezza della variazione di colore, `solid` (blocca il movimento; servirà in F03), `opaque` (nasconde le facce adiacenti).
- **b** `[unit]` Registrare un nome o un id già usato produce un errore.
- **c** `[unit]` Sono registrati i tipi di F01: `air` (id 0, non solido, non opaco), `grass`, `dirt`, `stone`.
- **d** `[unit]` Codice esterno al core può registrare un nuovo tipo senza modificare il core.

### WORLD-005 — Generazione deterministica
*Introdotto in F01 · ultima modifica: F01.*
Il seed è un intero senza segno a 32 bit.
- **a** `[unit]` Stessi seed e configurazione producono un mondo identico (stesso hash del contenuto) in esecuzioni ripetute.
- **b** `[unit]` Per un seed di riferimento l'hash è fissato nei test: se l'output del generatore cambia, il valore va aggiornato esplicitamente e il cambiamento registrato come deviazione.
- **c** `[unit]` 10 seed diversi producono 10 hash diversi.
- **d** `[e2e]` Il mondo generato nel browser ha lo stesso hash di quello generato in Node con lo stesso seed.

### WORLD-006 — Terreno naturale
*Introdotto in F01 · ultima modifica: F01 (emendamento A1.2).*
Verificato con la configurazione di default su 5 seed di test.
- **a** `[unit]` L'altezza della superficie di ogni colonna è compresa tra 16 e 72 blocchi (8–36 m).
- **b** `[unit]` Pendii dolci: almeno l'85% delle coppie di colonne adiacenti ha un dislivello di al più 1 blocco.
- **c** `[unit]` Rilievo percepibile: la differenza tra il 95° e il 5° percentile delle altezze è di almeno 16 blocchi (8 m).
- **d** `[unit]` Stratificazione, senza vuoti sotto la superficie: una colonna erbosa è, dal basso, pietra, poi 3–5 blocchi di terra, poi erba; una colonna rocciosa è tutta pietra.
- **e** `[unit]` Una colonna è rocciosa se il dislivello con almeno uno dei 4 vicini è di 3 blocchi o più; può esserlo anche nelle zone rocciose dei rilievi.
- **f** `[unit]` Almeno il 60% delle colonne ha erba in superficie e almeno l'1% ha roccia affiorante.
- **g** `[manuale]` L'insieme appare come una valle naturale con ampie radure pianeggianti, colline morbide e uno o più poggi con roccia, non come rumore casuale.
- **h** `[unit]` Aree pianeggianti: almeno il 25% delle colonne appartiene a una zona di 16 × 16 blocchi (8 m × 8 m) con dislivello interno di al più 1 blocco.
