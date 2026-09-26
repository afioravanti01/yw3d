# Host (HOST)

Spec viva: processo headless che simula il mondo e viste collegate. Descrive il sistema com'è oggi; la storia è nelle spec di fase citate.

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### HOST-001 — Host headless
*Introdotto in F04 · ultima modifica: F04.*
- **a** `[unit]` L'host compone il mondo dalla cartella e fa girare la simulazione a passo fisso (PHYS-002) senza alcun browser collegato.
- **b** `[unit]` Il giocatore è simulato dall'host, che è l'autorità sul suo stato; senza browser collegati il giocatore resta fermo dov'è.
- **c** `[unit]` Il terminale dell'host riporta: file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste.

### HOST-002 — Browser collegato all'host
*Introdotto in F04 · ultima modifica: F04 (emendamento A4.1).*
- **a** `[e2e]` Aperto sull'indirizzo dell'host, il browser si collega, ricostruisce il mondo dal YAML ricevuto e ottiene lo stesso hash dell'host.
- **b** `[e2e]` Le intenzioni del giocatore partono dal browser e il movimento viene dall'host: la posizione mostrata segue quella simulata dall'host.
- **c** `[e2e]` Chiudendo e riaprendo il browser si ritrova il giocatore nella posizione raggiunta.
- **d** `[e2e]` Più browser possono collegarsi allo stesso host e vedono lo stesso mondo; solo uno guida il giocatore, gli altri guardano con la camera libera, che parte alle spalle del giocatore, e vedono la sua figura (Q3).
- **e** `[manuale]` Sulla macchina locale il giocatore risponde ai comandi senza ritardi percepibili e si muove in modo fluido.

### HOST-003 — Ricaricamento dalla cartella
*Introdotto in F04 · ultima modifica: F04.*
- **a** `[unit]` L'host osserva la cartella del mondo: salvando il YAML, o un file delle strutture dell'autore, il mondo si ricompone entro il budget di PERF-001.a; le viste collegate si aggiornano senza ricaricare la pagina e il giocatore resta dov'era.
- **b** `[unit]` Se il file salvato non è valido resta il mondo precedente; gli errori compaiono nel terminale e nel pannello delle viste, e spariscono alla correzione.
