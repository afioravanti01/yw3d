# Applicazione (APP)

Spec viva: avvio e parametri. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### APP-001 — Parametri di avvio
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[e2e]` Il parametro URL `?seed=<intero>` determina il seed; senza parametro si usa il seed di default `1`.
- **b** `[e2e]` Con un seed non valido compare un avviso visibile e si usa il seed di default.
