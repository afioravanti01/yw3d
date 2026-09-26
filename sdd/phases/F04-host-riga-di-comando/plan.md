# F04 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-26) |
| Versione | 0.1 |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-26 |

## Panoramica
Il comando `yw3d <cartella>` è un programma Node che avvia un **host**: legge `world.yaml` e le strutture dell'autore, compone il mondo con il core e fa girare la simulazione del giocatore a passo fisso. Nello stesso processo gira un server web, costruito sul server di sviluppo di Vite in modalità middleware, che serve l'app del progetto e compila al volo anche i file TypeScript della cartella dell'autore. Accanto c'è un canale WebSocket su cui host e viste si scambiano messaggi JSON.

Il browser, aperto dall'host, riconosce di essere collegato (l'host inserisce la configurazione nella pagina), riceve il testo del YAML e gli indirizzi dei moduli delle strutture, ricompone lo stesso mondo in locale e controlla che l'hash coincida. Da lì in poi invia le intenzioni del giocatore e riceve il suo stato, che interpola per il rendering. Senza host l'app funziona come in F03.

La logica dell'host sta in una **sessione** indipendente dalla rete (carica la cartella, compone, simula, gestisce i messaggi delle viste), testabile in Node senza server; il server e la riga di comando sono sottili strati intorno a essa.

## Struttura del codice

```
bin/yw3d.js                         punto d'ingresso del comando: registra tsx e avvia src/host/cli.ts
src/
├─ api/index.ts                     API pubblica per gli autori (import 'yw3d'): defineStructure, schema, blocchi
├─ core/…                           invariato (F01–F03)
├─ host/                            gira solo in Node (confine come il core: niente DOM, niente three)
│  ├─ cli.ts                        argomenti, cartella, aiuto, avvio del server, apertura del browser
│  ├─ args.ts                       analisi degli argomenti (funzione pura)
│  ├─ worldFolder.ts                `world.yaml` e `structures/*` della cartella
│  ├─ session.ts                    HostSession: mondo, strutture, simulazione, viste, messaggi
│  ├─ server.ts                     Vite in middleware, WebSocket, configurazione nella pagina
│  ├─ watch.ts                      osservazione della cartella
│  └─ terminal.ts                   uscita nel terminale (formato di YAML-002 per la diagnostica)
├─ protocol/messages.ts             tipi dei messaggi host ↔ vista, condivisi da host e app
└─ app/
   ├─ worldSource.ts                sorgente del mondo: mondi del progetto (solo browser) o host
   ├─ hostConnection.ts             WebSocket, stato remoto del giocatore, interpolazione, ritardo
   └─ main.ts                       sceglie la modalità; il resto dell'app invariato
e2e/host/                           cartella del mondo di prova per i test con l'host
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Server web dell'host = server di sviluppo di Vite in modalità middleware, avviato da codice | Build statica dell'app + server di file; server di sviluppo in un processo separato | Compila al volo il TypeScript delle strutture dell'autore anche fuori dal progetto (`/@fs/…`), sia per il browser sia per l'host (`ssrLoadModule`), con un'unica catena di strumenti. Nessuna build da mantenere allineata. Costo: `vite` diventa una dipendenza di esecuzione. |
| P2 | Moduli delle strutture dell'autore caricati nell'host con `ssrLoadModule` di Vite, invalidati a ogni modifica | `import()` con tsx e parametri anti-cache | Stessa compilazione del browser (stesso mondo, STRUCT-008.c) e ricarica pulita senza la cache dei moduli di Node. |
| P3 | API pubblica `yw3d` (`src/api/index.ts`) risolta con un alias di Vite: i file dell'autore scrivono `import { defineStructure, int, object, STONE } from 'yw3d'` | Percorsi relativi al progetto; pacchetto npm separato | Nessun percorso interno esposto all'autore; l'alias vale in browser e host. Diventerà il pacchetto pubblicato (idea in attesa). |
| P4 | Un file delle strutture esporta per default una struttura o un elenco; l'host le registra in un registro nuovo a ogni composizione | I file chiamano `register` su un registro globale | Nessuno stato globale da ripulire alla ricarica; l'errore resta legato al file (STRUCT-008.b). |
| P5 | Canale WebSocket con il pacchetto `ws`, sul percorso `/host` dello stesso server HTTP | Eventi personalizzati del WebSocket di Vite | In F05 i client esterni (script in altri linguaggi) parleranno lo stesso WebSocket: dev'essere un canale nostro, stabile e documentabile, non un dettaglio di Vite. |
| P6 | Messaggi JSON con `type` e versione del protocollo nel primo messaggio (`hello`); tipi condivisi in `src/protocol` | Formato binario | Leggibili, facili da usare da altri linguaggi (F05); la banda su macchina locale non è un problema. |
| P7 | La vista riceve dall'host il testo del YAML, gli indirizzi dei moduli delle strutture e l'hash; ricompone il mondo in locale e confronta l'hash | L'host invia i blocchi del mondo | Qualche centinaio di byte invece di decine di MB; il determinismo (YAML-001.d) è già verificato; un hash diverso diventa un errore visibile. |
| P8 | Stato del giocatore inviato a ogni passo (60 Hz); la vista lo interpola con un ritardo di un passo e mezzo | Invio a 20 Hz con estrapolazione | Sulla macchina locale il costo è trascurabile e il movimento resta fluido (HOST-002.e) senza predizione. |
| P9 | Intenzioni inviate dalla vista che guida a ogni cambiamento e comunque a 20 Hz; l'host usa l'ultima ricevuta e, se non ne arrivano per 0,5 s, torna fermo | Intenzioni a ogni frame | Poco traffico; un browser bloccato non lascia il giocatore a camminare da solo (lezione di T3.15+). |
| P10 | Configurazione nella pagina con `transformIndexHtml`: l'host inserisce `window.__YW3D_HOST__`; senza di essa l'app è in modalità solo browser | Parametro URL; richiesta all'avvio | Nessuna richiesta fallita in modalità solo browser; `?world=` resta per quella modalità (APP-003). |
| P11 | Osservazione della cartella con il watcher di Vite (chokidar) esteso alla cartella del mondo; ricarica dopo 150 ms di quiete | `fs.watch` | Già presente, affidabile su macOS, Linux e Windows; il ritardo raccoglie i salvataggi multipli degli editor. |
| P12 | Argomenti analizzati da una funzione pura propria; apertura del browser con il comando di sistema (`open`, `start`, `xdg-open`) | Librerie `commander`, `open` | Poche opzioni: nessuna dipendenza in più (P9 della costituzione). |
| P13 | `src/host` sotto lo stesso confine del core per il DOM (niente `three`, niente browser), con i tipi di Node | Nessun confine | L'host non deve dipendere dal rendering; il controllo di ARCH-001 si estende con una regola di lint. |

## Protocollo (versione 1)
Da host a vista: `hello` (versione, ruolo `driver` o `spectator`, mondo o diagnostica), `world` (nuovo mondo dopo una ricarica), `diagnostics`, `state` (tempo e stato del giocatore, orientamento), `role` (cambio di ruolo), `pong`. Da vista a host: `intent` (intenzione e orientamento della visuale), `ping`. Il mondo nei messaggi è `{ file, text, structures: [indirizzi], seedOverride, hash }`.

## Strategia di test
- **Unit (Vitest, Node).** Argomenti e cartella (`args.ts`, `worldFolder.ts`) su cartelle temporanee; `HostSession` con un caricatore di moduli basato su Vite in modalità middleware e con viste finte (funzioni che raccolgono i messaggi): composizione, errori, strutture dell'autore, simulazione, ruoli, intenzioni scadute, ricarica.
- **E2E (Playwright).** Un secondo progetto Playwright avvia `yw3d e2e/host --no-open --port …` come server: hash host/vista, movimento guidato dall'host, riapertura, due viste (una guida, una guarda), strutture dell'autore. I test di F01–F03 restano sul progetto solo browser (APP-003.a).
- **Manuale.** Checklist a T4.10 con i tempi misurati (avvio, ricarica).

## Dipendenze nuove
- `ws` (e `@types/ws`): WebSocket dell'host (P5).
- `vite` e `tsx` passano da dipendenze di sviluppo a dipendenze di esecuzione: servono al comando `yw3d` (P1, bin).

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Vite fuori dalla cartella del progetto (`/@fs/`, `server.fs.allow`) | Strutture dell'autore non servite al browser | Test e2e con una cartella fuori da `src`; `fs.allow` esteso alla cartella del mondo. |
| Moduli dell'autore con stato globale o errori a ogni ricarica | Host instabile | Registro nuovo a ogni composizione (P4); errori catturati per file (STRUCT-008.b). |
| Ritardo o scatti del giocatore guidato dall'host | HOST-002.e | Stato a 60 Hz e interpolazione (P8); misura del ritardo nell'overlay. |
| Differenze tra host e vista (versioni dei moduli, ordine di registrazione) | Hash diversi | Stessa lista ordinata di moduli inviata alla vista; hash confrontato a ogni mondo. |
| Avvio lento (Vite + composizione) | PERF-004.a (8 s) | Vite in middleware si avvia in meno di un secondo; composizione ~0,5 s; misura a T4.05. |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T4.01** API pubblica per gli autori
  - Req: STRUCT-008 · Dip: —
  - `src/api/index.ts` (P3), confine di `src/host` (P13), dipendenze (`ws`, `vite` e `tsx` di esecuzione).
  - Fatto quando: un file di prova importa `yw3d` e definisce una struttura; `npm run check` verde.

- [x] **T4.02** Argomenti e cartella del mondo
  - Req: CLI-001 · Dip: —
  - `args.ts` e `worldFolder.ts`: cartella, `world.yaml`, `structures/`, opzioni, aiuto, messaggi d'errore.
  - Fatto quando: test di CLI-001.a e CLI-001.c verdi.

- [x] **T4.03** Sessione dell'host: mondo e strutture dell'autore
  - Req: HOST-001, CLI-001, STRUCT-008 · Dip: T4.01, T4.02
  - `HostSession` con caricatore di moduli (P2, P4), composizione, diagnostica nel terminale, avvio con errori e attesa di un file valido, avviso sul codice eseguito.
  - Fatto quando: test di HOST-001.a, HOST-001.c, CLI-001.b, STRUCT-008.a, b, d verdi.

- [x] **T4.04** Simulazione nell'host e viste
  - Req: HOST-001, HOST-002 · Dip: T4.03
  - Protocollo (`src/protocol`), passo fisso con orologio reale, ruoli guida e spettatore, intenzioni con scadenza (P9), stato del giocatore conservato tra le viste.
  - Fatto quando: test di HOST-001.b e della logica di HOST-002 (ruoli, intenzioni, riconnessione) verdi.

- [x] **T4.05** Server e comando
  - Req: CLI-001, HOST-002, PERF-004 · Dip: T4.04
  - `server.ts` (P1, P5, P10), `cli.ts`, `bin/yw3d.js`, apertura del browser (P12), `--port`, `--lan`, `--seed`; misura del tempo di avvio.
  - Fatto quando: `node bin/yw3d.js e2e/host --no-open` avvia l'host e l'app risponde.

- [x] **T4.06** Ricaricamento dalla cartella
  - Req: HOST-003 · Dip: T4.05
  - Osservazione della cartella (P11), ricomposizione, messaggio `world` alle viste, giocatore conservato, errori.
  - Fatto quando: test di HOST-003.a–b verdi.

- [x] **T4.07** App collegata all'host
  - Req: HOST-002, APP-003, DEBUG-001 · Dip: T4.05
  - `worldSource.ts`, `hostConnection.ts`: composizione dal YAML ricevuto, controllo dell'hash, intenzioni, stato interpolato (P8), spettatori con camera libera, pannello e overlay. **Punto di controllo con l'utente**: demo con una cartella fuori dal progetto.
  - Fatto quando: con `yw3d` si gioca nel browser come in F03; due finestre, una guida e una guarda.

- [x] **T4.08** Comando installabile
  - Req: CLI-001 · Dip: T4.05
  - Campo `bin` di `package.json`, `npm link`, istruzioni nel README.
  - Fatto quando: `yw3d --help` funziona da una cartella qualunque dopo `npm link`.

- [ ] **T4.09** Test end-to-end con l'host
  - Req: HOST-002, STRUCT-008, APP-003 · Dip: T4.07
  - Secondo progetto Playwright con l'host come server; cartella `e2e/host` con una struttura dell'autore.
  - Fatto quando: `npm run e2e` verde con entrambi i progetti.

- [ ] **T4.10** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T4.06, T4.08, T4.09
  - `check`, `e2e`, `sdd:trace -- F04`; checklist dei criteri `[manuale]` con i valori misurati; spec vive; `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T4.01 ─┐
T4.02 ─┴─ T4.03 ─ T4.04 ─ T4.05 ─┬─ T4.06 ───────────┐
                                  ├─ T4.07 ─ T4.09 ───┼─ T4.10
                                  └─ T4.08 ───────────┘
```
Punti di controllo: G2 prima di T4.01; demo a T4.07; G3 a T4.10.

## Modalità di esecuzione
Come nelle fasi precedenti: task in ordine senza fermarsi fino al punto di controllo di T4.07; commit a fine task solo con `npm run check` verde (codice di uscita); il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T4.07 | Per le viste spettatrici la figura del giocatore resta visibile nella camera libera, che parte alle spalle del giocatore | CAM-001.f (A3.3) nasconde la figura quando il giocatore passa lui stesso alla camera libera; uno spettatore invece deve vedere chi guarda (HOST-002.d). Confermato dall'utente alla demo | Emendamento A4.1 su HOST-002.d |
| T4.08 | `npm link` non eseguito dall'agente: la cartella globale di npm (`/usr/local`) richiede permessi di amministratore. Verificato `node bin/yw3d.js` da un'altra cartella; il README spiega `sudo npm link` o un prefisso nella home | Nessun comando con `sudo` da parte dell'agente | Nessuno: CLI-001.e resta da verificare a mano |
