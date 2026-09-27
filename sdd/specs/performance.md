# Prestazioni (PERF)

Spec viva: budget di prestazioni. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PERF-001 — Prestazioni
*Introdotto in F01 · ultima modifica: F09 (emendamento A9.6).*
Hardware di riferimento: il PC di sviluppo dell'utente, Chrome su Windows collegato alla build di produzione servita da WSL2, mondo di default (Q5).
- **a** `[manuale]` Dall'apertura della pagina al mondo interamente visibile passano al più 5 s (tempo misurato e mostrato nell'overlay).
- **b** `[manuale]` Il frame rate medio è di almeno 60 fps durante 30 s di volo a quota media sopra il mondo, con il ciclo del giorno, le finestre illuminate e le figure, a qualunque ora.

### PERF-002 — Mondo con strutture
*Introdotto in F02 · ultima modifica: F02.*
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Con il mondo predefinito del progetto valgono i budget di PERF-001 (caricamento ≤ 5 s, ≥ 60 fps).
- **b** `[unit]` Il mondo predefinito contiene almeno 150 alberi, 6 case e 2 laghetti.

### PERF-003 — Costo della simulazione
*Introdotto in F03 · ultima modifica: F03.*
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Un passo di simulazione del giocatore costa al più 1 ms (valore mostrato nell'overlay).
- **b** `[manuale]` Con il giocatore nel mondo predefinito valgono i budget di PERF-001 (caricamento ≤ 5 s, ≥ 60 fps camminando e nuotando).

### PERF-004 — Host
*Introdotto in F04 · ultima modifica: F04.*
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Da `yw3d` al mondo visibile nel browser passano al più 8 s, compresa la validazione e l'avvio dell'host.
- **b** `[manuale]` Con l'host valgono i budget di PERF-001.b nel browser (≥ 60 fps camminando).

### PERF-005 — Personaggi
*Introdotto in F05 · ultima modifica: F05.*
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Con 20 personaggi che camminano, ognuno con il suo controllore, valgono i budget di PERF-001.b nel browser (≥ 60 fps).
- **b** `[unit]` Con 20 personaggi un passo di simulazione dell'host costa al più 4 ms.
