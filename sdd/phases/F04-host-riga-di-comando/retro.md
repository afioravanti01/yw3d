# F04 — Retrospettiva

Data di chiusura: 2026-09-26

## Verifica manuale
Eseguita dall'utente con una cartella del mondo fuori dal progetto.

| Criterio | Esito | Note |
|---|---|---|
| CLI-001.d | ✓ | |
| CLI-001.e | ✓ | `npm link` eseguito dall'utente (richiede permessi di amministratore) |
| HOST-002.e | ✓ | |
| PERF-004.a | ✓ | Host pronto in 79 ms; budget 8 s |
| PERF-004.b | ✓ | 70 fps con l'host |
| DEBUG-001.a | ✓ | Riga `link` dell'overlay |

Verifica automatica: `npm run check` verde (181 test), `npm run e2e` verde (18 test: 13 solo browser, 5 con l'host), `npm run sdd:trace -- F04` con copertura completa.

## Metriche

| Metrica | Definizione | Valore |
|---|---|---|
| Requisiti A/M/R | aggiunti / modificati / rimossi nella spec di fase | 7 / 1 / 0 |
| Criteri u/e/m | criteri `[unit]` / `[e2e]` / `[manuale]` | 11 / 7 / 6 |
| Righe spec / piano | `wc -l` a chiusura | 101 / 149 |
| Task pianificati / `+` / rimossi | dal piano a chiusura | 10 / 0 / 0 |
| Emendamenti | righe del registro emendamenti dopo G1 | 1 |
| Deviazioni | righe della tabella deviazioni | 3 |
| AC al 1° colpo | criteri superati alla prima verifica / totale | 24 / 24 |
| Righe di contesto | costituzione + processo + spec vive toccate + spec e piano della fase | 633 (74 + 86 + 223 + 101 + 149) |
| LOC src / test | righe prodotte nella fase (saldo di `git diff` da F03, comando incluso) | 1325 / 610 |
| Doc/LOC | (righe spec + piano) / LOC src | 0,19 |
| Sessioni e tempo | sessioni agente e giorni di calendario | 1 giorno (2026-09-26); sessioni non registrate |
| Difetti post-chiusura | per origine spec / piano / codice | 0 / 0 / 0 (da aggiornare nelle fasi successive) |

## Ipotesi
- **H1 — Contesto.** Stabile: 633 righe (F03: 595) con 54 requisiti vivi. Le spec vive toccate crescono (223 righe) perché la fase attraversa molte aree; spec e piano della fase restano i più brevi finora.
- **H2 — Stabilità.** Confermata: 1 emendamento, un chiarimento su cosa vedono gli spettatori, emerso alla demo. Nessuna richiesta nuova sui controlli: la fase non ne definiva.
- **H3 — Qualità.** Nessun difetto di spec né di codice trovato in verifica.
- **H4 — Overhead.** Scende di nuovo: Doc/LOC da 0,35 a 0,19. Una fase di infrastruttura produce molto codice per requisito.
- **H5 — Tracciabilità.** Confermata; per la prima volta i criteri `[e2e]` girano su due progetti Playwright (solo browser e host) senza toccare lo script.

## Cosa ha funzionato
- **Il core non è cambiato.** Composizione, fisica e giocatore sono passati nell'host senza modifiche: la separazione di ARCH-001 e il determinismo hanno reso il cambio di architettura di D-008 un lavoro di sola infrastruttura.
- **Sessione indipendente dalla rete.** Tutta la logica dell'host (caricamento, errori, simulazione, ruoli, intenzioni scadute, ricaricamento) è testata in Node con viste finte; server e comando sono strati sottili, verificati end-to-end.
- **Determinismo come protocollo.** La vista riceve il testo del YAML e ricompone il mondo; l'hash conferma che è lo stesso. Il protocollo resta piccolo e leggibile, pronto per i client di F05.
- **Strutture dell'autore con Vite.** La stessa compilazione serve host e browser: la torre di prova ha dato lo stesso hash al primo tentativo.

## Cosa non ha funzionato
- **Configurazione di TypeScript.** Una configurazione nuova senza file (`tsconfig.host.json` prima di `src/host`) blocca `tsc -b`: il riferimento è stato aggiunto in T4.02 invece che in T4.01.
- **`npm link` e i permessi.** L'agente non può installare comandi globali senza `sudo`: il passo resta all'utente, documentato nel README (deviazione di T4.08).
- **Spettatori non previsti nel dettaglio.** La spec diceva «gli altri guardano» senza dire cosa vedono: la camera partiva dall'origine e la regola A3.3 nascondeva la figura. Chiarito con A4.1 alla demo.

## Modifiche al processo proposte
- Quando un requisito introduce un ruolo nuovo (spettatore, controllore), la spec dica cosa quel ruolo vede e può fare, non solo che esiste.
