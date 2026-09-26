# Navigazione (NAV)

Spec viva: ricerca ed esecuzione dei percorsi dei personaggi. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### NAV-001 — Ricerca del percorso
*Introdotto in F05 · ultima modifica: F05.*
Un percorso è una sequenza di colonne percorribili: spazio libero per l'altezza del personaggio, gradini in salita di al più 1 blocco, discese di al più 3.
- **a** `[unit]` Tra due punti raggiungibili del mondo predefinito il percorso esiste e rispetta i vincoli; da fuori a dentro una casa passa dalla porta.
- **b** `[unit]` L'acqua si attraversa a nuoto solo se non c'è un'alternativa asciutta di lunghezza ragionevole (Q3).
- **c** `[unit]` Un punto irraggiungibile produce un fallimento con la causa (fuori dal mondo, nessun percorso), non un'attesa infinita.
- **d** `[unit]` La ricerca di un percorso da un capo all'altro del mondo predefinito richiede al più 50 ms.

### NAV-002 — Esecuzione dei percorsi
*Introdotto in F05 · ultima modifica: F05.*
- **a** `[unit]` L'host muove il personaggio lungo il percorso solo con intenzioni (P3) e l'azione termina quando il personaggio è entro 1 blocco dalla meta.
- **b** `[unit]` Se il personaggio resta bloccato per più di 2 s il percorso si ricalcola; dopo 3 tentativi l'azione fallisce con la causa.
