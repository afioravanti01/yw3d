# Riga di comando (CLI)

Spec viva: il comando yw3d e la cartella del mondo. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CLI-001 — Comando `yw3d`
*Introdotto in F04 · ultima modifica: F04.*
- **a** `[unit]` `yw3d <cartella>` usa il file `world.yaml` della cartella, sempre con questo nome (Q1). Una cartella inesistente, o senza `world.yaml`, produce un messaggio chiaro e un codice di uscita ≠ 0.
- **b** `[unit]` All'avvio il comando valida il file e stampa errori e avvisi nel formato di YAML-002. Con errori l'host parte comunque e attende un file valido (Q2).
- **c** `[unit]` Il comando stampa l'indirizzo dell'app; `--port` sceglie la porta, `--no-open` non apre il browser, `--lan` rende l'host raggiungibile dalla rete locale (per default solo dalla macchina locale, Q4), `--seed` sostituisce il seed del file, `--help` descrive l'uso.
- **d** `[manuale]` Senza `--no-open` il browser di sistema si apre sull'app collegata al mondo.
- **e** `[manuale]` Dalla cartella del progetto, `npm link` rende disponibile `yw3d` come comando in qualunque cartella.
