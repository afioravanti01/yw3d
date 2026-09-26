# F04 — Host e riga di comando

| | |
|---|---|
| Stato | draft |
| Versione | 0.1 |
| Data | 2026-09-26 |
| Piano | [plan.md](plan.md) (dopo G1) |

## Obiettivo
L'autore lavora in una propria cartella, in qualunque posizione del disco, e avvia il mondo con un solo comando: `yw3d <cartella>`. Il comando valida il YAML, avvia un host headless che compone il mondo e fa girare la simulazione, e apre il browser collegato all'host come vista. Salvando il YAML il mondo si aggiorna; chiudendo il browser l'host continua a girare. È la base su cui F05 e F06 collegheranno i controllori dei personaggi (D-008).

## Contesto
- Decisione D-008 e costituzione v1.1 (P10): host headless autorità sullo stato, browser come vista, modalità solo browser mantenuta.
- Spec vive coinvolte: [world-file.md](../../specs/world-file.md) (file del mondo, scelta del file, ricaricamento), [structures.md](../../specs/structures.md) (registro delle strutture), [app.md](../../specs/app.md), [player.md](../../specs/player.md) e [physics.md](../../specs/physics.md) (la simulazione passa all'host), [debug.md](../../specs/debug.md), [performance.md](../../specs/performance.md).
- Il core di F01–F03 gira già in Node ed è deterministico: host e browser compongono lo stesso mondo dallo stesso YAML (YAML-001.d).

## Fuori scope
- Personaggi, protocollo dei controllori, comandi lanciati dal YAML: F05. Server MCP e agenti LLM: F06.
- Più giocatori: c'è un solo giocatore per host.
- Accesso via internet, autenticazione, cifratura: l'host è pensato per la macchina locale e, su richiesta, per la rete locale.
- Predizione lato client del movimento (serve solo con host lontani).
- Console di comandi, mappa testuale, screenshot su richiesta, registrazione e riproduzione delle sessioni (idee in attesa della roadmap).
- Pubblicazione del comando su npm.

## Storie utente
- **US-1** Come autore, creo una cartella con `world.yaml`, lancio `yw3d valle/` e il browser si apre sul mio mondo.
- **US-2** Come autore, se il YAML ha errori li vedo subito nel terminale, con file, riga e campo.
- **US-3** Come autore, salvo il YAML e il mondo si aggiorna nel browser senza ricaricare la pagina.
- **US-4** Come autore, aggiungo una struttura mia scrivendo un file TypeScript nella cartella del mondo, senza toccare il progetto yw3d.
- **US-5** Come giocatore, chiudo e riapro il browser e ritrovo il mondo e il giocatore dove li avevo lasciati.
- **US-6** Come sviluppatore, continuo a usare l'app da sola nel browser, senza host, per i mondi del progetto.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### CLI-001 — Comando `yw3d`
- **a** `[unit]` `yw3d <cartella>` usa il file `world.yaml` della cartella; `yw3d <file.yaml>` usa quel file, e la sua cartella è la cartella del mondo (Q1). Una cartella senza `world.yaml` o un file inesistente producono un messaggio chiaro e un codice di uscita ≠ 0.
- **b** `[unit]` All'avvio il comando valida il file e stampa errori e avvisi nel formato di YAML-002. Con errori l'host parte comunque e attende un file valido (Q2).
- **c** `[unit]` Il comando stampa l'indirizzo dell'app; `--port` sceglie la porta, `--no-open` non apre il browser, `--lan` rende l'host raggiungibile dalla rete locale (per default solo dalla macchina locale, Q4), `--seed` sostituisce il seed del file, `--help` descrive l'uso.
- **d** `[manuale]` Senza `--no-open` il browser di sistema si apre sull'app collegata al mondo.
- **e** `[manuale]` Dalla cartella del progetto, `npm link` rende disponibile `yw3d` come comando in qualunque cartella.

### HOST-001 — Host headless
- **a** `[unit]` L'host compone il mondo dalla cartella e fa girare la simulazione a passo fisso (PHYS-002) senza alcun browser collegato.
- **b** `[unit]` Il giocatore è simulato dall'host, che è l'autorità sul suo stato; senza browser collegati il giocatore resta fermo dov'è.
- **c** `[unit]` Il terminale dell'host riporta: file del mondo, indirizzo, seed, strutture per tipo, avvisi ed errori, collegamento e scollegamento delle viste.

### HOST-002 — Browser collegato all'host
- **a** `[e2e]` Aperto sull'indirizzo dell'host, il browser si collega, ricostruisce il mondo dal YAML ricevuto e ottiene lo stesso hash dell'host.
- **b** `[e2e]` Le intenzioni del giocatore partono dal browser e il movimento viene dall'host: la posizione mostrata segue quella simulata dall'host.
- **c** `[e2e]` Chiudendo e riaprendo il browser si ritrova il giocatore nella posizione raggiunta.
- **d** `[e2e]` Più browser possono collegarsi allo stesso host e vedono lo stesso mondo; solo uno guida il giocatore, gli altri guardano (Q3).
- **e** `[manuale]` Sulla macchina locale il giocatore risponde ai comandi senza ritardi percepibili e si muove in modo fluido.

### HOST-003 — Ricaricamento dalla cartella
- **a** `[unit]` L'host osserva la cartella del mondo: salvando il YAML, o un file delle strutture dell'autore, il mondo si ricompone entro il budget di PERF-001.a; le viste collegate si aggiornano senza ricaricare la pagina e il giocatore resta dov'era.
- **b** `[unit]` Se il file salvato non è valido resta il mondo precedente; gli errori compaiono nel terminale e nel pannello delle viste, e spariscono alla correzione.

### STRUCT-008 — Strutture dell'autore
- **a** `[unit]` I file TypeScript o JavaScript nella sottocartella `structures/` della cartella del mondo registrano strutture (STRUCT-001) utilizzabili nel YAML, senza modificare il progetto yw3d.
- **b** `[unit]` Un errore in uno di questi file (sintassi, eccezione, nome già usato) produce un messaggio con il file e la causa; l'host non si ferma.
- **c** `[e2e]` Con le strutture dell'autore il browser ottiene lo stesso mondo dell'host (stesso hash).
- **d** `[unit]` Lanciare `yw3d` su una cartella equivale ad accettare di eseguirne il codice delle strutture; il comando lo ricorda nel terminale quando la cartella ne contiene (Q5).

### APP-003 — Modalità solo browser
- **a** `[e2e]` Aperta senza host (server di sviluppo o build statica del progetto), l'app funziona come in F03 con i mondi del progetto, `?world=` e `?seed=`.
- **b** `[e2e]` Aperta dall'host, l'app si collega all'host e ignora `?world=`; il seed può essere sostituito solo con `--seed` del comando.

### PERF-004 — Host
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Da `yw3d` al mondo visibile nel browser passano al più 8 s, compresa la validazione e l'avvio dell'host.
- **b** `[manuale]` Con l'host valgono i budget di PERF-001.b nel browser (≥ 60 fps camminando).

## Requisiti MODIFICATI

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, modalità, posizione della camera, posizione e velocità del giocatore, se è a terra o in acqua, velocità della camera libera, seed, nome del file del mondo, numero di strutture per tipo, numero di avvisi, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione, durata dell'ultimo passo di simulazione.
- **Dopo:**
- **a** `[manuale]` Come prima, più: modalità di collegamento (host o solo browser), indirizzo dell'host, numero di viste collegate, se questa vista guida il giocatore, ritardo di andata e ritorno con l'host.
- **Motivo:** serve a capire a chi è collegata la vista e perché il giocatore si muove o no.

## Requisiti RIMOSSI
Nessuno.

## Domande aperte
- **Q1** Nome del file nella cartella: proposta **`world.yaml`** fisso, così una cartella è un mondo; `yw3d file.yaml` resta possibile per file con altri nomi.
- **Q2** Avvio con errori nel YAML: proposta **l'host parte e attende** un file valido, mostrando gli errori; l'autore corregge e il mondo compare. Alternativa: il comando esce con errore.
- **Q3** Più browser collegati: proposta **il primo guida il giocatore, gli altri guardano** con la camera libera; se il primo si scollega, la guida passa al successivo. Alternativa: tutti possono guidare.
- **Q4** Rete: proposta **solo macchina locale per default**, perché l'host esegue codice della cartella; `--lan` per aprirlo alla rete locale (ad esempio per giocare dal PC Windows con l'host sul Mac).
- **Q5** Codice delle strutture dell'autore: proposta **lanciare il comando vale come consenso**, come eseguire `node script.js`; il consenso esplicito resta per i comandi dei controllori (F05). Alternativa: chiedere conferma al primo avvio per ogni cartella.

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
