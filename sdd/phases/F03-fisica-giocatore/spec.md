# F03 — Fisica e giocatore

| | |
|---|---|
| Stato | **approved** (G1, 2026-09-26) |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-26 |
| Piano | [plan.md](plan.md) (dopo G1) |

## Obiettivo
Un unico sistema fisico, nel core, muove tutte le entità del mondo: volume, gravità, salto, collisioni con i blocchi, gradini da un blocco, acqua. Il giocatore è la prima entità: cammina, salta e nuota nel mondo in prima o terza persona, senza attraversare i blocchi solidi. La camera libera resta come modalità di debug. La simulazione è deterministica e non dipende dal frame rate, così i personaggi di F04–F05 potranno usarla allo stesso modo.

## Contesto
- Spec vive coinvolte: [world.md](../../specs/world.md) (proprietà `solid` dei blocchi), [camera.md](../../specs/camera.md) (la camera libera diventa modalità di debug), [world-file.md](../../specs/world-file.md) (posizione di partenza del giocatore), [debug.md](../../specs/debug.md), [performance.md](../../specs/performance.md).
- Principi: P3 (la fisica è l'unica autorità sul movimento: le entità esprimono intenzioni, solo la fisica cambia le posizioni; unica eccezione lo spawn), P2 (core deterministico e testabile in Node).
- Misure (D-002): 1 blocco = 0,5 m; un adulto è alto circa 3,5 blocchi. Le porte delle case sono larghe 2 blocchi e alte 5 (STRUCT-006.b); il terreno ha gradini di 1 blocco quasi ovunque (WORLD-006.b).

## Fuori scope
- Personaggi, navigazione, animazioni: F04. In F03 il corpo del giocatore in terza persona è una figura semplice e statica.
- Salute, danni da caduta, morte.
- Accovacciarsi, scale a pioli, arrampicata, porte che si aprono.
- Acqua che scorre, correnti, apnea.
- Controlli touch e gamepad.
- Collisioni tra entità (arrivano con più entità, in F04).

## Storie utente
- **US-1** Come giocatore, cammino nella valle, salgo i gradini del terreno senza saltare e non attraverso muri né alberi.
- **US-2** Come giocatore, entro in una casa dalla porta ed esco dall'altra parte del borgo.
- **US-3** Come giocatore, cado nel laghetto, galleggio, nuoto e risalgo sulla riva.
- **US-4** Come giocatore, passo dalla prima alla terza persona per vedermi nel mondo.
- **US-5** Come sviluppatore, passo alla camera libera per ispezionare il mondo, poi torno al giocatore dov'era.
- **US-6** Come sviluppatore, riproduco esattamente un movimento dato lo stato iniziale e la sequenza di comandi.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### PHYS-001 — Entità e intenzioni
- **a** `[unit]` Un'entità fisica ha un volume a scatola allineata agli assi (larghezza e altezza in blocchi), una posizione e una velocità.
- **b** `[unit]` Il codice che guida un'entità esprime solo intenzioni: direzione e andatura del movimento orizzontale, salto, salita e discesa in acqua. Dopo lo spawn la posizione cambia solo nel passo di simulazione (P3).
- **c** `[unit]` Lo spawn colloca l'entità in un punto libero: se il punto richiesto interseca blocchi solidi, l'entità sale fino al primo spazio libero sopra di essi.

### PHYS-002 — Passo fisso e determinismo
- **a** `[unit]` La simulazione avanza a passo fisso di 1/60 s, indipendentemente dal frame rate del rendering.
- **b** `[unit]` Stesso mondo, stesso stato iniziale e stessa sequenza di intenzioni per passo producono posizioni e velocità identiche in esecuzioni ripetute.
- **c** `[unit]` Simulare lo stesso tempo con frame rate diversi (30, 60, 144 fps) porta allo stesso stato.
- **d** `[e2e]` Una sequenza di intenzioni eseguita nel browser porta allo stesso stato che in Node.
- **e** `[manuale]` Il movimento a schermo è fluido anche con frame rate diverso da 60 fps (nessuno scatto dovuto al passo fisso).

### PHYS-003 — Gravità
- **a** `[unit]` Un'entità non sostenuta accelera verso il basso con l'accelerazione di gravità (Q1), fino a una velocità massima di caduta.
- **b** `[unit]` Un'entità che cade si ferma appoggiata sulla faccia superiore del primo blocco solido sotto di sé ed è "a terra".

### PHYS-004 — Collisioni con i blocchi
- **a** `[unit]` Dopo ogni passo il volume di un'entità non interseca alcun blocco solido. Verificato con percorsi casuali di almeno 10 000 passi nel mondo predefinito.
- **b** `[unit]` Contro un muro l'entità scivola: la componente del movimento parallela al muro si conserva.
- **c** `[unit]` Alla massima velocità (caduta e corsa) un'entità non attraversa un muro o un pavimento spesso un blocco.
- **d** `[unit]` I blocchi non solidi (aria, acqua, foglie: vedi WORLD-004 modificato) non fermano l'entità.

### PHYS-005 — Salto e gradini
- **a** `[unit]` Il salto parte solo da terra (o dall'acqua, vedi PHYS-006) e porta i piedi a un'altezza massima di 2,0–2,4 blocchi (1,0–1,2 m) sopra il punto di partenza (Q1).
- **b** `[unit]` Camminando contro un gradino alto 1 blocco l'entità lo sale senza saltare; un gradino alto 2 blocchi la ferma.
- **c** `[manuale]` La salita dei gradini è morbida: la visuale non scatta di un blocco a ogni gradino.

### PHYS-006 — Acqua
Un'entità è "in acqua" quando almeno metà del suo volume è in blocchi d'acqua.
- **a** `[unit]` In acqua la velocità orizzontale massima è al più metà di quella a terra.
- **b** `[unit]` Senza intenzioni, un'entità in acqua galleggia: entro 3 s si stabilizza con la sommità del volume sopra il pelo dell'acqua.
- **c** `[unit]` Con le intenzioni di salita e discesa l'entità nuota verso l'alto o verso il fondo.
- **d** `[unit]` Dall'acqua l'entità risale su una riva alta 1 blocco sopra il pelo dell'acqua.

### PLAYER-001 — Giocatore
- **a** `[unit]` Il giocatore è un'entità fisica larga 1,2 blocchi (0,6 m) e alta 3,5 blocchi (1,75 m), con gli occhi a 3,2 blocchi (1,6 m) da terra.
- **b** `[unit]` Il giocatore passa per la porta di ogni casa (STRUCT-006.b) e ci entra camminando dall'esterno.
- **c** `[unit]` All'avvio il giocatore compare nel punto indicato dal file del mondo (YAML-008) o, senza indicazione, al centro del mondo; in entrambi i casi appoggiato sul primo spazio libero sopra la superficie.

### PLAYER-002 — Controlli del giocatore
- **a** `[unit]` Camminata a 4 m/s, corsa a 7 m/s tenendo premuto Shift (Q2).
- **b** `[manuale]` Un click cattura il puntatore ed Esc lo rilascia; il mouse ruota la visuale con inclinazione limitata a ±89°. W/A/S/D muovono nel piano orizzontale secondo la direzione di vista (posizione fisica dei tasti); le frecce ↑/↓ vanno avanti e indietro come W/S, le frecce ←/→ ruotano la visuale a sinistra e a destra (A3.1); Spazio salta. In acqua Spazio o Z fanno salire, X fa scendere.

### PLAYER-003 — Visuale in prima e terza persona
- **a** `[manuale]` All'avvio la visuale è in prima persona, all'altezza degli occhi. Il tasto V alterna prima e terza persona.
- **b** `[unit]` In terza persona la camera sta dietro e sopra il giocatore, a 8 blocchi (4 m); se un blocco solido si mette in mezzo, la camera si avvicina fino a non attraversarlo.
- **c** `[manuale]` In terza persona il giocatore è visibile come una figura a blocchi semplice, orientata come la visuale (Q4).

### YAML-008 — Partenza del giocatore
- **a** `[unit]` Il file del mondo può dichiarare la posizione orizzontale di partenza del giocatore (x, z in blocchi) e l'orientamento iniziale della visuale.
- **b** `[unit]` Una posizione di partenza fuori dal mondo è un errore nel formato di YAML-002.

### PERF-003 — Costo della simulazione
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Un passo di simulazione del giocatore costa al più 1 ms (valore mostrato nell'overlay).
- **b** `[manuale]` Con il giocatore nel mondo predefinito valgono i budget di PERF-001 (caricamento ≤ 5 s, ≥ 60 fps camminando e nuotando).

## Requisiti MODIFICATI

### WORLD-004 — Registro dei tipi di blocco
- **Prima:** c `[unit]` Sono registrati i tipi di F01 (`air`, `grass`, `dirt`, `stone`, con gli stessi id) e quelli di F02: `water` (non solido, non opaco), `sand`, `gravel`, legno e foglie di ciascuna specie di STRUCT-005, `planks` (assi), `cobblestone` (pietrame), `roof_tiles` (coppi).
- **Dopo:** criteri a, b e d invariati; il criterio c diventa:
- **c** `[unit]` Sono registrati i tipi di F01 (`air`, `grass`, `dirt`, `stone`, con gli stessi id) e quelli di F02: `water` (non solido, non opaco), `sand`, `gravel`, legno e foglie di ciascuna specie di STRUCT-005, `planks` (assi), `cobblestone` (pietrame), `roof_tiles` (coppi). Le foglie sono opache ma non solide.
- **Motivo:** i salici hanno tende di foglie fino a 2 blocchi da terra e le chiome basse ostacolerebbero il cammino; attraversare il fogliame è anche più naturale (Q5).

### CAM-001 — Camera libera
- **Prima:** e `[manuale]` All'avvio la camera è sopra il centro del mondo, più in alto della superficie, e inquadra il terreno.
- **Dopo:** criteri a, b, c e d invariati (valgono in modalità camera libera); il criterio e diventa, e si aggiunge f:
- **e** `[manuale]` Passando alla camera libera, la camera parte dalla visuale corrente del giocatore.
- **f** `[manuale]` Il tasto C alterna giocatore e camera libera (modalità di debug). Mentre la camera libera è attiva il giocatore resta fermo dov'era; tornando al giocatore la visuale riprende dal giocatore. (A3.2)
- **Motivo:** dalla F03 si entra nel mondo come giocatore; la camera libera resta per ispezionare (roadmap). Tasto C invece di F4 per l'emendamento A3.2.

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, posizione della camera (in blocchi e in metri), velocità, seed, nome del file del mondo, numero di strutture per tipo, numero di avvisi, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione.
- **Dopo:**
- **a** `[manuale]` Come prima, più: modalità (giocatore in prima o terza persona, camera libera), posizione e velocità del giocatore, se è a terra o in acqua, durata dell'ultimo passo di simulazione.
- **Motivo:** serve a verificare la fisica e PERF-003.a.

## Requisiti RIMOSSI
Nessuno.

## Domande risolte
Chiuse con l'utente il 2026-09-26, prima di G1. Tutte le proposte sono state accettate.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Gravità e salto | Da gioco: gravità 20 m/s², salto fino a circa 1,1 m, caduta massima 40 m/s | PHYS-003.a, PHYS-005.a invariati |
| Q2 | Velocità | Camminata 4 m/s, corsa 7 m/s con Shift | PLAYER-002.a invariato |
| Q3 | Partenza nel YAML | Sezione `player` con `at: [x, z]` e `yaw` facoltativo; senza sezione, centro del mondo | YAML-008 invariato |
| Q4 | Corpo in terza persona | Figura statica a blocchi, fino ai personaggi di F04 | PLAYER-003.c invariato |
| Q5 | Foglie | Non solide, restano opache | WORLD-004 modificato come proposto |
| Q6 | Tasti | V prima/terza persona, F4 camera libera; in acqua Spazio/Z salgono, X scende | PLAYER-002.b, PLAYER-003.a, CAM-001.f invariati |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
| A3.1 | 2026-09-26 | PLAYER-002.b | Le frecce ←/→ ruotano la visuale invece di spostare di lato; ↑/↓ restano avanti e indietro | Richiesta dell'utente alla demo: girarsi senza mouse | sì, utente, 2026-09-26 |
| A3.2 | 2026-09-26 | CAM-001.f | Tasto C invece di F4 per la camera libera | Richiesta dell'utente alla demo | sì, utente, 2026-09-26 |
