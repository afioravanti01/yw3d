# Prestazioni (PERF)

Spec viva: budget di prestazioni. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PERF-001 — Prestazioni
*Introdotto in F01 · ultima modifica: F01.*
Hardware di riferimento: il PC di sviluppo dell'utente, Chrome su Windows collegato alla build di produzione servita da WSL2, mondo di default (Q5).
- **a** `[manuale]` Dall'apertura della pagina al mondo interamente visibile passano al più 5 s (tempo misurato e mostrato nell'overlay).
- **b** `[manuale]` Il frame rate medio è di almeno 60 fps durante 30 s di volo a quota media sopra il mondo.

### PERF-002 — Mondo con strutture
*Introdotto in F02 · ultima modifica: F02.*
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Con il mondo predefinito del progetto valgono i budget di PERF-001 (caricamento ≤ 5 s, ≥ 60 fps).
- **b** `[unit]` Il mondo predefinito contiene almeno 150 alberi, 6 case e 2 laghetti.
