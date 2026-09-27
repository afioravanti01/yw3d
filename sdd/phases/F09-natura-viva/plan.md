# F09 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-27) |
| Versione | 0.1 |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-27 |

## Panoramica
L'**orologio** sta nel core: una funzione pura trasforma il tempo simulato, l'ora di partenza e la durata del giorno in un'ora del giorno e in una parte del giorno. La `Simulation` ha il suo orologio con uno scostamento, che `/time` sposta; l'host è l'autorità e manda l'ora alle viste con lo stato del mondo, il browser senza host la calcola da sé.

La **scena** riceve l'ora a ogni frame e ne ricava tutto il resto con funzioni pure e provabili: direzione, colore e intensità del sole o della luna, colori della luce ambientale, del cielo e della nebbia, quantità di stelle, accensione delle finestre. Le ombre si ricalcolano ogni 2 s circa. Vento e acqua sono piccoli pezzi di shader sui materiali esistenti.

La **prova d'uso** viene subito dopo il ciclo di luce e `/time`, prima di finestre, vento, acqua e dei dettagli per agenti e programmi.

## Struttura del codice

```
src/
├─ core/
│  ├─ time/clock.ts                 ora del giorno, parte del giorno, `HH:MM`
│  ├─ yaml/worldFile.ts             sezione `time`
│  ├─ structures/houses.ts          finestre delle case come luci (tipo di struttura: `lights`)
│  └─ sim/simulation.ts             orologio della simulazione, `/time`
├─ render/
│  ├─ daylight.ts                   dall'ora a sole/luna, luci, cielo, nebbia, stelle, finestre
│  ├─ scene.ts                      applica la luce del momento; ombre ogni 2 s
│  ├─ windows.ts                    quad luminosi delle finestre
│  └─ meshing/mesher.ts             attributo per le foglie (vento)
├─ protocol/                        ora nello stato del mondo e nella percezione
├─ host/                            `/time` dal terminale e dalla vista che guida
└─ app/                             overlay, console, ora senza host
python/yw3d/                        `self.clock`, `self.part_of_day`
src/host/agents/context.ts          ora e parte del giorno nel contesto
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | **Orologio** come funzione pura del core: `timeOfDay(secondi simulati + scostamento, partenza, durata)` in minuti (0–1440) e `partOfDay(minuti)` con i confini di Q4 | Un orologio a parte, con il suo stato | Deterministico (TIME-001.a) e uguale in host, browser, test |
| P2 | `/time HH:MM` sposta uno **scostamento** in secondi simulati; alla ricarica lo scostamento resta, e si azzera solo se cambia la sezione `time` o si riavvia l'host (Q2) | Cambiare il tempo simulato | Il tempo simulato misura anche altro (percezione, azioni): non si tocca |
| P3 | L'host manda alle viste i **minuti del giorno** nello stato (a ogni invio, come la posizione del giocatore); la vista li fa avanzare tra un messaggio e l'altro | Mandare solo l'ora di partenza | Un solo orologio, anche dopo `/time` |
| P4 | **Percorso del sole**: sorge a est alle 06:00, tramonta a ovest alle 19:00 (il giorno di Q4, con alba e tramonto a cavallo), passa a sud con un'altezza massima di circa 60°; la **luna** fa il percorso opposto di notte. Una sola luce direzionale, che di giorno è il sole e di notte la luna: colore e intensità passano dall'una all'altra all'alba e al tramonto | Due luci con ombre | Una sola mappa d'ombre: il costo resta quello di oggi |
| P5 | **Tavola dei colori per ora** (`daylight.ts`): punti chiave (notte, alba, mattino, mezzogiorno, pomeriggio, tramonto) per sole, luce ambientale cielo/terra, orizzonte, zenit, nebbia, stelle; tra un punto e l'altro si interpola. Di notte la luce ambientale non scende sotto una soglia (RENDER-008.a, RENDER-003.b) | Colori calcolati da un modello fisico del cielo | Si regola a occhio alla prova d'uso; funzione pura, provabile |
| P6 | **Cielo**: lo shader esistente riceve orizzonte, zenit, direzione e colore di sole e luna, e una densità di stelle; disegna i dischi del sole e della luna e stelle da un rumore fisso sulla sfera | Una texture del cielo | Nessun file in più; si adatta all'ora |
| P7 | **Ombre**: `needsUpdate` ogni 2 s di tempo reale e dopo ogni ricostruzione di regione; con `/time` subito | A ogni frame | Il sole si muove di mezzo grado ogni 2 s con un giorno di 60 minuti (Q5) |
| P8 | **Finestre**: il tipo di struttura può dichiarare `lights` (come `approach` in F06): rettangoli locali con la loro normale; le case dichiarano le loro finestre dal `houseLayout`. La scena ne fa quad luminosi, appena dentro l'apertura, con un'intensità che segue la notte | Luci puntiformi | Molte finestre, costo zero: niente luci vere, solo superfici chiare |
| P9 | **Vento** (annullato, A9.3): il mesher aggiunge un attributo per vertice (1 per i blocchi di foglie, 0 per gli altri); il materiale del terreno sposta in orizzontale i vertici con l'attributo, con due onde in funzione del tempo e della posizione, e un'intensità che varia lentamente | Geometria a parte per le foglie | Nessun oggetto in più; i tronchi restano fermi |
| P10 | **Acqua** (annullata, A9.4): il materiale dell'acqua sposta in verticale di poco i vertici della superficie e ne modula la luminosità con onde; il colore si mescola con quello dell'orizzonte del momento | Riflessi veri (render su texture) | Leggero; RENDER-009.b chiede movimento e riflessi della luce, non specchi |
| P12 | **Scimmietta** (A9.1): campo `body` del personaggio (`human`, `monkey`); entità fisica di 0,8 × 1,4 blocchi; la navigazione usa la stessa griglia delle persone (va dove va una persona, per prudenza); figura propria nel rendering (`monkeyFigure`: busto chino, testa grande, muso chiaro, braccia lunghe, coda) con una sua funzione di posa, pura come quella delle persone | Una griglia di navigazione per ogni taglia | Una sola griglia basta a un animale piccolo; la figura è l'unica parte nuova da disegnare |
| P13 | **Agente animale**: se il corpo non è `human`, le istruzioni cambiano: niente lingua umana, solo versi brevi nelle frasi; nell'iniziativa autonoma l'invito è a spostarsi verso qualcosa di interessante nei dintorni (alberi, persone, acqua) | Un tipo di agente a parte | Stesso runtime; cambia solo il testo delle istruzioni |
| P11 | **Ora per chi guida i personaggi**: nella percezione `time_of_day` (`"HH:MM"`) e `part_of_day` (`dawn`, `day`, `dusk`, `night`); nella libreria Python `self.clock` e `self.part_of_day`; nel contesto degli agenti l'ora e la parte del giorno al posto dei soli secondi | Un evento a ogni cambio di parte del giorno | Basta leggerla; un evento si aggiungerà se serve |

## Strategia di test
- **Unit.** Orologio (TIME-001.a, d) con tabelle di ore; sezione `time` con errori; scostamento e ricarica (TIME-001.b); `/time` con la vista che guida, le viste che guardano, il terminale (TIME-002.a); `daylight.ts`: direzione del sole alle ore chiave, luce mai nera di notte, finestre accese solo di notte; `lights` delle case; attributo delle foglie nel mesher; ora nella percezione, nella libreria, nel contesto.
- **E2E.** Senza host l'ora scorre (TIME-001.c); `/time 22:00` cambia la luce della scena (colore di fondo) nel browser.
- **Manuale.** Checklist a T9.11 con le misure a parte: fps a mezzogiorno e di notte (PERF-001.b), RENDER-003, RENDER-004, RENDER-008, RENDER-009, TIME-003.a, DEBUG-001.a, CHAR-003.b e .d.

## Dipendenze nuove
Nessuna.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Colori brutti o notte troppo buia | RENDER-003/004/008, TIME-003 | Tavola dei colori regolabile, prova d'uso con `/time` prima del resto |
| Scatti delle ombre ogni 2 s | TIME-003.a | Movimento piccolo per aggiornamento; se si vedono, aggiornamento più frequente solo della luce |
| Costo del vento e delle ombre | PERF-001.b | Shader leggeri; misura degli fps alla prova d'uso |
| Browser dei test in software (SwiftShader) | E2E lenti | Negli e2e solo controlli su valori (colore di fondo), niente screenshot da confrontare |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T9.01** Orologio nel core e nel file del mondo
  - Req: TIME-001, YAML-001 · Dip: —
  - `clock.ts` (P1); sezione `time` con `start` e `day_minutes`.
  - Fatto quando: test di TIME-001.a e .d, YAML-001.a verdi.

- [x] **T9.02** Ora nella simulazione, nell'host e nelle viste
  - Req: TIME-001, TIME-002, PROTO-002 · Dip: T9.01
  - Orologio della `Simulation` con scostamento (P2); ora nello stato alle viste (P3); ora senza host; `/time` nel core, nel terminale e dalla vista che guida; ora nella percezione (P11).
  - Fatto quando: test di TIME-001.b, TIME-002.a, PROTO-002.a verdi.

- [x] **T9.03** Ciclo di luce nella scena
  - Req: RENDER-003, RENDER-004, RENDER-008 · Dip: T9.02
  - `daylight.ts` (P4, P5); cielo con sole, luna e stelle (P6); ombre ogni 2 s (P7).
  - Fatto quando: test di `daylight.ts` verdi; il giorno si vede passare nel browser.

- [x] **T9.04** Ora nell'overlay e nella console
  - Req: DEBUG-001, DIALOG-005, TIME-001 · Dip: T9.03
  - Ora e parte del giorno nell'overlay e nell'intestazione di `/world`; `/time` in `/help`; e2e dell'ora che scorre senza host e di `/time`.
  - Fatto quando: e2e di TIME-001.c verdi.

- [x] **T9.05** Prova d'uso con l'utente
  - Req: TIME-003, RENDER-003, RENDER-004, RENDER-008 · Dip: T9.04
  - **Punto di controllo**: l'utente guarda il ciclo del giorno, salta alle ore con `/time`, e misura gli fps a mezzogiorno e di notte. Le osservazioni diventano deviazioni o emendamenti prima di T9.06.
  - Fatto quando: osservazioni e misure registrate nel piano.
  - Osservazioni: stelle troppo grandi e visibili all'alba e al tramonto (corrette in T9.03); ombre che scattano ogni 2 s, poi in movimento continuo a ogni frame, infine a scatti ogni decimo del giorno (A9.2): «ora va bene». Durante la prova la scimmietta (T9.12, T9.13). Fps non riportati dall'utente: si misurano alla verifica di T9.11.

- [x] **T9.06** Finestre illuminate
  - Req: RENDER-008 · Dip: T9.05
  - `lights` nel tipo di struttura e nelle case (P8); quad luminosi con l'intensità della notte.
  - Fatto quando: test delle luci delle case verdi; finestre accese di notte nel browser.

- [x] **T9.07** ~~Vento sulle foglie~~ — annullato (A9.3)
  - Req: RENDER-009 · Dip: T9.05
  - Attributo delle foglie nel mesher e spostamento nel materiale (P9).
  - Fatto quando: test del mesher verdi; foglie che ondeggiano nel browser.

- [x] **T9.08** ~~Acqua animata~~ — annullato (A9.4)
  - Req: RENDER-009 · Dip: T9.05
  - Onde e colore del cielo nel materiale dell'acqua (P10).
  - Fatto quando: acqua che si muove nel browser.

- [x] **T9.09** Ora per programmi e agenti
  - Req: PY-002, AGENT-002 · Dip: T9.02
  - `self.clock` e `self.part_of_day` nella libreria; ora nel contesto degli agenti; guide `docs/python.md`, `docs/agenti.md`, `docs/controllori.md`, `worlds/README.md`.
  - Fatto quando: test di PY-002.d e AGENT-002.a verdi; un agente dice l'ora giusta dal vivo.
  - Dal vivo (Claude Code, `haiku`): alle 20:04 reali, con il mondo alle 21:30, Marta risponde «Sono le 21:30, è notte», in 40 s.

- [x] **T9.12** Corpo della scimmietta
  - Req: CHAR-003, CHAR-001 · Dip: T9.05
  - Campo `body`; entità più piccola; figura e pose della scimmietta (P12).
  - Fatto quando: test di CHAR-003.a e delle pose verdi; la scimmietta si vede camminare nel browser.

- [x] **T9.13** Agente animale e scimmietta nell'esempio
  - Req: CHAR-003 · Dip: T9.12
  - Istruzioni da animale (P13); la scimmietta autonoma in `examples/agenti`; guida `docs/agenti.md`.
  - Fatto quando: test di CHAR-003.c verdi; dal vivo la scimmietta si sposta da sola a ogni intervallo.

- [ ] **T9.10** Test end-to-end
  - Req: TIME-001, TIME-002, CHAR-003 · Dip: T9.04, T9.06, T9.07, T9.08, T9.13
  - Suite completa nei due progetti.
  - Fatto quando: `npm run e2e` verde.

- [ ] **T9.11** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T9.09, T9.10
  - `check`, `e2e`, `sdd:trace -- F09`; checklist con le misure a parte; spec vive (nuova `time.md`); `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T9.01 ─ T9.02 ─┬─ T9.03 ─ T9.04 ─ T9.05 ─┬─ T9.06 ─────────┐
               │                          ├─ T9.07 ─────────┤
               │                          ├─ T9.08 ─────────┼─ T9.10 ─┐
               │                          └─ T9.12 ─ T9.13 ─┘         ├─ T9.11
               └─ T9.09 ──────────────────────────────────────────────┘
```
Punti di controllo: G2 prima di T9.01; prova d'uso a T9.05; G3 a T9.11.

## Modalità di esecuzione
Task in ordine, fermandosi alla prova d'uso di T9.05. Commit a fine task con `npm run commit`; il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T9.12, T9.13 | Fatti prima di chiudere la prova d'uso di T9.05 | Richiesta dell'utente durante la prova: la scimmietta nel mondo degli agenti | Nessuno |
| T9.03 (P7) | Ombre ridisegnate prima a ogni frame, poi solo a ogni decimo del giorno, con la direzione della luce ferma nel decimo | Prova d'uso di T9.05: ogni 2 s «scattano», a ogni frame «un continuo movimento» | Emendamento A9.2 |
| T9.07 | Vento sulle foglie realizzato, poi tolto; resta la correzione dell'ambiente dei programmi Python (`PYTHON_COLORS=0`), nata da un test dell'host che falliva con `FORCE_COLOR` nell'ambiente | Emendamento A9.3: l'utente non vuole il movimento delle foglie | A9.3 |
| T9.05 (P7) | Le figure non proiettano più nella mappa delle ombre; ognuna ha un disco scuro sotto i piedi, visibile quando sta a terra | L'utente: i personaggi «sembrano tutti volare poco sopra il suolo». La mappa si ridisegna solo col terreno e col decimo del giorno (A9.2), e l'ombra di chi si muove restava indietro | Nessuno |
