# F01 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-26) |
| Versione | 0.2: rivisto punto per punto con l'utente |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-26 |

## Panoramica
Si parte da uno scaffold Vite + TypeScript con i controlli di qualità e il confine architetturale già attivi (ARCH-001). Poi si costruisce il core dal basso: numeri casuali e rumore deterministici, registro dei blocchi, storage del mondo a chunk, generatore di terreno. Il rendering trasforma i chunk in geometria con un mesher puro (facce visibili, occlusione ambientale, variazione di colore), che Three.js disegna con luci, ombre, cielo e nebbia. In cima vanno la camera libera, l'overlay diagnostico e l'hook per i test e2e. Lo script di tracciabilità nasce subito dopo lo scaffold, così misura la fase mentre procede.

## Struttura del codice

```
yw3d/
├─ index.html
├─ src/
│  ├─ core/                         ARCH-001: niente three, niente DOM
│  │  ├─ math/rng.ts                PRNG con seed (sfc32), hash FNV-1a
│  │  ├─ math/noise.ts              simplex 2D alimentato dal PRNG
│  │  ├─ blocks/registry.ts         BlockRegistry, BlockDef
│  │  ├─ blocks/builtin.ts          air, grass, dirt, stone
│  │  ├─ world/units.ts             BLOCK_SIZE_M, conversioni blocchi ↔ metri
│  │  ├─ world/chunk.ts             Chunk 32³ su Uint8Array
│  │  ├─ world/world.ts             World: limiti, get/set, osservatori, chunk interessati, hash
│  │  └─ gen/terrain.ts             generateTerrain(world, seed, params)
│  ├─ render/
│  │  ├─ meshing/mesher.ts          puro: chunk "imbottito" → buffer tipizzati (niente three)
│  │  ├─ meshing/ao.ts              livelli di occlusione per vertice
│  │  ├─ meshing/colorVariation.ts  variazione deterministica, sRGB → lineare
│  │  ├─ chunkRenderer.ts           una Mesh per chunk, ricostruzione dei chunk "sporchi"
│  │  ├─ scene.ts                   luci, ombre, cielo, nebbia
│  │  └─ flyCamera.ts               controlli + clampCamera (funzione pura)
│  └─ app/
│     ├─ main.ts                    avvio e ciclo di rendering
│     ├─ params.ts                  seed da URL
│     ├─ debugOverlay.ts            overlay F3
│     └─ testHook.ts                window.__yw3d, solo in dev/test
├─ scripts/sdd-trace.ts
└─ e2e/smoke.spec.ts
```
I test unitari stanno accanto al file che verificano (`*.test.ts`).

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Chunk da 32 × 32 × 32 su `Uint8Array` (fino a 255 tipi) | 16³: 1536 chunk e troppe draw call. 64³: ricostruzione oltre 16 ms. `Uint16Array` | Mondo di default = 16 × 3 × 16 = 768 chunk; quelli senza facce visibili (tutto aria, o pieni e circondati) non producono una Mesh. 255 tipi bastano a lungo; passare a 16 bit è una modifica locale. |
| P2 | Meshing per facce con culling, non greedy | Greedy meshing | Il greedy fonde le facce e cancellerebbe variazione di colore e AO per blocco (RENDER-001/002). Triangoli stimati: 1–1,5 M, sostenibili con il frustum culling per chunk di Three.js. |
| P3 | Il mesher lavora su una copia del chunk con bordo di 1 blocco (34³) e produce buffer tipizzati | Leggere i vicini dal World a ogni faccia | Niente casi speciali ai confini tra chunk; il mesher si può spostare in un Web Worker senza modifiche. |
| P4 | AO classico a 3 vicini, 4 livelli, inversione della diagonale del quad in base ai livelli agli angoli | SSAO in post-processing | Deterministico, testabile, nessun costo a runtime. |
| P5 | Colore sRGB nel registro (core), conversione in lineare nel mesher. Variazione = chiazze (rumore a bassa frequenza, λ ≈ 24–48 blocchi) + grana per blocco (hash(x, y, z) → [−1, 1]), su luminosità e un poco sulla tinta; la somma resta entro l'ampiezza del tipo (es. erba: chiazze ±5%, grana ±3%) | Solo grana per blocco: effetto "sale e pepe" su prati estesi. Colore sfumato per vertice: richiede un emendamento a RENDER-001.b. Texture di rumore: contro RENDER-001.a | Nessuna texture (RENDER-001.a), deterministico (RENDER-001.b), prati organici e non a scacchiera (RENDER-001.c). |
| P6 | `MeshLambertMaterial` con `vertexColors` | `MeshStandardMaterial` | Più economico; look morbido; PBR non serve in F01. |
| P7 | Un'unica `DirectionalLight` con shadow map 4096 (PCF soft) che copre tutto il mondo; `shadowMap.autoUpdate = false`, aggiornata solo dopo una ricostruzione | Cascaded shadow maps | Il mondo è finito e statico: circa 6 cm per texel su 256 m, costo delle ombre quasi nullo a regime. |
| P8 | Cielo: sfera con `ShaderMaterial` a gradiente. `THREE.Fog` lineare con il colore dell'orizzonte | `Sky` degli esempi di three (scattering fisico) | Controllo diretto dello stile; colore nebbia = orizzonte (RENDER-004.b). |
| P9 | Rumore con `simplex-noise` v4, inizializzato dal PRNG con seed | Implementazione propria | Libreria piccola e testata; usa solo aritmetica di base, quindi è deterministica anche tra motori JS diversi. |
| P10 | Hash del mondo: FNV-1a a 32 bit sui dati dei chunk in ordine fisso | SHA-256 via WebCrypto | Sincrono e identico in Node e nel browser. |
| P11 | Confine del core: `tsconfig.core.json` con `lib: ["ES2022"]` e `types: []` (niente DOM); import di `three` vietato in `src/core` con `no-restricted-imports` di ESLint | Solo convenzione | Rende ARCH-001.a verificabile automaticamente. |
| P12 | Hook `window.__yw3d` (stato di caricamento, seed, hash, statistiche, `setBlock`) esposto solo se `import.meta.env.DEV` o `MODE === 'test'`. In più ogni esecuzione e2e salva screenshot da punti di vista fissi in `e2e/screenshots/` (fuori da git), senza confrontarli | Solo hook. Confronto pixel per pixel con immagini di riferimento: fragile con SwiftShader e colori in taratura | Asserzioni robuste senza confronti di pixel; gli screenshot servono alla revisione visiva dell'utente. |
| P13 | Tasti letti da `KeyboardEvent.code` | `KeyboardEvent.key` (dipende dal layout). Tasti rimappabili (nessun requisito lo chiede in F01) | Posizione fisica indipendente dal layout (CAM-001.b). |
| P14 | Terreno con domain warping: le coordinate di colline e poggi sono deformate da un secondo rumore prima del calcolo dell'altezza | Solo fbm + poggi: rilievi a macchie tonde. Erosione idraulica: più realistica, ma costosa (rischio sul budget di 5 s) e difficile da rendere deterministica | Crinali e valli sinuosi, più naturali (WORLD-006.g), per 2 valutazioni di rumore in più per colonna. |

## Generazione del terreno
Altezza della superficie per colonna, con parametri raccolti in `TerrainParams`:

```
(x', z') = (x, z) + A_warp · (simplex(x, z; λw), simplex(x + k, z + k; λw))    domain warping (P14)
h(x, z) = base
        + A_colline   · fbm(x', z'; λ ≈ 96 blocchi, 4 ottave)
        + A_poggi     · Σ bump(x', z'; centro_i, raggio_i)     2–5 poggi, posizioni dal PRNG
        + A_dettaglio · simplex(x, z; λ ≈ 20 blocchi)
h ← clamp(round(h), 16, 72)
```

- Colonna rocciosa se il dislivello con un vicino è ≥ 3, oppure se sta su un poggio e un rumore dedicato supera una soglia.
- Colonna rocciosa: tutta pietra. Colonna erbosa: pietra fino a `h − d`, poi `d` ∈ [3, 5] blocchi di terra (d da rumore), poi erba.
- I poggi garantiscono il rilievo (WORLD-006.c) e la roccia minima (WORLD-006.f) anche con seed "piatti".
- Pianure (A1.2, T1.16+): un rumore a grande scala (λ ≈ 200 blocchi) definisce una maschera 0–1 di pianura; dove vale 1, colline e dettaglio sono ridotti al 5%, mentre i poggi restano interi per non perdere rilievo (WORLD-006.c).
- La taratura dei parametri fa parte di T1.06. È finita quando i test di WORLD-006 passano sui 5 seed; l'aspetto si valuta con l'utente al punto di controllo dopo T1.12.

## Strategia di test

| Livello | Strumento | Cosa copre |
|---|---|---|
| Unit | Vitest (ambiente Node) | Core completo, mesher, `clampCamera`, lettura dei parametri, `sdd-trace` con fixture |
| Architettura | Vitest + API di ESLint | `lintText` di un file fittizio in `src/core` che importa `three`: deve dare errore (ARCH-001.a) |
| E2E | Playwright + Chromium headless (WebGL via SwiftShader) | Avvio senza errori in console, seed da URL, hash browser = hash Node, aggiornamento incrementale tramite hook |
| Manuale | Checklist a T1.14 | Tutti i criteri `[manuale]` |

Convenzione: il titolo di ogni test inizia con i criteri che verifica, es. `it('WORLD-002.c: out-of-bounds read returns air', …)`. Un test può citarne più di uno.

`sdd-trace` legge i requisiti dalle intestazioni `### AREA-NNN` della spec e i criteri dalle righe `- **x** [tipo]`; i task dalle righe `- [ ] **Tn.nn**` del piano con la riga `Req:` che segue; i test dai titoli in `src/**/*.test.ts` ed `e2e/**/*.spec.ts`.

## Dipendenze nuove
- Runtime: `three` (rendering), `simplex-noise` (P9).
- Sviluppo: `typescript`, `vite`, `vitest`, `@types/three`, `eslint`, `typescript-eslint`, `prettier` (formattazione uniforme del codice scritto dagli agenti), `@playwright/test` (e2e), `tsx` (esecuzione di `scripts/*.ts` con Node 20).

## Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| WebGL headless non disponibile in WSL2 | I test e2e non girano | Flag SwiftShader (`--use-angle=swiftshader`). In ultima istanza i criteri `[e2e]` diventano `[manuale]` tramite emendamento. |
| Le dipendenze di sistema di Playwright richiedono sudo | Installazione bloccata | L'utente esegue una volta `sudo npx playwright install-deps chromium`. |
| Ombre sull'intero mondo pesanti su GPU integrata | PERF-001.b non passa | Già mitigato da P7 (ombre statiche); altrimenti shadow map 2048. |
| Meshing di 768 chunk nel thread principale oltre il budget di 5 s | PERF-001.a non passa | Saltare i chunk senza facce (P1); se non basta, meshing in Web Worker (P3 lo rende possibile) come task `+`. |
| Terreno che sembra rumore, non natura | WORLD-006.g non passa | Punto di controllo visivo con l'utente dopo T1.12, prima di chiudere. |
| Differenze numeriche tra Node e browser | WORLD-005.d non passa | Solo aritmetica di base nella generazione, altezze arrotondate a intero, test e2e dedicato. |
| Le prestazioni misurate sul browser Windows dipendono dalla rete WSL2 | Tempo di caricamento falsato | Misurare con `vite build` + `vite preview`, non con il dev server. |

## Task

Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T1.01** Scaffold del progetto e controlli di qualità
  - Req: ARCH-001, SDD-002 · Dip: —
  - Vite + TS strict, `index.html` con canvas a tutto schermo, `.gitignore`; tsconfig dell'app e del core (P11); ESLint + typescript-eslint con la regola su `src/core`; Prettier; Vitest in ambiente Node. Script npm: `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `test`, `check`.
  - Fatto quando: `npm run check` è verde; i test ARCH-001.a (`lintText`) e ARCH-001.b passano; `npm run dev` mostra una pagina con il canvas.

- [x] **T1.02** Script di tracciabilità
  - Req: SDD-001 · Dip: T1.01
  - `scripts/sdd-trace.ts` con il parsing descritto nella strategia di test; output a matrice su stdout; exit ≠ 0 per requisiti senza task, criteri `[unit]`/`[e2e]` senza test, ID sconosciuti. Script npm `sdd:trace`.
  - Fatto quando: i test su fixture passano; eseguito su F01 mostra la matrice (che fallisce finché mancano i test: è atteso).

- [x] **T1.03** PRNG, hash e rumore deterministici
  - Req: WORLD-005 · Dip: T1.01
  - `rng.ts` (sfc32 con seed, FNV-1a, hash di posizione `hash3(x, y, z, seed)`), `noise.ts` (simplex 2D, fbm, domain warping).
  - Fatto quando: test di ripetibilità e di intervallo dei valori passano.

- [x] **T1.04** Registro dei blocchi e blocchi di F01
  - Req: WORLD-004 · Dip: T1.01
  - `BlockDef`, `BlockRegistry` con validazione di duplicati; `builtin.ts` con colori base e ampiezze di variazione della palette naturalistica calda. Valori di partenza (sRGB): erba `#7DA453`, terra `#8A6A4B`, pietra `#8F8B84`.
  - Fatto quando: test WORLD-004.a–d verdi.

- [x] **T1.05** Unità, chunk e World
  - Req: WORLD-001, WORLD-002, WORLD-003, RENDER-005 · Dip: T1.04
  - Conversioni blocchi ↔ metri; validazione delle dimensioni; `getBlock`/`setBlock` con limiti; osservatori delle modifiche; `chunksAffectedBy(x, y, z)`; `hash()`.
  - Fatto quando: test WORLD-001, WORLD-002, WORLD-003 e RENDER-005.a verdi.

- [x] **T1.06** Generatore di terreno
  - Req: WORLD-005, WORLD-006 · Dip: T1.03, T1.05
  - Algoritmo della sezione "Generazione del terreno"; `TerrainParams` con i default; taratura; hash di riferimento per il seed 1.
  - Fatto quando: test WORLD-005.a–c e WORLD-006.a–f verdi su 5 seed; generazione del mondo di default in Node ≤ 1,5 s.

- [x] **T1.07** Mesher: culling delle facce e bordi del mondo
  - Req: RENDER-001, RENDER-006 · Dip: T1.05
  - Copia imbottita 34³ (P3); una faccia per ogni lato tra un blocco opaco e uno non opaco, fuori mondo compreso; buffer di posizioni, normali, colori, indici.
  - Fatto quando: test su casi noti verdi (blocco isolato = 6 facce, due blocchi adiacenti = 10 facce, blocco d'angolo del mondo con facce esterne presenti; RENDER-001.a, RENDER-006.a).

- [x] **T1.08** Occlusione ambientale e variazione di colore
  - Req: RENDER-001, RENDER-002 · Dip: T1.03, T1.07
  - Livelli di AO per vertice e inversione della diagonale (P4); variazione di colore a chiazze + grana (P5).
  - Fatto quando: test RENDER-001.b e RENDER-002.a–b verdi su configurazioni di vicini note.

- [x] **T1.09** Rendering dei chunk con ricostruzione incrementale
  - Req: RENDER-005, PERF-001 · Dip: T1.08
  - `chunkRenderer.ts`: una `Mesh` per chunk, coda dei chunk sporchi alimentata dagli osservatori del World, ricostruzione a inizio frame, misura della durata.
  - Fatto quando: nel browser si vede il terreno; una `setBlock` da console aggiorna la scena; tempi di ricostruzione misurati.

- [x] **T1.10** Scena: luci, ombre, cielo, nebbia
  - Req: RENDER-003, RENDER-004 · Dip: T1.09
  - Luce emisferica + direzionale con ombre statiche (P7); cielo a gradiente e nebbia (P8); prima taratura dei colori. Valori di partenza: cielo da `#DCE8EC` (orizzonte, = nebbia) a `#86B4DC` (zenit), sole `#FFE8C4` basso sull'orizzonte.
  - Fatto quando: la scena mostra ombre, cielo e nebbia; screenshot allegato al commit per la revisione.

- [x] **T1.11** Camera libera
  - Req: CAM-001 · Dip: T1.09
  - Pointer lock, WASD/Spazio/Shift con `KeyboardEvent.code` (P13), rotella per la velocità, `clampCamera` pura, posizione iniziale.
  - Fatto quando: test CAM-001.d verde; volo verificato a mano.

- [x] **T1.12** Avvio dell'app, overlay e hook di test
  - Req: APP-001, DEBUG-001, PERF-001 · Dip: T1.06, T1.10, T1.11
  - `params.ts` (seed da URL, avviso se non valido); sequenza di caricamento con misura del tempo; overlay F3; `testHook.ts` (P12).
  - Fatto quando: l'app parte con `?seed=` e senza; l'overlay mostra tutti i campi di DEBUG-001.a. **Punto di controllo con l'utente**: prima demo visiva, commenti sul look.

- [x] **T1.13** Test end-to-end
  - Req: APP-001, WORLD-005, RENDER-005 · Dip: T1.12
  - Configurazione Playwright (Chromium, SwiftShader, `vite preview`); test APP-001.a–b, WORLD-005.d (hash browser = hash Node), RENDER-005.b; screenshot da 3 punti di vista fissi (P12). Script npm `e2e`. Prerequisito: l'utente esegue una volta `sudo npx playwright install-deps chromium`.
  - Fatto quando: `npm run e2e` è verde in locale.

- [x] **T1.15+** Movimento della camera anche con le frecce
  - Req: CAM-001 (A1.1) · Dip: T1.11
  - `ArrowUp`/`ArrowLeft`/`ArrowDown`/`ArrowRight` aggiunti ai codici di movimento, equivalenti a W/A/S/D.
  - Fatto quando: `npm run check` verde; volo con le frecce verificato a mano.

- [x] **T1.16+** Aree pianeggianti nel terreno
  - Req: WORLD-006 (A1.2) · Dip: T1.06
  - Maschera di pianura nel generatore (vedi "Generazione del terreno"); test WORLD-006.h; hash di riferimento di WORLD-005.b aggiornato con deviazione registrata.
  - Fatto quando: tutti i test di WORLD-006 verdi sui 5 seed; aspetto rivisto con l'utente.

- [x] **T1.14** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T1.13, T1.15+, T1.16+
  - `check`, `e2e`, `sdd:trace -- F01`; checklist dei criteri `[manuale]` compilata con l'utente; spec vive create da questa spec; `retro.md`; aggiornamento di `experiment.md` e `roadmap.md`.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T1.01 ─┬─ T1.02
       ├─ T1.03 ─────────────┬─ T1.06 ──────────────┐
       └─ T1.04 ─ T1.05 ─┬───┘                      │
                         └─ T1.07 ─ T1.08 ─ T1.09 ─┬─ T1.10 ─┤
                                                   └─ T1.11 ─┴─ T1.12 ─ T1.13 ─ T1.14
```
(T1.08 dipende anche da T1.03.) Emendamenti A1.1 e A1.2: T1.15+ (dopo T1.11) e T1.16+ (dopo T1.06) precedono T1.14.

## Modalità di esecuzione
Decisa con l'utente alla revisione del piano:
- **Autonomia:** dopo G2 i task si eseguono in ordine senza fermarsi fino al punto di controllo dopo T1.12. Ci si ferma prima solo se serve un emendamento alla spec o un comando con `sudo`.
- **Git:** a fine di ogni task, con `npm run check` verde, commit `T1.nn: …` e push su `main`. L'autorizzazione vale per tutta la fase F01.
- **Punti di controllo:** G2 prima di T1.01; demo visiva dopo T1.12; G3 a T1.14.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T1.01 | Vitest 4.1 invece di 5, TypeScript 6.0 invece di 7 | Vitest 5 richiede Node 22 (qui c'è Node 20.20); typescript-eslint non supporta ancora TypeScript 7. Node 20 è fuori supporto da aprile 2026: aggiornare a Node 22/24 è da pianificare | Nessuno |
| T1.01 | Dipendenze di sviluppo in più: `@eslint/js`, `@types/node` | Configurazione base di ESLint e tipi di Node per test e script: fanno parte degli strumenti già scelti | Nessuno |
| T1.01 | `.npmrc` con `maxsockets=3` | Con molte connessioni in parallelo i download da npm si bloccano sulla rete di sviluppo; con 3 l'installazione dura pochi secondi | Nessuno |
| T1.01 | Test di ARCH-001 in `tests/architecture.test.ts` e non accanto a un file; il controllo sul DOM usa il compilatore TypeScript | Il test è trasversale a tutto il core; così anche ARCH-001.a lato DOM è verificato in automatico | Nessuno |
| T1.02 | Dati di prova dello script in `scripts/__fixtures__/` (spec, piano e test finti come file `.md`/`.txt`) | Scritti dentro il file di test, gli ID finti venivano letti come riferimenti reali | Nessuno |
| T1.06 | Il generatore ha componenti in più rispetto alla formula del piano: un'onda lunga per valli e alture (λ ≈ 420), gli affioramenti sollevati fino a 3 blocchi, poggi sovrapposti combinati col massimo invece che sommati, limite morbido delle altezze invece del clamp, 3–6 poggi invece di 2–5 | Con la sola formula del piano il rilievo di alcuni seed era sotto i 16 blocchi (WORLD-006.c) e le cime venivano tagliate piatte a 72 | Nessuno |
| T1.06 | `World.fromColumns` copia le colonne un segmento di chunk alla volta | La versione blocco per blocco portava la generazione a ~1 s; ora ~0,7 s | Nessuno |
| T1.07 | Buffer compatti: posizioni `Uint8`, normali `Int8`, colori `Uint16` normalizzati, indici a 16 bit quando bastano | Con `Float32` il mondo di default (~700 mila facce) occuperebbe più di 100 MB di geometria; così circa 40 MB | Nessuno |
| T1.08 | Aggiunto `World.readColumn` (lettura di una colonna con un accesso per chunk), usato dai test del terreno | Il test degli strati di WORLD-006.d superava il timeout di 5 s quando girava in parallelo agli altri; servirà anche a fisica e navigazione | Nessuno |
| T1.09 | Unità della scena Three.js = 1 blocco (non 1 metro) | Le coordinate della scena coincidono con quelle del core; le conversioni in metri restano confinate a camera, nebbia e overlay | Nessuno |
| T1.09 | `@playwright/test` e Chromium headless installati in T1.09 invece che in T1.13 | Servono per controllare il risultato visivo con screenshot già durante T1.09–T1.12. Chromium headless parte in WSL anche senza `install-deps` | Nessuno |
| T1.10 | Ombre `PCFShadowMap` invece di PCF soft | Three.js r186 ha rimosso `PCFSoftShadowMap` | Nessuno |
| T1.12 | L'overlay diagnostico è visibile all'avvio (F3 lo nasconde) e mostra anche i tempi di generazione e meshing; i testi dell'interfaccia sono in inglese come il codice | Utile alla demo e alla misura di PERF-001.a; la spec non fissa lo stato iniziale né la lingua dell'interfaccia | Nessuno |
| T1.16+ | Hash di riferimento di WORLD-005.b da `decee4b7` a `b8c27500` | Il generatore produce un terreno diverso per le pianure dell'emendamento A1.2, come previsto da WORLD-005.b | Nessuno. Sui 5 seed: zone piane 31–47% (soglia 25%); il rilievo di WORLD-006.c scende a 17 blocchi sui seed 1 e 2, con 1 blocco di margine |
| T1.13 | Niente `sudo npx playwright install-deps chromium`; WebGL software forzato con `--use-angle=swiftshader` | Lo sviluppo è passato a macOS, dove i browser di Playwright erano già installati e le dipendenze di sistema non servono. SwiftShader esplicito rende il rendering uguale su ogni macchina | Nessuno. Il riferimento hardware di PERF-001 (PC Windows + WSL2) va riconsiderato alla verifica di T1.14 |
| T1.14 | Prestazioni misurate con Chrome sul PC Windows di riferimento, ma con la build servita da macOS invece che da WSL2 (opzione A, scelta dall'utente) | Lo sviluppo è passato a macOS; chi serve i file incide solo sul trasferimento iniziale, non su fps e tempi di rendering | Nessuno: PERF-001 resta invariato |
