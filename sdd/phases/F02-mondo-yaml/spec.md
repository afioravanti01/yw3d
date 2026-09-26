# F02 — Mondo da YAML e strutture programmabili

| | |
|---|---|
| Stato | draft |
| Versione | 0.2: domande aperte risolte |
| Data | 2026-09-26 |
| Piano | [plan.md](plan.md) (dopo G1) |

## Obiettivo
Lo stato iniziale del mondo è descritto da un file YAML validato: seed del terreno, alberi, case e laghetti, posati uno per uno o distribuiti su un'area. Le strutture sono generate da codice registrato, deterministico e parametrizzabile; se ne aggiungono di nuove con un file TypeScript, senza toccare il core. In sviluppo, salvando il file il mondo si aggiorna.

## Contesto
- Spec vive coinvolte: [world.md](../../specs/world.md) (blocchi, generazione), [rendering.md](../../specs/rendering.md) (l'acqua è il primo blocco trasparente), [app.md](../../specs/app.md) (da dove arriva il seed), [performance.md](../../specs/performance.md).
- Principi: P4 (mondo dichiarativo, YAML validato con errori precisi), P5 (registri tipizzati), P2 (tutto nel core, verificabile in Node).
- Il terreno di F01 è deterministico ma cambia quando cambia il generatore. Le posizioni nel YAML quindi non dipendono dalla forma esatta del terreno: x e z sono fissi, l'altezza per default si ricava dalla superficie (note della roadmap del 2026-09-26).
- Le strutture preparano F03–F05: le porte devono essere passabili da un personaggio alto circa 3,5 blocchi (D-002).

## Fuori scope
- Personaggi e loro dichiarazione nel YAML: F04.
- Fisica dell'acqua (scorrimento, nuoto): l'acqua è statica. Il nuoto è in F03.
- Editor visuale del mondo; modifica dei blocchi da parte dell'utente; salvataggio dello stato.
- Vetro e altri blocchi trasparenti oltre all'acqua: le finestre sono aperture.
- Porte che si aprono e chiudono: la porta è un vano libero.
- Arredamento degli interni.
- Grotte e modifiche al generatore di terreno di F01.

## Storie utente
- **US-1** Come autore del mondo, scrivo in un file YAML dove stanno case, alberi e laghetti, e ottengo sempre lo stesso mondo.
- **US-2** Come autore del mondo, pianto un bosco dichiarando un'area e una densità, senza elencare gli alberi uno per uno.
- **US-3** Come autore del mondo, se sbaglio il file ricevo un messaggio che indica file, riga, campo e causa.
- **US-4** Come autore del mondo, in sviluppo salvo il file e vedo il mondo aggiornato senza ricaricare la pagina.
- **US-5** Come sviluppatore, aggiungo un nuovo tipo di struttura con un file TypeScript che la registra, senza modificare il core.
- **US-6** Come autore del mondo, se due strutture si sovrappongono vengo avvisato.

## Requisiti AGGIUNTI

Legenda verifica: `[unit]` test automatico headless · `[e2e]` test automatico nel browser · `[manuale]` verificato dall'utente con la checklist di accettazione.

### YAML-001 — File del mondo
- **a** `[unit]` Un file del mondo dichiara la versione dello schema (`version`), il terreno (`terrain`) e, facoltative, le strutture (`structures`) e le distribuzioni (`scatter`). Una versione dello schema non gestita è un errore.
- **b** `[unit]` Un campo sconosciuto è un errore (così un refuso non passa inosservato).
- **c** `[unit]` Lo stesso file e lo stesso codice registrato producono un mondo identico (stesso hash) in esecuzioni ripetute (P4).
- **d** `[e2e]` Il mondo di un file generato nel browser ha lo stesso hash di quello generato in Node.

### YAML-002 — Validazione ed errori
- **a** `[unit]` Ogni errore indica file, riga, percorso del campo (es. `structures[3].params.width`) e causa leggibile.
- **b** `[unit]` La validazione riporta tutti gli errori del file, non solo il primo.
- **c** `[unit]` Sono errori: sintassi YAML non valida, campo obbligatorio mancante, tipo o intervallo non valido, tipo di struttura non registrato (il messaggio elenca i tipi disponibili), posizione fuori dal mondo.
- **d** `[e2e]` Con un file non valido l'app non genera il mondo e mostra gli errori in un pannello visibile.
- **e** `[unit]` Un comando da terminale valida un file e termina con codice ≠ 0 se ci sono errori, stampandoli nello stesso formato.

### YAML-003 — Terreno dichiarato
- **a** `[unit]` Il file dichiara il seed del terreno; le dimensioni del mondo sono facoltative, con i default e i vincoli di WORLD-002.
- **b** `[unit]` Il file dichiara la versione del generatore di terreno per cui è scritto. Se è diversa da quella in uso il mondo si genera comunque e si produce un avviso che riporta le due versioni.
- **c** `[e2e]` L'avviso di versione è visibile nell'app.

### YAML-004 — Posizionamento delle strutture
- **a** `[unit]` Ogni struttura dichiara il tipo, la posizione orizzontale (x, z in blocchi), i parametri del tipo e, facoltativa, la rotazione (0°, 90°, 180°, 270°).
- **b** `[unit]` Per default la struttura è appoggiata alla superficie del terreno nel suo punto di ancoraggio; una quota esplicita la sostituisce.
- **c** `[unit]` I parametri non dichiarati assumono i default del tipo.
- **d** `[unit]` Ogni struttura ha un seed derivato da seed del mondo e posizione; un seed esplicito lo sostituisce. Spostare o aggiungere un'altra struttura non cambia l'aspetto di questa.

### YAML-005 — Distribuzioni su un'area
- **a** `[unit]` Una distribuzione dichiara uno o più tipi di struttura con i loro pesi, un'area (rettangolo o cerchio) e una densità (strutture per 100 m²) o un numero, più una distanza minima tra le strutture.
- **b** `[unit]` Le posizioni generate sono deterministiche e dipendono solo dalla dichiarazione e dal seed del mondo, non dalla forma del terreno.
- **c** `[unit]` Le strutture distribuite non si sovrappongono tra loro, né alle strutture posate singolarmente, né all'acqua: una posizione in conflitto viene scartata.
- **d** `[unit]` Ogni struttura generata rispetta la distanza minima dichiarata.

### YAML-006 — Scelta del file
- **a** `[e2e]` Senza parametri l'app carica il mondo predefinito del progetto; il parametro URL `?world=<nome>` carica un altro file del progetto.
- **b** `[e2e]` Un nome inesistente produce un errore visibile che elenca i mondi disponibili.

### YAML-007 — Ricaricamento in sviluppo
- **a** `[manuale]` In sviluppo, salvando il file in uso il mondo si rigenera senza ricaricare la pagina, entro il budget di PERF-001.a, e la camera mantiene posizione e orientamento.
- **b** `[manuale]` Se il file salvato non è valido, resta il mondo precedente e compaiono gli errori; alla correzione spariscono.

### STRUCT-001 — Registro delle strutture
- **a** `[unit]` Un tipo di struttura ha: nome univoco, schema dei parametri con tipi, intervalli e default, un generatore deterministico e un modo di adattamento al terreno (STRUCT-003).
- **b** `[unit]` Registrare un nome già usato produce un errore.
- **c** `[unit]` Codice esterno al core può registrare un nuovo tipo senza modificare il core; il tipo è subito utilizzabile nel YAML.
- **d** `[unit]` I parametri del YAML sono validati con lo schema del tipo, con errori nel formato di YAML-002.

### STRUCT-002 — Generazione deterministica delle strutture
- **a** `[unit]` Stessi tipo, parametri, seed e rotazione producono gli stessi blocchi.
- **b** `[unit]` Seed diversi producono variazioni visibili dello stesso tipo (almeno una differenza nella forma, non solo nel colore).
- **c** `[unit]` Una struttura ruotata è la stessa struttura girata attorno al suo ancoraggio.

### STRUCT-003 — Adattamento al terreno
Ogni tipo dichiara un modo di adattamento.
- **a** `[unit]` *Appoggio* (alberi): la struttura parte dalla superficie; sotto la base non ci sono vuoti.
- **b** `[unit]` *Livellamento* (case): il terreno sotto l'impronta è portato a una quota unica. Non ci sono vuoti sotto il pavimento né terreno dentro l'edificio.
- **c** `[unit]` Intorno a un'impronta livellata il terreno si raccorda: entro una fascia di 4 blocchi, tra colonne adiacenti il dislivello è al più di 1 blocco, salvo dove il terreno originale era già più ripido.
- **d** `[unit]` *Scavo* (laghetti): il bacino è scavato nel terreno, con il pelo dell'acqua sotto il bordo più basso.
- **e** `[unit]` Dopo l'adattamento la stratificazione di WORLD-006.d vale per le colonne modificate: erba o sabbia in superficie, terra, pietra; nessun blocco sospeso.

### STRUCT-004 — Conflitti tra strutture
- **a** `[unit]` Se le impronte di due strutture posate singolarmente si sovrappongono si produce un avviso che cita entrambe (riga del file e tipo); il mondo si genera comunque e la struttura dichiarata dopo prevale.
- **b** `[unit]` Una struttura che esce dai limiti del mondo è un errore (YAML-002.c).

### STRUCT-005 — Alberi
- **a** `[unit]` Sono registrate 3 specie: `oak` (quercia), `birch` (betulla), `willow` (salice piangente), con altezza, raggio della chioma e colori propri.
- **b** `[unit]` Ogni specie ha un'altezza entro un intervallo proprio, parametrizzabile: quercia 12–20 blocchi (6–10 m), betulla 14–22, salice 10–16.
- **c** `[unit]` Il tronco è fatto di blocchi di legno, la chioma di foglie; la chioma è collegata al tronco (nessun blocco di foglie isolato).
- **d** `[manuale]` Le 3 specie si riconoscono a colpo d'occhio dalla silhouette: quercia larga e tondeggiante, betulla alta e stretta con tronco chiaro, salice con rami ricadenti.

### STRUCT-006 — Case
- **a** `[unit]` Sono registrati 2 stili: `stone_farmhouse` (casolare in pietra) e `wooden_hut` (capanno in legno), con larghezza e profondità parametrizzabili entro intervalli propri.
- **b** `[unit]` Ogni casa ha almeno una porta: un vano libero largo almeno 2 blocchi e alto almeno 5 (1 m × 2,5 m), raggiungibile dall'esterno a livello del terreno.
- **c** `[unit]` Ogni casa ha almeno una finestra (apertura) per lato lungo, un pavimento e un interno vuoto alto almeno 5 blocchi.
- **d** `[unit]` Il tetto è a falde: ogni falda sale di 1 blocco ogni 1–2 blocchi, con colmo lungo il lato lungo.
- **e** `[unit]` Dettagli di carattere (Q8): ogni casa ha un comignolo e travi a vista agli angoli in legno scuro; il capanno in legno poggia su un basamento in pietra alto almeno 1 blocco.
- **f** `[manuale]` I due stili hanno carattere diverso e non ricordano le case di Minecraft.

### STRUCT-007 — Laghetti
- **a** `[unit]` Un laghetto ha forma irregolare (non un cerchio o un rettangolo), dimensione e profondità parametrizzabili.
- **b** `[unit]` L'acqua è contenuta: ogni blocco d'acqua ha sotto di sé e ai lati acqua o blocchi solidi.
- **c** `[unit]` Le sponde sono di sabbia o ghiaia, entro una fascia di 1–3 blocchi intorno all'acqua.
- **d** `[manuale]` Il laghetto appare naturale, con fondale e sponde digradanti.

### RENDER-007 — Acqua
- **a** `[unit]` Le facce tra due blocchi d'acqua non si generano; le facce tra acqua e un blocco opaco nemmeno.
- **b** `[manuale]` L'acqua è semitrasparente: si vede il fondale vicino alla riva, meno dove è profonda. Il colore è in armonia con la palette di RENDER-001.
- **c** `[manuale]` Nessun artefatto evidente tra acqua e terreno (facce che tremolano, buchi, ordine di disegno sbagliato) guardando da sopra e di lato.

### PERF-002 — Mondo con strutture
Stesso hardware di riferimento di PERF-001.
- **a** `[manuale]` Con il mondo predefinito del progetto valgono i budget di PERF-001 (caricamento ≤ 5 s, ≥ 60 fps).
- **b** `[unit]` Il mondo predefinito contiene almeno 150 alberi, 6 case e 2 laghetti.

### APP-002 — Mondo predefinito
- **a** `[manuale]` Il mondo predefinito del progetto è una valle con almeno un bosco misto, alberi sparsi nei prati, un piccolo borgo di case con entrambi gli stili e laghetti con salici sulle sponde.

## Requisiti MODIFICATI

### WORLD-004 — Registro dei tipi di blocco
- **Prima:** c `[unit]` Sono registrati i tipi di F01: `air` (id 0, non solido, non opaco), `grass`, `dirt`, `stone`.
- **Dopo:** c `[unit]` Sono registrati i tipi di F01 (`air`, `grass`, `dirt`, `stone`, con gli stessi id) e quelli di F02: `water` (non solido, non opaco), `sand`, `gravel`, legno e foglie di ciascuna specie di STRUCT-005, `planks` (assi), `cobblestone` (pietrame), `roof_tiles` (coppi). Criteri a, b e d invariati.
- **Motivo:** le strutture di F02 richiedono nuovi materiali.

### APP-001 — Parametri di avvio
- **Prima:** a `[e2e]` Il parametro URL `?seed=<intero>` determina il seed; senza parametro si usa il seed di default `1`. b `[e2e]` Con un seed non valido compare un avviso visibile e si usa il seed di default.
- **Dopo:** a `[e2e]` Il seed del terreno è quello del file del mondo. Il parametro URL `?seed=<intero>` lo sostituisce, per esplorare varianti, e un avviso visibile lo segnala. b `[e2e]` Con un seed non valido compare un avviso visibile e si usa il seed del file.
- **Motivo:** il mondo di un file non deve dipendere dall'URL (YAML-003).

### DEBUG-001 — Overlay diagnostico
- **Prima:** a `[manuale]` Il tasto F3 mostra e nasconde un overlay con: fps, posizione della camera (in blocchi e in metri), velocità, seed, numero di regioni e di triangoli, tempo di caricamento, durata dell'ultima ricostruzione di una regione.
- **Dopo:** a `[manuale]` Come prima, più: nome del file del mondo, numero di strutture per tipo, numero di avvisi.
- **Motivo:** serve a capire cosa è stato caricato mentre si modifica il YAML.

## Requisiti RIMOSSI
Nessuno.

## Domande risolte
Chiuse con l'utente il 2026-09-26, prima di G1. Tutte le proposte sono state accettate.

| # | Domanda | Decisione | Effetto sulla spec |
|---|---|---|---|
| Q1 | Unità delle coordinate nel YAML | Blocchi, come le API del core | YAML-004.a invariato |
| Q2 | Dove stanno i file del mondo | Cartella `worlds/` del progetto, predefinito `worlds/default.yaml`, altri con `?world=`; nessun file dal disco dell'utente | YAML-006 invariato |
| Q3 | `?seed=` nell'indirizzo | Resta, sostituisce il seed del file con un avviso | APP-001 modificato come proposto |
| Q4 | Sovrapposizione di strutture posate singolarmente | Avviso; prevale la struttura dichiarata dopo | STRUCT-004.a invariato |
| Q5 | Foglie | Opache, chiome dal contorno irregolare; da rivedere in F06 | Nessun blocco trasparente oltre all'acqua |
| Q6 | Distribuzioni su un'area in F02 | Sì | YAML-005 invariato |
| Q7 | Ricaricamento a caldo | Rigenerazione completa entro 5 s | YAML-007.a invariato |
| Q8 | Specie e stili | Quercia, betulla, salice; casolare in pietra e capanno in legno; in più dettagli di carattere: travi a vista, comignolo, basamento in pietra per il capanno | Nuovo criterio STRUCT-006.e (il vecchio e diventa f) |

## Registro emendamenti
| ID | Data | Requisito | Modifica | Motivo | Approvato |
|---|---|---|---|---|---|
