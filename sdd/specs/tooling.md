# Strumenti SDD (SDD)

Spec viva: strumenti del processo SDD. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### SDD-001 — Tracciabilità automatica
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[unit]` `npm run sdd:trace -- F01` produce una matrice requisito → task → test per la fase indicata.
- **b** `[unit]` Il comando fallisce (exit ≠ 0) se un requisito non è citato da nessun task, o se un criterio `[unit]` o `[e2e]` non è citato da nessun test.
- **c** `[unit]` Il comando segnala gli ID citati in task o test che non esistono nella spec.

### SDD-002 — Verifica unica
*Introdotto in F01 · ultima modifica: F01.*
- **a** `[manuale]` `npm run check` esegue typecheck, lint e test unitari, e fallisce se uno di questi fallisce.
