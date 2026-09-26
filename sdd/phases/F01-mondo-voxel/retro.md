# F01 — Retrospettiva

Data di chiusura: 2026-09-26

## Verifica manuale
Eseguita dall'utente sulla build di produzione. Prestazioni misurate con Chrome sul PC Windows di riferimento, build servita da macOS (opzione A, deviazione T1.14). L'utente ha riferito l'esito complessivo senza annotare i singoli valori misurati.

| Criterio | Esito | Note |
|---|---|---|
| WORLD-006.g | ✓ | Dopo l'emendamento A1.2 (radure pianeggianti) |
| RENDER-001.c | ✓ | |
| RENDER-002.c | ✓ | |
| RENDER-003.a | ✓ | |
| RENDER-003.b | ✓ | |
| RENDER-004.a | ✓ | |
| RENDER-004.b | ✓ | |
| RENDER-005.c | ✓ | Misurato con `setBlock` dalla console in modalità dev |
| RENDER-006.b | ✓ | |
| PERF-001.a | ✓ | |
| PERF-001.b | ✓ | |
| CAM-001.a | ✓ | |
| CAM-001.b | ✓ | Comprese le frecce (A1.1) |
| CAM-001.c | ✓ | |
| CAM-001.e | ✓ | |
| DEBUG-001.a | ✓ | |
| SDD-002.a | ✓ | `npm run check` verde (80 test) |

Verifica automatica: `npm run check` verde (80 test), `npm run e2e` verde (5 test), `npm run sdd:trace -- F01` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 19 / 0 / 0 |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 35 / 4 / 17 |
| Righe spec / piano | `wc -l` a chiusura | 151 / 230 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 14 / 2 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 2 |
| Deviazioni | righe della tabella deviazioni | 16 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 56 / 56 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 536 (69 + 86 + 0 + 151 + 230) |
| LOC src / test | righe di codice prodotte in `src/` e nei test | 1833 / 1229 (più 233 dello script di tracciabilità) |
| Doc/LOC | (righe spec + piano) / LOC src | 0,21 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-26); sessioni non registrate |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 1 (aggiornato in F02: `sdd-trace` perdeva i criteri invariati dei requisiti MODIFICATI, corretto in T2.18+) |

## Ipotesi
- **H1 — Contesto.** Dati insufficienti: è la prima fase e non esistevano spec vive. 536 righe è la base di confronto.
- **H2 — Stabilità.** Confermata per ora: 2 emendamenti, al limite della soglia. Nessuno nasce da ambiguità della spec: entrambi sono richieste nuove dell'utente dopo aver visto e usato l'app.
- **H3 — Qualità.** Dati insufficienti: nessun difetto scoperto finora.
- **H4 — Overhead.** Base di confronto: Doc/LOC = 0,21.
- **H5 — Tracciabilità.** Confermata: la matrice era completa a fine fase; le correzioni sono state due, piccole e fatte durante il lavoro (vedi il diario di `experiment.md`).

## Cosa ha funzionato
- La separazione tra core e rendering ha reso testabile in Node quasi tutto; il test WORLD-005.d conferma che browser e Node generano lo stesso mondo.
- La tabella delle deviazioni ha assorbito tutti gli scostamenti sul *come* senza fermare il lavoro.
- Il punto di controllo visivo dopo T1.12 ha fatto emergere il limite vero del terreno (troppo montuoso), che nessun criterio automatico avrebbe colto. Un prototipo fuori dal codice con misure su 5 seed ha permesso di decidere l'emendamento A1.2 con dati, prima di toccare il generatore.
- Gli screenshot da punti di vista fissi (P12) sono serviti sia alla revisione sia a controllare l'effetto di A1.2.

## Cosa non ha funzionato
- L'ambiente è cambiato durante la fase (da Windows + WSL2 a macOS). Il piano presupponeva WSL2 (prerequisito `sudo` di T1.13, hardware di PERF-001): due deviazioni e una scelta da fare in verifica.
- La verifica manuale ha registrato solo l'esito, non i valori misurati (tempo di caricamento, fps, durata della ricostruzione): per le prestazioni manca un dato numerico da confrontare con le fasi future.
- Il rilievo di WORLD-006.c ha solo 1 blocco di margine sui seed 1 e 2 dopo A1.2: un vincolo fragile per futuri ritocchi del terreno.

## Modifiche al processo proposte
- Nella checklist di verifica manuale, per i criteri con una soglia numerica, registrare il valore misurato e non solo l'esito.
- Dichiarare l'ambiente di sviluppo nella costituzione o nel piano solo dove incide sui requisiti, così un cambio di macchina non tocca il piano.
