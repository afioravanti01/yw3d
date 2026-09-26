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
