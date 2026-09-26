# Applicazione (APP)

Spec viva: avvio e parametri. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### APP-001 — Parametri di avvio
*Introdotto in F01 · ultima modifica: F02.*
- **a** `[e2e]` Il seed del terreno è quello del file del mondo. Il parametro URL `?seed=<intero>` lo sostituisce, per esplorare varianti, e un avviso visibile lo segnala.
- **b** `[e2e]` Con un seed non valido compare un avviso visibile e si usa il seed del file.

### APP-002 — Mondo predefinito
*Introdotto in F02 · ultima modifica: F02.*
- **a** `[manuale]` Il mondo predefinito del progetto è una valle con almeno un bosco misto, alberi sparsi nei prati, un piccolo borgo di case con entrambi gli stili e laghetti con salici sulle sponde.

### APP-003 — Modalità solo browser
*Introdotto in F04 · ultima modifica: F04.*
- **a** `[e2e]` Aperta senza host (server di sviluppo o build statica del progetto), l'app funziona come in F03 con i mondi del progetto, `?world=` e `?seed=`.
- **b** `[e2e]` Aperta dall'host, l'app si collega all'host e ignora `?world=`; il seed può essere sostituito solo con `--seed` del comando.
