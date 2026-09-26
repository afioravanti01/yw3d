# F01 — Fondamenta e mondo voxel naturale

| | |
|---|---|
| Stato | **draft**, in attesa di G1 |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-26 |
| Piano | [plan.md](plan.md) |

## Obiettivo
Un mondo a blocchi finito, generato in modo deterministico da un seed, dall'aspetto naturale e con un'identità visiva diversa da Minecraft, esplorabile nel browser con una camera libera. La fase pone anche le fondamenta per tutte le successive: separazione tra core e rendering, test headless, tracciabilità automatica.

## Contesto
È la prima fase: non esistono spec vive e tutti i requisiti sono AGGIUNTI.
Le fasi successive posizioneranno strutture (F02) e aggiungeranno fisica (F03) e personaggi (F04–F05) su questo mondo. Per questo il modello dei blocchi e l'API di lettura e scrittura devono essere stabili e indipendenti dal rendering.

## Fuori scope
- File YAML e strutture (alberi, case, laghetti): F02. In F01 il mondo contiene solo terreno.
- Acqua: F02.
- Collisioni, gravità, giocatore: F03. In F01 la camera attraversa il terreno.
- Personaggi: F04–F05.
- Modifica dei blocchi da parte dell'utente, salvataggio, mondo infinito, grotte.
- Ciclo giorno/notte, animazioni ambientali, audio: F06.

## Storie utente
- **US-1** Come utente, apro l'app nel browser e in pochi secondi vedo un paesaggio collinare naturale.
- **US-2** Come utente, esploro il mondo volando liberamente con tastiera e mouse.
- **US-3** Come sviluppatore, con lo stesso seed ottengo esattamente lo stesso mondo; con un seed diverso, un mondo diverso.
- **US-4** Come sviluppatore, leggo e scrivo blocchi con un'API del core che non dipende dal rendering, e la verifico con test che girano senza browser.
- **US-5** Come sperimentatore SDD, verifico in automatico che ogni requisito sia coperto da task e test.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### ARCH-001 — Core indipendente dal rendering
Il codice del core (stato e logica del mondo) non dipende da Three.js né dalle API del browser.
- **a** `[unit]` Un import di Three.js nel core fa fallire `npm run check`; lo stesso vale per l'uso di API del DOM.
- **b** `[unit]` Tutti i test del core girano in Node, senza browser né GPU.

### WORLD-001 — Unità e coordinate
- **a** `[unit]` La posizione di un blocco è una terna di interi (x, y, z) in unità blocco; il blocco (x, y, z) occupa il cubo [x, x+1) × [y, y+1) × [z, z+1).
- **b** `[unit]` Un blocco misura 0,5 m di lato. Il core espone un'unica definizione di questo fattore e le funzioni di conversione tra blocchi e metri.

### WORLD-002 — Mondo finito
- **a** `[unit]` Le dimensioni del mondo (X, Y, Z in blocchi) sono configurabili; default 512 × 96 × 512, cioè 256 m × 48 m × 256 m.
- **b** `[unit]` Sono valide dimensioni multiple di 32, con X e Z tra 32 e 1024 e Y tra 32 e 256. Un valore non valido produce un errore che indica il valore e il vincolo violato.
- **c** `[unit]` La lettura di un blocco fuori dai limiti restituisce `air`.
- **d** `[unit]` La scrittura fuori dai limiti non modifica il mondo e restituisce un esito negativo, senza lanciare eccezioni.

### WORLD-003 — Lettura, scrittura e notifica delle modifiche
- **a** `[unit]` Dopo aver scritto un tipo in una posizione, la lettura della stessa posizione restituisce quel tipo.
- **b** `[unit]` Ogni scrittura che cambia davvero un blocco produce una notifica con la posizione; una scrittura che non cambia nulla non produce notifiche.
- **c** `[unit]` Un osservatore delle modifiche può registrarsi e deregistrarsi.

### WORLD-004 — Registro dei tipi di blocco
- **a** `[unit]` Ogni tipo di blocco ha: id numerico stabile, nome univoco, colore base, ampiezza della variazione di colore, `solid` (blocca il movimento; servirà in F03), `opaque` (nasconde le facce adiacenti).
- **b** `[unit]` Registrare un nome o un id già usato produce un errore.
- **c** `[unit]` Sono registrati i tipi di F01: `air` (id 0, non solido, non opaco), `grass`, `dirt`, `stone`.
- **d** `[unit]` Codice esterno al core può registrare un nuovo tipo senza modificare il core.

### WORLD-005 — Generazione deterministica
Il seed è un intero senza segno a 32 bit.
- **a** `[unit]` Stessi seed e configurazione producono un mondo identico (stesso hash del contenuto) in esecuzioni ripetute.
- **b** `[unit]` Per un seed di riferimento l'hash è fissato nei test: se l'output del generatore cambia, il valore va aggiornato esplicitamente e il cambiamento registrato come deviazione.
- **c** `[unit]` 10 seed diversi producono 10 hash diversi.
- **d** `[e2e]` Il mondo generato nel browser ha lo stesso hash di quello generato in Node con lo stesso seed.

### WORLD-006 — Terreno naturale
Verificato con la configurazione di default su 5 seed di test.
- **a** `[unit]` L'altezza della superficie di ogni colonna è compresa tra 16 e 72 blocchi (8–36 m).
- **b** `[unit]` Pendii dolci: almeno l'85% delle coppie di colonne adiacenti ha un dislivello di al più 1 blocco.
- **c** `[unit]` Rilievo percepibile: la differenza tra il 95° e il 5° percentile delle altezze è di almeno 16 blocchi (8 m).
- **d** `[unit]` Stratificazione, senza vuoti sotto la superficie: una colonna erbosa è, dal basso, pietra, poi 3–5 blocchi di terra, poi erba; una colonna rocciosa è tutta pietra.
- **e** `[unit]` Una colonna è rocciosa se il dislivello con almeno uno dei 4 vicini è di 3 blocchi o più; può esserlo anche nelle zone rocciose dei rilievi.
- **f** `[unit]` Almeno il 60% delle colonne ha erba in superficie e almeno l'1% ha roccia affiorante.
- **g** `[manuale]` L'insieme appare come una valle collinare naturale (prati ondulati, uno o più poggi con roccia), non come rumore casuale.

### RENDER-001 — Colore senza texture
Palette naturalistica calda e leggermente desaturata, con luce dorata da tardo pomeriggio (Q4).
- **a** `[unit]` Sui blocchi non si applicano texture bitmap: il colore di ogni vertice deriva dal colore base del tipo di blocco.
- **b** `[unit]` Ogni blocco ha una variazione di colore deterministica che dipende dalla sua posizione: stessa posizione, stesso colore. La luminosità resta entro l'ampiezza di variazione del tipo (es. ±8% per l'erba).
- **c** `[manuale]` I prati mostrano variazioni organiche: né un colore piatto, né un rumore a scacchiera.

### RENDER-002 — Occlusione ambientale per vertice
- **a** `[unit]` Ogni vertice di una faccia visibile ha uno di 4 livelli di occlusione, calcolato dai 3 blocchi che toccano il vertice dal lato della faccia (due laterali e uno d'angolo). Se entrambi i laterali sono opachi il livello è il massimo.
- **b** `[unit]` La diagonale di ogni faccia è scelta in modo che l'occlusione si interpoli senza artefatti legati alla direzione.
- **c** `[manuale]` Spigoli interni e piedi dei gradini sono visibilmente più scuri; nessuna cucitura evidente tra regioni del mondo.

### RENDER-003 — Luce e ombre
- **a** `[manuale]` Una luce solare direzionale proietta sul terreno le ombre dei rilievi.
- **b** `[manuale]` Una luce ambientale cielo/terra dà luminosità diverse a facce con orientamenti diversi; le facce in ombra non sono mai nere.

### RENDER-004 — Cielo e nebbia
- **a** `[manuale]` Il cielo è un gradiente verticale: chiaro all'orizzonte, più saturo allo zenit.
- **b** `[manuale]` La nebbia aumenta con la distanza e ha il colore dell'orizzonte: il terreno lontano sfuma nel cielo senza uno stacco netto.

### RENDER-005 — Aggiornamento incrementale
- **a** `[unit]` Dopo la modifica di un blocco si ricostruisce solo la geometria della regione che lo contiene e, se il blocco è sul confine di una regione, delle regioni confinanti.
- **b** `[e2e]` Una modifica fatta tramite l'API del core si vede nella scena entro il frame successivo.
- **c** `[manuale]` Ricostruire una regione richiede al più 16 ms sull'hardware di riferimento (valore mostrato nell'overlay).

### RENDER-006 — Bordi del mondo
- **a** `[unit]` Le facce dei blocchi sul confine esterno del mondo vengono generate: il mondo appare come un plastico chiuso, con la sezione degli strati visibile ai lati.
- **b** `[manuale]` Guardando verso il bordo dall'interno, la nebbia lo attenua; guardando dall'esterno, la sezione del terreno si legge bene.

### PERF-001 — Prestazioni
Hardware di riferimento: il PC di sviluppo dell'utente, Chrome su Windows collegato alla build di produzione servita da WSL2, mondo di default (Q5).
- **a** `[manuale]` Dall'apertura della pagina al mondo interamente visibile passano al più 5 s (tempo misurato e mostrato nell'overlay).
- **b** `[manuale]` Il frame rate medio è di almeno 60 fps durante 30 s di volo a quota media sopra il mondo.

### CAM-001 — Camera libera
In F01 la camera non ha collisioni e attraversa il terreno.
- **a** `[manuale]` Un click sulla scena cattura il puntatore ed Esc lo rilascia; muovendo il mouse la visuale ruota, con inclinazione limitata a ±89°.
- **b** `[manuale]` W/A/S/D (posizione fisica dei tasti, indipendente dal layout della tastiera) muovono avanti, a sinistra, indietro e a destra nel piano orizzontale secondo la direzione di vista; Spazio sale, Shift scende.
- **c** `[manuale]` La rotella del mouse regola la velocità tra 2 e 40 m/s (default 8 m/s).
- **d** `[unit]` La camera resta entro i limiti del mondo estesi di 16 m su ogni lato e in alto, e non scende sotto y = 0.
- **e** `[manuale]` All'avvio la camera è sopra il centro del mondo, più in alto della superficie, e inquadra il terreno.

### APP-001 — Parametri di avvio
- **a** `[e2e]` Il parametro URL `?seed=<intero>` determina il seed; senza parametro si usa il seed di default `1`.
- **b** `[e2e]` Con un seed non valido compare un avviso visibile e si usa il seed di default.

### DEBUG-001 — Overlay diagnostico
- **a** `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, posizione della camera (in blocchi e in metri), velocità, seed, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione.

### SDD-001 — Tracciabilità automatica
- **a** `[unit]` `npm run sdd:trace -- F01` produce una matrice requisito → task → test per la fase indicata.
- **b** `[unit]` Il comando fallisce (exit ≠ 0) se un requisito non è citato da nessun task, o se un criterio `[unit]` o `[e2e]` non è citato da nessun test.
- **c** `[unit]` Il comando segnala gli ID citati in task o test che non esistono nella spec.

### SDD-002 — Verifica unica
- **a** `[manuale]` `npm run check` esegue typecheck, lint e test unitari, e fallisce se uno di questi fallisce.

## Domande risolte
Chiuse con l'utente il 2026-09-26, prima di G1.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Bordi del mondo | Plastico con la sezione del terreno visibile, attenuata dalla nebbia | RENDER-006 invariato |
| Q2 | Lato del blocco | 0,5 m (D-002) | WORLD-001.b invariato |
| Q3 | Dimensione del mondo | Finito, **256 m × 256 m** (D-003), invece dei 128 m proposti | WORLD-002.a: default 512 × 96 × 512; PERF-001.a: budget da 3 s a **5 s** |
| Q4 | Palette | Naturalistica calda, leggermente desaturata | Nota in RENDER-001 |
| Q5 | Hardware di riferimento | PC dell'utente, Chrome su Windows, build servita da WSL2 | Nota in PERF-001 |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
