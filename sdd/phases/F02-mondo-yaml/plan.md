# F02 — Piano di implementazione

| | |
|---|---|
| Stato | **approved** (G2, 2026-09-26) |
| Versione | 0.2: formato del file e modalità confermati dall'utente |
| Spec | [spec.md](spec.md) v0.2 |
| Data | 2026-09-26 |

## Panoramica
Il mondo nasce da una pipeline pura nel core: **analisi** del YAML (con posizioni di riga) → **validazione** con uno schema dichiarato in TypeScript → **composizione**. La composizione parte dalla mappa delle altezze di F01, calcola le posizioni delle strutture (singole e distribuite), adatta la mappa delle altezze (scavo dei laghetti, livellamento delle case), riempie le colonne con gli strati e infine *stampa* i blocchi di ogni struttura. Tutto è deterministico e gira in Node: i test verificano i criteri sui blocchi prodotti.

Le strutture sono moduli che si registrano con `defineStructure`: schema dei parametri, impronta, modo di adattamento e un generatore che scrive in un *builder* locale; il builder applica rotazione e traslazione, così il generatore lavora sempre in coordinate proprie.

Nel rendering l'unica novità è l'acqua: un secondo passaggio del mesher produce una geometria trasparente per chunk, disegnata dopo quella opaca. L'app sceglie il file con `?world=`, mostra errori e avvisi in un pannello e, in sviluppo, rigenera il mondo quando il file cambia (HMR di Vite).

## Struttura del codice

```
worlds/
├─ default.yaml                     mondo predefinito (APP-002)
e2e/worlds/                         mondi di prova, inclusi solo nella build di test
src/
├─ core/
│  ├─ blocks/builtin.ts             + blocchi di F02 (WORLD-004)
│  ├─ gen/terrain.ts                separazione mappa delle altezze / riempimento delle colonne; versione del generatore
│  ├─ schema/schema.ts              mini-libreria di schema: tipi, intervalli, default, percorsi d'errore
│  ├─ yaml/parse.ts                 YAML → albero con righe; errori di sintassi
│  ├─ yaml/worldFile.ts             schema del file del mondo (YAML-001, 003, 004, 005)
│  ├─ yaml/report.ts                Diagnostic: file, riga, percorso, messaggio, gravità
│  ├─ structures/registry.ts        StructureRegistry, defineStructure
│  ├─ structures/builder.ts         scrittura locale con rotazione, impronta
│  ├─ structures/trees.ts           oak, birch, willow
│  ├─ structures/houses.ts          stone_farmhouse, wooden_hut
│  ├─ structures/pond.ts            pond
│  ├─ structures/builtin.ts         registra le strutture di F02
│  └─ compose/
│     ├─ placement.ts               posizioni singole, seed per struttura, conflitti
│     ├─ scatter.ts                 distribuzioni (Poisson disk deterministico)
│     ├─ adapt.ts                   scavo, livellamento, raccordo sulla mappa delle altezze
│     └─ composeWorld.ts            pipeline completa → World + report
├─ render/meshing/mesher.ts         + passaggio dell'acqua (RENDER-007)
├─ render/chunkRenderer.ts          + mesh trasparente per chunk
└─ app/
   ├─ worlds.ts                     elenco dei file (import.meta.glob), ricarica a caldo
   ├─ params.ts                     ?world=, ?seed= come sostituto
   └─ diagnosticsPanel.ts           pannello di errori e avvisi
scripts/world-check.ts              validazione da terminale (YAML-002.e)
```

## Decisioni tecniche

| # | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| P1 | Analisi YAML con il pacchetto `yaml` (eemeli), in modalità documento con `LineCounter` | `js-yaml`: niente posizioni dei nodi annidati | Serve la riga di ogni campo (YAML-002.a); `yaml` la dà per ogni nodo, è puro JS senza dipendenze e funziona in Node e nel browser. |
| P2 | Schema scritto con una mini-libreria propria (`int`, `number`, `enum`, `bool`, `object`, `list`, `union` con default e intervalli), usata sia per il file sia per i parametri delle strutture | Zod o Valibot + mappatura dei percorsi sulle righe | Il bisogno è piccolo e i percorsi vanno comunque riportati alle righe del YAML. Una libreria propria di ~200 righe evita una dipendenza (P9 della costituzione) e dà messaggi in un solo formato. I campi sconosciuti sono errori (YAML-001.b). |
| P3 | Composizione in quattro passi sulla mappa delle altezze (posizioni → adattamento → riempimento → stampa) invece di modificare un World già riempito | Generare il terreno e poi scavare e riempire blocco per blocco | Sulla mappa delle altezze scavo, livellamento e raccordo sono operazioni su numeri, e la stratificazione (STRUCT-003.e) viene gratis dal riempimento di F01. Il World si scrive una volta sola. |
| P4 | `terrain.ts` si divide in `generateHeightmap` (esiste già) e `fillColumns(map, seed, params, surfaceOverrides)`; `generateTerrain` resta come composizione dei due | Duplicare la logica degli strati nel compositore | Nessun cambiamento dell'output di F01: l'hash di riferimento di WORLD-005.b resta valido. Le sponde di sabbia e ghiaia passano come sostituzioni del blocco di superficie. |
| P5 | Versione del generatore: costante intera nel core (`TERRAIN_GENERATOR_VERSION = 1`), da incrementare quando cambia l'output di `generateHeightmap` o `fillColumns` a parità di input | Hash del codice o dell'output | Esplicita e controllabile. Un test confronta l'hash di riferimento: se cambia senza aggiornare la versione, il test lo ricorda. |
| P6 | Seed di una struttura = `hash3(x, z, indice di tipo, seed del mondo)`; il seed esplicito lo sostituisce | Seed da un PRNG unico consumato in ordine di dichiarazione | Aggiungere o spostare un'altra struttura non ne cambia l'aspetto (YAML-004.d). |
| P7 | Distribuzioni con campionamento Poisson disk a griglia (Bridson) su un PRNG seminato da seed del mondo e indice della distribuzione; scarto delle posizioni che toccano impronte, acqua o bordi | Posizioni casuali uniformi con rifiuto | Distanza minima garantita (YAML-005.d), distribuzione naturale, costo lineare. Il campionamento non legge il terreno (YAML-005.b); i controlli di conflitto sì, ma solo contro impronte e acqua. |
| P8 | Impronta = rettangolo orientato (dopo rotazione) più un margine per tipo; conflitti = intersezione di rettangoli | Maschere per colonna | Sufficiente per case, alberi e laghetti (per il laghetto il rettangolo che contiene la forma). Semplice da testare. |
| P9 | Livellamento: quota = mediana delle altezze sotto l'impronta; raccordo nella fascia di 4 blocchi interpolando verso il terreno originale e poi limitando i salti a 1 blocco con passate successive | Quota media, raccordo lineare puro | La mediana ignora i picchi isolati; le passate garantiscono STRUCT-003.c anche su terreno irregolare. |
| P10 | Laghetto: contorno da raggio base modulato da rumore sull'angolo; fondale digradante; pelo dell'acqua = minimo del bordo − 1 | Forme da maschere predefinite | Forma irregolare e diversa per seed (STRUCT-007.a); il pelo sotto il bordo garantisce l'acqua contenuta (STRUCT-007.b). |
| P11 | Mesher: passaggio separato per l'acqua. Faccia emessa solo se il vicino è aria (non acqua, non opaco); un'unica `MeshLambertMaterial` trasparente (opacità ~0,7, `depthWrite: false`) disegnata dopo le mesh opache | Acqua con shader dedicato (riflessi, onde) | RENDER-007.a–c con il minimo di complessità; riflessi e onde sono materia di F06. Senza facce acqua–acqua l'ordinamento dei trasparenti riguarda solo il pelo e le pareti esposte. |
| P12 | Foglie opache con contorno irregolare: la chioma è un insieme di sfere/ellissoidi deformati, con blocchi di bordo rimossi a caso (seed) | Chioma sferica piena | Q5: silhouette meno "a cubo", nessun costo in più di rendering. |
| P13 | File del mondo inclusi con `import.meta.glob('/worlds/*.yaml', { query: '?raw' })`; in modalità test si aggiungono `e2e/worlds/*.yaml`. Ricarica a caldo con `import.meta.hot.accept` sul modulo che li importa: si rigenera tutto (Q7) e si conserva la posa della camera | Server che espone la cartella; `fetch` a runtime | Nessun server da scrivere; HMR di Vite dà la notifica di modifica gratis. I file di prova non finiscono nella build di produzione. |
| P14 | Errori e avvisi hanno una forma unica (`Diagnostic`: gravità, file, riga, percorso, messaggio), prodotta dal core; pannello dell'app e comando da terminale li formattano allo stesso modo | Eccezioni con messaggi liberi | YAML-002.a/e: stesso formato ovunque; il core non lancia eccezioni su input dell'utente. Per un campo o un tipo sconosciuto il messaggio suggerisce il nome valido più vicino ("did you mean…"), se ce n'è uno simile. |
| P15 | Il mondo predefinito è scritto a mano in `worlds/default.yaml`, dopo aver scelto con gli screenshot una zona pianeggiante per il borgo | Mondo predefinito generato da codice | È anche la demo del formato: deve essere leggibile e modificabile. |

## Formato del file
Esempio indicativo (lo schema esatto nasce in T2.03 e si documenta in `worlds/README.md`):

```yaml
version: 1
terrain:
  seed: 1
  generator: 1
structures:
  - type: stone_farmhouse
    at: [240, 300]
    rotation: 90
    params: { width: 14, depth: 10 }
  - type: pond
    at: [180, 200]
    params: { radius: 12, depth: 4 }
scatter:
  - types: { oak: 3, birch: 2 }
    area: { circle: { center: [120, 380], radius: 60 } }
    density: 0.8          # strutture per 100 m²
    minDistance: 7
```

## Strategia di test
- **Unit (Vitest, Node).** Schema e analisi: un caso per ogni tipo d'errore di YAML-002.c, con controllo di riga e percorso. Strutture: generate in un World vuoto e verificate sui blocchi (porta libera, finestre, tetto, acqua contenuta, chioma collegata). Composizione: mondi piccoli (128 × 96 × 128) per velocità; il mondo predefinito una volta sola per PERF-002.b e YAML-001.c.
- **Proprietà su più seed.** I criteri delle strutture si verificano su 20 seed per tipo, come i 5 seed del terreno in F01.
- **E2E (Playwright).** Mondi di prova in `e2e/worlds/`: valido, non valido, versione del generatore diversa. Test di YAML-001.d, YAML-002.d, YAML-003.c, YAML-006, APP-001; screenshot da punti di vista fissi sul borgo, sul bosco e su un laghetto.
- **Manuale.** Checklist a T2.16, con i valori misurati (proposta della retro di F01).

## Dipendenze nuove
- `yaml`: analisi YAML con posizioni (P1).

## Rischi
| Rischio | Impatto | Mitigazione |
|---|---|---|
| Più facce da disegnare (chiome, case) | PERF-002.a: fps sotto 60 | Misura dei triangoli già a T2.13 con il mondo predefinito. Rimedio pronto: saltare le facce interne alle chiome non visibili (già escluse, sono opache) e ridurre la densità dei boschi. |
| Caricamento oltre 5 s con le strutture | PERF-002.a | La composizione lavora sulla mappa delle altezze (P3); tempi misurati per passo e mostrati nell'overlay. |
| Trasparenza dell'acqua con artefatti | RENDER-007.c | Niente facce acqua–acqua (P11); se non basta, ordinamento per chunk dal più lontano. |
| Case che "ricordano Minecraft" | STRUCT-006.f non passa | Dettagli di carattere (STRUCT-006.e), proporzioni meno cubiche; revisione con gli screenshot a T2.10 prima del mondo predefinito. |
| Il raccordo del livellamento crea gradoni evidenti | Aspetto innaturale | Fascia di 4 blocchi e limite di 1 blocco per passo (P9); verifica visiva a T2.13. |

## Task
Formato: `Req:` requisiti coperti · `Dip:` task da cui dipende · `Fatto quando:` criterio di completamento. Task non pianificati: suffisso `+`.

- [x] **T2.01** Blocchi di F02
  - Req: WORLD-004 · Dip: —
  - `water`, `sand`, `gravel`, `oak_log`, `birch_log`, `willow_log`, `oak_leaves`, `birch_leaves`, `willow_leaves`, `planks`, `cobblestone`, `roof_tiles` con colori della palette calda (RENDER-001); id stabili dopo quelli di F01.
  - Fatto quando: test di WORLD-004.c aggiornato e verde; hash di WORLD-005.b invariato.

- [x] **T2.02** Separazione del generatore di terreno e versione
  - Req: WORLD-005, YAML-003 · Dip: —
  - `fillColumns` con sostituzioni di superficie (P4); `TERRAIN_GENERATOR_VERSION` (P5).
  - Fatto quando: tutti i test di WORLD-005/006 verdi senza cambiare l'hash di riferimento.

- [x] **T2.03** Schema, analisi YAML e diagnostica
  - Req: YAML-001, YAML-002 · Dip: —
  - Dipendenza `yaml`; `schema.ts`, `parse.ts`, `report.ts`, `worldFile.ts` (P1, P2, P14). Documentazione del formato in `worlds/README.md`.
  - Fatto quando: test di YAML-001.a–b e YAML-002.a–c verdi, con riga e percorso controllati.

- [x] **T2.04** Registro delle strutture e builder
  - Req: STRUCT-001, STRUCT-002 · Dip: T2.03
  - `defineStructure`, validazione dei parametri con lo schema, builder con rotazione e impronta, seed per struttura (P6). Una struttura di prova registrata da un test esterno al core.
  - Fatto quando: test di STRUCT-001.a–d e STRUCT-002.a, c verdi.

- [x] **T2.05** Composizione e posizionamento
  - Req: YAML-001, YAML-003, YAML-004, STRUCT-004 · Dip: T2.02, T2.04
  - `composeWorld`: seed e dimensioni dal file, avviso di versione, ancoraggio alla superficie o quota esplicita, parametri di default, conflitti come avvisi, strutture fuori dal mondo come errori.
  - Fatto quando: test di YAML-001.c, YAML-003.a–b, YAML-004.a–d, STRUCT-004.a–b verdi.

- [x] **T2.06** Adattamento al terreno
  - Req: STRUCT-003 · Dip: T2.05
  - Appoggio, livellamento con raccordo (P9), scavo; stratificazione delle colonne modificate.
  - Fatto quando: test di STRUCT-003.a–e verdi su 20 seed.

- [x] **T2.07** Alberi
  - Req: STRUCT-005, STRUCT-002 · Dip: T2.04, T2.01
  - Quercia, betulla, salice con chiome irregolari (P12).
  - Fatto quando: test di STRUCT-005.a–c e STRUCT-002.b verdi; screenshot delle 3 specie allegati al commit.

- [x] **T2.08** Case
  - Req: STRUCT-006 · Dip: T2.04, T2.06, T2.01
  - Casolare in pietra e capanno in legno: porta, finestre, pavimento, tetto a falde, comignolo, travi agli angoli, basamento.
  - Fatto quando: test di STRUCT-006.a–e verdi su 20 seed e 4 rotazioni; screenshot allegati.

- [x] **T2.09** Laghetti
  - Req: STRUCT-007 · Dip: T2.06, T2.01
  - Contorno irregolare, fondale, pelo dell'acqua, sponde (P10).
  - Fatto quando: test di STRUCT-007.a–c verdi su 20 seed.

- [x] **T2.10** Rendering dell'acqua
  - Req: RENDER-007 · Dip: T2.01
  - Passaggio dell'acqua nel mesher, mesh trasparente per chunk (P11). **Punto di controllo con l'utente**: screenshot di alberi, case e laghetto prima di comporre il mondo predefinito.
  - Fatto quando: test di RENDER-007.a verde; screenshot rivisti con l'utente.

- [x] **T2.11** Distribuzioni
  - Req: YAML-005 · Dip: T2.05, T2.09
  - Poisson disk deterministico in rettangoli e cerchi, pesi dei tipi, densità o numero, scarto dei conflitti (P7).
  - Fatto quando: test di YAML-005.a–d verdi.

- [x] **T2.12** Comando di validazione
  - Req: YAML-002 · Dip: T2.05
  - `npm run world:check -- <file>`: stampa errori e avvisi nel formato del core, exit ≠ 0 se ci sono errori.
  - Fatto quando: test di YAML-002.e verde.

- [x] **T2.13** Integrazione nell'app
  - Req: YAML-006, YAML-007, APP-001, DEBUG-001, YAML-002, YAML-003 · Dip: T2.05, T2.10
  - Elenco dei mondi e `?world=` (P13), `?seed=` come sostituto con avviso, pannello di errori e avvisi, overlay con file, strutture e avvisi, ricarica a caldo con posa della camera conservata; hook di test esteso.
  - Fatto quando: l'app carica un file di prova; errori e avvisi visibili; la ricarica a caldo funziona in `npm run dev`.

- [x] **T2.17+** Salire e scendere con Z e X
  - Req: CAM-001 (A2.2) · Dip: —
  - `KeyZ` sale e `KeyX` scende, in aggiunta a `Space` e `Shift`; aiuto dell'overlay aggiornato.
  - Fatto quando: `npm run check` verde; volo con Z e X verificato a mano.

- [x] **T2.14** Mondo predefinito
  - Req: APP-002, PERF-002 · Dip: T2.07, T2.08, T2.09, T2.11, T2.13
  - `worlds/default.yaml`: borgo in una zona pianeggiante, bosco misto, alberi sparsi, laghetti con salici (P15). Tempi e triangoli misurati.
  - Fatto quando: test di PERF-002.b verde; **punto di controllo con l'utente**: demo del mondo predefinito e della ricarica a caldo.

- [ ] **T2.15** Test end-to-end
  - Req: YAML-001, YAML-002, YAML-003, YAML-006, APP-001 · Dip: T2.13
  - Mondi di prova in `e2e/worlds/`; test di YAML-001.d, YAML-002.d, YAML-003.c, YAML-006.a–b, APP-001.a–b (aggiornati); screenshot di borgo, bosco, laghetto.
  - Fatto quando: `npm run e2e` verde.

- [ ] **T2.16** Verifica di accettazione e chiusura della fase
  - Req: — (tutti) · Dip: T2.14, T2.15, T2.12
  - `check`, `e2e`, `sdd:trace -- F02`; checklist dei criteri `[manuale]` con i valori misurati; fusione nelle spec vive; `retro.md`; `experiment.md`, `roadmap.md`. Rivalutazione di D-005 (strumentazione SDD), come previsto.
  - Fatto quando: G3 approvato dall'utente.

## Ordine e parallelismo

```
T2.01 ─────────────────────────┬──────────────┬─ T2.10 ─┐
T2.02 ─┐                       │              │         │
T2.03 ─┴─ T2.04 ─ T2.05 ─ T2.06┼─ T2.07 ──────┤         │
                     │         ├─ T2.08 ──────┤         │
                     │         └─ T2.09 ─ T2.11┤         │
                     ├─ T2.12                  │         │
                     └──────────── T2.13 ──────┴─ T2.14 ─┴─ T2.15 ─ T2.16
```
Punti di controllo: G2 prima di T2.01; revisione visiva delle strutture a T2.10; demo del mondo predefinito a T2.14; G3 a T2.16.

## Modalità di esecuzione
Come in F01, salvo diversa indicazione dell'utente alla revisione del piano:
- **Autonomia:** i task si eseguono in ordine senza fermarsi fino al punto di controllo di T2.10, poi fino a T2.14. Ci si ferma prima solo se serve un emendamento alla spec.
- **Git:** a fine di ogni task, con `npm run check` verde, commit `T2.nn: …`; il push lo esegue l'utente.

## Deviazioni dal piano
| Task | Deviazione | Motivo | Impatto sulla spec |
|---|---|---|---|
| T2.07 | Screenshot di alberi e case rimandati al punto di controllo, che si sposta da T2.10 a dopo T2.13 | Per vedere le strutture serve che l'app carichi un file YAML (T2.13). Nel frattempo le sagome sono controllate con proiezioni ASCII e con i test | Nessuno |
| T2.13 | Prima versione di `worlds/default.yaml` scritta in T2.13, non in T2.14; punti di vista degli screenshot aggiornati in anticipo | Serviva un file reale per provare l'app e fare gli screenshot del punto di controllo. T2.14 resta per rifinire il mondo e misurare le prestazioni | Nessuno |
