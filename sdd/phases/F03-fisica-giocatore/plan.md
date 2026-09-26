# F03 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-26) |
| Versione | 0.1 |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-26 |

## Panoramica
La fisica vive nel core, in un modulo che non conosce il rendering: un `PhysicsWorld` tiene le entità e le fa avanzare a passo fisso leggendo la solidità dei blocchi dal registro. Le entità ricevono solo intenzioni; posizione e velocità le cambia il passo. Collisioni, gravità, salto, gradini e acqua sono regole del passo, verificate in Node su mondi costruiti a mano e sul mondo predefinito.

Il giocatore è un'entità con misure proprie e una posizione di partenza presa dal file del mondo. L'app traduce tastiera e mouse in intenzioni, fa avanzare la simulazione con un accumulatore di tempo e interpola la posizione tra due passi per il rendering. La visuale in prima o terza persona e la camera libera sono modalità dell'app; la camera in terza persona usa un raggio nella griglia dei blocchi, anch'esso nel core perché servirà ai personaggi (linea di vista).

## Struttura del codice

```
src/
├─ core/
│  ├─ blocks/builtin.ts             foglie non solide (WORLD-004)
│  ├─ physics/
│  │  ├─ constants.ts               gravità, velocità, salto, gradino: in metri e convertiti in blocchi
│  │  ├─ entity.ts                  Entity, Intent, BoxSize
│  │  ├─ collide.ts                 spostamento di una scatola lungo un asse, con scansione dei blocchi attraversati
│  │  ├─ physicsWorld.ts            PhysicsWorld: spawn, step, regole di terra, salto, gradini, acqua
│  │  ├─ fixedStep.ts               accumulatore del passo fisso e fattore di interpolazione
│  │  └─ raycast.ts                 raggio nella griglia dei blocchi (DDA)
│  ├─ player/player.ts              misure del giocatore, spawn, camera in terza persona
│  └─ yaml/worldFile.ts             + sezione `player` (YAML-008)
├─ render/
│  ├─ playerFigure.ts               figura statica a blocchi (PLAYER-003.c)
│  └─ flyCamera.ts                  invariato; usato come modalità di debug
└─ app/
   ├─ input.ts                      tasti → intenzioni (funzione pura) e cattura del mouse
   ├─ viewModes.ts                  prima persona, terza persona, camera libera
   └─ main.ts                       ciclo: accumulatore, passi, interpolazione, overlay
scripts/sdd-trace.ts                avviso per i requisiti senza criteri (D-007)
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Nel core la fisica lavora in blocchi e secondi; le costanti della spec (in metri) sono convertite in un solo modulo | Lavorare in metri e convertire nel mondo | Le coordinate del core sono in blocchi (costituzione); un solo punto di conversione evita errori di fattore 2. |
| P2 | Posizione dell'entità = centro della base (x, z al centro, y ai piedi) | Angolo minimo della scatola | I piedi sono il riferimento naturale per terra, gradini e spawn; la scatola si ricava da larghezza e altezza. |
| P3 | Collisioni risolte un asse alla volta (y, poi x, poi z). Lungo un asse lo spostamento scandisce tutti i piani di blocchi attraversati e si ferma al primo solido | Sotto-passi di lunghezza fissa; scatola "spazzata" in 3D con tempo d'impatto | Nessun attraversamento a qualunque velocità (PHYS-004.c), scivolamento lungo i muri gratis (PHYS-004.b), codice semplice e deterministico. Il costo cresce con lo spostamento, che resta sotto 2 blocchi per passo. |
| P4 | Gradini: se il movimento orizzontale è bloccato e l'entità è a terra, si riprova alzata di al più 1 blocco (1,3 a contatto con l'acqua), poi la si riabbassa sul gradino; si accetta se avanza di più | Rampe implicite; salto automatico | PHYS-005.b con un blocco esatto; il margine in acqua permette di risalire sulla riva (PHYS-006.d). La visuale sale morbida perché il rendering smorza l'altezza degli occhi (PHYS-005.c). |
| P5 | Acqua: frazione del volume immersa calcolata per passo. In acqua: velocità orizzontale dimezzata, galleggiamento proporzionale alla frazione immersa con equilibrio all'85% (testa fuori), smorzamento della velocità verticale; le intenzioni di salita e discesa aggiungono una spinta | Galleggiamento a velocità costante; "stato nuoto" separato | Un'unica regola continua copre caduta in acqua, galleggiamento (PHYS-006.b) e nuoto (PHYS-006.c), senza salti di stato. |
| P6 | Passo fisso 1/60 s con accumulatore; al più 5 passi per frame, il tempo in eccesso si scarta; il rendering interpola tra stato precedente e attuale | Passo variabile; estrapolazione | PHYS-002: determinismo e indipendenza dal frame rate; il limite evita la spirale di rallentamento dopo un blocco della scheda. |
| P7 | Solo aritmetica di base e `Math.sqrt` nel passo (niente trigonometria): le intenzioni portano già la direzione come vettore | Direzione come angolo | Risultati identici in ogni motore JS (PHYS-002.d), come per il terreno. |
| P8 | Raggio nella griglia con DDA (Amanatides–Woo); la camera in terza persona si ferma al primo solido meno un margine | Test di intersezione con le mesh di Three.js | Nel core, testabile in Node (PLAYER-003.b), riusabile per la linea di vista dei personaggi. |
| P9 | Hook di test: `simulate(spawn, intents[])` esegue una sequenza su un'entità di prova nel mondo caricato e restituisce lo stato | Guidare la tastiera con Playwright | Confronto esatto browser/Node (PHYS-002.d) senza dipendere dai tempi dei frame. |
| P10 | Figura del giocatore: poche scatole Three.js (testa, busto, braccia, gambe) nei colori della palette, ruotate con la visuale | Figura costruita con il mesher dei blocchi | Temporanea fino a F04: il minimo che rende visibile il giocatore in terza persona. |
| P11 | Tasti → intenzioni in una funzione pura dell'app; `KeyboardEvent.code` come in F01 | Logica nei gestori degli eventi | Testabile senza DOM; stesse regole di posizione fisica dei tasti. |

## Strategia di test
- **Unit (Vitest, Node).** Mondi piccoli costruiti a mano (pavimento, muri, gradini, vasche d'acqua) per ogni regola; il mondo predefinito per il percorso casuale di PHYS-004.a e per il giocatore che entra nelle case (PLAYER-001.b). Ogni test di fisica simula secondi di tempo in passi fissi, senza orologio.
- **E2E (Playwright).** PHYS-002.d con l'hook `simulate`; i test di F01–F02 aggiornati alla nuova modalità di avvio (giocatore).
- **Manuale.** Checklist a T3.13 con i valori misurati (fps, durata del passo).

## Dipendenze nuove
Nessuna.

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Tremolio a terra per errori di arrotondamento (entità che sobbalza di frazioni di blocco) | Visuale instabile | Posizioni agganciate al piano del blocco dopo una collisione verticale; test che un'entità ferma resta ferma per 10 s. |
| Uscita dall'acqua difficile | PHYS-006.d, esperienza | Margine del gradino in acqua (P4) e test dedicato su una vasca con riva di 1 blocco. |
| Camera in terza persona che attraversa le chiome | Visuale dentro le foglie | Le foglie sono opache: il raggio si ferma anche sui blocchi opachi, non solo sui solidi. |
| Percorso casuale da 10 000 passi lento | Suite oltre i tempi | Mondo predefinito generato una volta per file di test; entità piccola e passi semplici. |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T3.01** Avviso di `sdd:trace` per i requisiti senza criteri
  - Req: SDD-001 · Dip: —
  - D-007: il comando segnala i requisiti della fase senza criteri riconosciuti (formato della spec sbagliato).
  - Fatto quando: test di SDD-001 verdi; `sdd:trace -- F03` senza falsi avvisi.

- [x] **T3.02** Foglie non solide
  - Req: WORLD-004 · Dip: —
  - `solid: false` per le foglie; test di WORLD-004.c aggiornato.
  - Fatto quando: test verdi; hash di riferimento invariati (la solidità non entra nei dati del mondo).

- [x] **T3.03** Entità, intenzioni e passo fisso
  - Req: PHYS-001, PHYS-002 · Dip: —
  - `constants.ts`, `entity.ts`, `fixedStep.ts`, `PhysicsWorld` con spawn e passo vuoto; determinismo e indipendenza dal frame rate.
  - Fatto quando: test di PHYS-001.a–b e PHYS-002.a–c verdi.

- [x] **T3.04** Gravità e collisioni
  - Req: PHYS-003, PHYS-004, PHYS-001 · Dip: T3.03, T3.02
  - `collide.ts` (P3), gravità e velocità massima di caduta, stato "a terra", spawn nel primo spazio libero.
  - Fatto quando: test di PHYS-003.a–b, PHYS-004.a–d e PHYS-001.c verdi.

- [x] **T3.05** Salto e gradini
  - Req: PHYS-005 · Dip: T3.04
  - Salto da terra, salita automatica (P4).
  - Fatto quando: test di PHYS-005.a–b verdi.

- [x] **T3.06** Acqua
  - Req: PHYS-006 · Dip: T3.05
  - Frazione immersa, velocità dimezzata, galleggiamento, nuoto, uscita sulla riva (P5).
  - Fatto quando: test di PHYS-006.a–d verdi.

- [x] **T3.07** Giocatore
  - Req: PLAYER-001, PLAYER-002 · Dip: T3.06
  - Misure, andature, spawn; test sul mondo predefinito: il giocatore entra in ogni casa dalla porta.
  - Fatto quando: test di PLAYER-001.a–b e PLAYER-002.a verdi.

- [x] **T3.08** Partenza del giocatore nel file del mondo
  - Req: YAML-008, PLAYER-001 · Dip: T3.07
  - Sezione `player` (`at`, `yaw`), errori nel formato di YAML-002, `worlds/README.md` aggiornato.
  - Fatto quando: test di YAML-008.a–b e PLAYER-001.c verdi.

- [x] **T3.09** Raggio nella griglia e camera in terza persona
  - Req: PLAYER-003 · Dip: T3.03
  - DDA (P8); distanza della camera in terza persona con margine.
  - Fatto quando: test di PLAYER-003.b verde.

- [x] **T3.10** Giocatore nell'app
  - Req: PLAYER-002, PLAYER-003, CAM-001, DEBUG-001, PHYS-002, PHYS-005 · Dip: T3.07, T3.08, T3.09
  - Tasti → intenzioni (P11), accumulatore e interpolazione, altezza degli occhi smorzata, V e F4, figura a blocchi (P10), overlay; hook `simulate` (P9). **Punto di controllo con l'utente**: demo in prima e terza persona.
  - Fatto quando: si cammina, si salta, si nuota e si cambia visuale in `npm run dev`; test della mappatura dei tasti verde.

- [ ] **T3.11** Partenza nel mondo predefinito e prestazioni
  - Req: PERF-003, YAML-008 · Dip: T3.10
  - Sezione `player` nel borgo di `worlds/default.yaml`; durata del passo nell'overlay; misura.
  - Fatto quando: il giocatore parte nel borgo; passo sotto 1 ms in sviluppo.

- [ ] **T3.12** Test end-to-end
  - Req: PHYS-002 · Dip: T3.10
  - PHYS-002.d con `simulate`; test e screenshot di F01–F02 adattati all'avvio come giocatore.
  - Fatto quando: `npm run e2e` verde.

- [ ] **T3.13** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T3.11, T3.12, T3.01
  - `check`, `e2e`, `sdd:trace -- F03`; checklist dei criteri `[manuale]` con i valori misurati; spec vive; `retro.md`; `experiment.md`, `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T3.01
T3.02 ─────────┐
T3.03 ─────────┴─ T3.04 ─ T3.05 ─ T3.06 ─ T3.07 ─ T3.08 ─┐
   └──────────────────────────────── T3.09 ──────────────┴─ T3.10 ─┬─ T3.11 ─┬─ T3.13
                                                                    └─ T3.12 ─┘
```
Punti di controllo: G2 prima di T3.01; demo del giocatore a T3.10; G3 a T3.13.

## Modalità di esecuzione
Come in F02: task in ordine senza fermarsi fino al punto di controllo di T3.10; ci si ferma prima solo se serve un emendamento. Commit a fine task solo se `npm run check` termina con successo (codice di uscita); il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T3.06 | Galleggiamento come molla sulla profondità rispetto alla superficie (non solo sulla frazione immersa) con smorzamento quasi critico; il nuoto imposta la velocità verticale (3 m/s) invece di aggiungere una spinta | Con la sola frazione immersa un'entità rilasciata sul fondo risaliva in oltre 3 s (PHYS-006.b); con una spinta di nuoto fissa non si raggiungeva il fondo né la riva (PHYS-006.c–d) | Nessuno |
