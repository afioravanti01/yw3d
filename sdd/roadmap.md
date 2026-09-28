# Roadmap

> Le fasi future sono **indicative**. La spec di una fase si scrive quando la precedente è chiusa, così incorpora ciò che si è imparato. Questo file cambia nel tempo; la sua storia è in git.

| Fase | Nome | Stato | Dipende da |
|---|---|---|---|
| F01 | Fondamenta e mondo voxel | `done` (G3, 2026-09-26) | — |
| F02 | Mondo da YAML e strutture programmabili | `done` (G3, 2026-09-26) | F01 |
| F03 | Fisica e giocatore | `done` (G3, 2026-09-26) | F01, F02 |
| F04 | Host e riga di comando | `done` (G3, 2026-09-26) | F03 |
| F05 | Personaggi e protocollo dei controllori | `done` (G3, 2026-09-26) | F04 |
| F06 | Comportamenti, mappa e dialogo | `done` (G3, 2026-09-27) | F05 |
| F07 | Console dei messaggi e personaggi in Python | `done` (G3, 2026-09-27) | F06 |
| F08 | Agenti LLM | `done` (G3, 2026-09-27) | F07 |
| F09 | Natura viva: tempo e luce | `done` (G3, 2026-09-27) | F02 |
| F10 | Laboratorio: scenari, turni e misure | `planning` | F08, F09 |
| F11 | Controllare o programmare | planned | F10 |
| F12 | Oggetti dichiarativi | planned | F02 |

La struttura da F04 in poi è stata rivista dopo la chiusura di F03 con la decisione D-008 (host headless e controllori esterni in qualunque linguaggio). Dopo la chiusura di F05, D-009 ha inserito F06 (comportamenti, mappa e dialogo) come prerequisito degli agenti LLM. Dopo l'uso di F06, D-010 ha sostituito il linguaggio dei comportamenti con programmi in Python e il dialogo con una console dei messaggi (F07); gli agenti LLM passano a F08, la natura viva a F09. F09 si è ristretta al tempo e alla luce: vento e acqua sono stati tolti durante la fase, particelle e audio sono tra le idee in attesa.

Dopo la chiusura di F09, D-013 ha fatto della ricerca sugli agenti LLM il filone principale: prima gli strumenti comuni degli esperimenti (F10), poi gli esperimenti, con domande e ipotesi in [research.md](research.md); i mondi in YAML crescono al servizio della ricerca (F12), e la metodologia SDD diventa un documento formale.

## F01 — Fondamenta e mondo voxel
**Obiettivo:** un mondo a blocchi finito, generato in modo deterministico, con uno stile riconoscibilmente diverso da Minecraft, esplorabile con una camera libera. Fondamenta tecniche: separazione core/rendering, test headless, tracciabilità automatica.
**Demo di fine fase:** apro il browser, vedo una valle collinare e ci volo sopra.
**Aree:** ARCH, WORLD, RENDER, PERF, CAM, APP, DEBUG, SDD.

## F02 — Mondo da YAML e strutture programmabili
**Obiettivo:** lo stato iniziale del mondo è descritto da un YAML validato; alberi, case e laghetti sono strutture generate da codice registrato, parametrizzabili e posizionabili.
- Schema YAML versionato, errori con file, riga e campo.
- Registro delle strutture (`defineStructure`): tipo, schema dei parametri, generatore deterministico. Nuove strutture si aggiungono con un file TypeScript, senza toccare il core.
- Alberi: almeno 3 specie dalla silhouette distinta (es. quercia, betulla, salice piangente vicino all'acqua), con variazioni per seed.
- Case: almeno 2 stili (es. casolare in pietra, capanno in legno) con porta passabile, finestre, interno vuoto e tetto a falde.
- Laghetti: bacino scavato nel terreno, acqua statica (nuovo tipo di blocco non solido e trasparente), sponde in sabbia o ghiaia.
- Adattamento al terreno (le case livellano il suolo sotto di sé) e segnalazione dei conflitti tra strutture.
- Ricaricamento a caldo del YAML in sviluppo.

**Note per la spec** (emerse durante F01, 2026-09-26): il terreno è deterministico ma cambia quando cambia il generatore (es. T1.16+), quindi le posizioni nel YAML non devono dipendere dalla forma esatta del terreno.
- Il YAML dichiara il seed del terreno: il mondo di un file non dipende dall'URL.
- Le strutture si posizionano con x e z; per default la y è ricavata dalla superficie ("appoggiato a terra"), con y esplicita solo dove serve.
- Il YAML dichiara la versione del generatore; se non corrisponde a quella in uso compare un avviso.

**Demo:** modifico `world.yaml`, salvo, e il mondo si aggiorna.
**Aree:** YAML, STRUCT, WORLD (modificati), RENDER (acqua).

## F03 — Fisica e giocatore
**Obiettivo:** un unico sistema fisico per tutte le entità; il giocatore cammina nel mondo senza attraversare i blocchi solidi.
- Entità con volume (AABB), gravità, salto, collisione con i voxel, salita automatica di un gradino di 1 blocco.
- Acqua: rallentamento e galleggiamento.
- Giocatore in prima e terza persona; la camera libera di F01 resta come modalità debug.
- Passo di simulazione fisso, indipendente dal frame rate e deterministico.

**Demo:** entro in una casa dalla porta, non attraverso i muri, cado nel laghetto e nuoto.
**Aree:** PHYS, PLAYER.

**Note per la spec** (dalla chiusura di F02, 2026-09-26): primo task della fase: avviso di `sdd:trace` per i requisiti senza criteri riconosciuti (D-007).

## F04 — Host e riga di comando
**Obiettivo:** l'autore lavora in una propria cartella e avvia il mondo con un comando; la simulazione gira in un host headless e il browser si collega come vista (D-008).
- `yw3d <cartella>` (il mondo è sempre `world.yaml` della cartella): valida il YAML e stampa gli errori nel terminale, avvia l'host, serve l'app e apre il browser. Comando installabile con `npm link`.
- Cartella del mondo in qualunque posizione del disco: il YAML e, facoltative, strutture TypeScript dell'autore registrate all'avvio.
- Host: composizione del mondo e simulazione a passo fisso in Node, autorità sullo stato.
- Browser collegato via WebSocket: ricostruisce il mondo dallo stesso YAML, riceve lo stato delle entità, invia le intenzioni del giocatore. La modalità solo browser resta.
- Ricarica a caldo guidata dall'host: salvando il YAML il mondo si rigenera, errori nel terminale e nel pannello.
- Terminale dell'host: avvio, errori, client collegati.

**Demo:** da una cartella fuori dal progetto lancio `yw3d valle/`, il browser si apre sul mio mondo; modifico il YAML e il mondo cambia; chiudo il browser e l'host continua a girare, lo riapro e ritrovo il giocatore dov'era.
**Aree:** HOST, CLI, APP (modificati), YAML (modificati).

## F05 — Personaggi e protocollo dei controllori
**Obiettivo:** personaggi a blocchi animati, mossi dalla fisica di F03 e guidati da controllori in qualunque linguaggio.
- Personaggi: modello a blocchi con parti articolate e animazioni procedurali (fermo, camminata, salto, parlata). Sezione `characters` del YAML.
- Azioni di alto livello eseguite dall'host: `walk_to`, `look_at`, `say`, `follow`, `wait`; navigazione con ricerca del percorso sulla griglia (gradini, porte, acqua).
- Percezione: cosa vede e sente il personaggio (posizione, entità vicine, frasi rivolte a lui), in forma sintetica.
- Protocollo: modello di messaggi versionato; canali JSON a righe su stdio (processi lanciati dal YAML) e WebSocket (client esterni). Consenso dell'utente prima di lanciare i comandi, verifica che esistano, tempi limite e ripieghi per i controllori lenti o bloccati.
- Esempi di controllori in JavaScript e Python.
- Interazione di base: mi avvicino, premo un tasto, il personaggio riceve l'evento e reagisce.

**Demo:** un guardiano scritto in Python fa il giro del villaggio evitando le case, si ferma al laghetto e mi saluta quando mi avvicino.
**Aree:** CHAR, NAV, PROTO, YAML (modificati).

## F06 — Comportamenti, mappa e dialogo
**Obiettivo:** i personaggi si programmano nel file del mondo con un linguaggio dichiarativo in YAML; ogni elemento del mondo ha nome, descrizione e id, e la mappa è a disposizione dei personaggi; il giocatore parla con i personaggi. Sono i prerequisiti degli agenti LLM (D-009).
- Linguaggio dei comportamenti: routine, reazioni agli eventi, stati; flag e contatori; libreria con parametri; scritto nel personaggio o in file esterni. Gira nel core, anche in modalità solo browser, senza consenso.
- Nomi e descrizioni per mondo, strutture, distribuzioni, luoghi, personaggi e giocatore; luoghi con nome; schema del YAML alla versione 2.
- Mappa del mondo per comportamenti e controllori; mete per id (`walk_to: laghetto1`) con punto d'arrivo per tipo di struttura.
- Dialogo: il giocatore scrive dal browser, dal terminale dell'host o da un client esterno; registro delle conversazioni; domande dei personaggi con risposte capite in modo deterministico.

**Demo:** un personaggio mi chiede «Dove devo andare?», scrivo «laghetto1» e lui va sulla sponda del laghetto.
**Aree:** BEHAV, MAP, DIALOG (nuove); YAML, CHAR, PROTO, STRUCT, HOST, DEBUG (modificati).

## F07 — Console dei messaggi e personaggi in Python
**Obiettivo:** il giocatore interagisce con i personaggi da una console dei messaggi, e gli autori programmano i personaggi in Python con una libreria che fa da template (D-010).
- Console trasparente sulla destra di ogni vista con tutti i messaggi del mondo; `@nome testo` scrive a un personaggio vicino (D-011: a qualunque distanza in D-010), senza `@` si parla ad alta voce entro 16 blocchi. Punto unico dell'interazione, con i primi comandi (`/help`, `/world`).
- Libreria Python `yw3d` (solo libreria standard): una classe per personaggio con routine e gestori di messaggi ed eventi, azioni da attendere, mappa e percezione. Template leggibile e documentato.
- Programmi Python nella cartella del mondo, lanciati dall'host con il consenso ricordato per cartella.
- Rimozione del linguaggio dei comportamenti in YAML (requisiti BEHAV, guida, esempi); esempi rifatti in Python.

**Demo:** scrivo `@tobia dove vai?` dalla console senza cercarlo nel mondo; Tobia, programmato in Python in poche righe leggibili, mi risponde e va dove gli dico.
**Aree:** DIALOG, CHAR, PROTO, YAML (modificati), PY (nuova); BEHAV (rimossa).

## F08 — Agenti LLM
**Obiettivo:** personaggi guidati da agenti LLM configurati solo nel file del mondo, senza Python, che conoscono il mondo e parlano con il giocatore (D-012).
- Agente nell'host, dichiarato nel `world.yaml` (`agent:`), in modalità `headless` (Claude Code, Codex, opencode; modello ed effort facoltativi) o `api` (Anthropic, compatibile OpenAI; chiave in una variabile d'ambiente).
- "Cervello e corpo": l'LLM riceve il contesto del mondo e risponde in forma strutturata (cosa dire, a chi, quali azioni); l'host la esegue con le azioni dei personaggi, nel rispetto della fisica (P3).
- Conoscenza del mondo: mappa con coordinate, personaggi, dintorni («Cosa vedi?»); prima il mondo, poi le conoscenze generali.
- Iniziativa configurabile (solo reattivo o anche autonomo), memoria per personaggio, tempo limite e ripiego, limiti di frequenza.

**Note per la spec:** se un agente può scrivere o modificare il programma Python del suo personaggio; una modalità a turni per esperimenti riproducibili; un server MCP per agenti esterni (fuori da F08, D-012).

**Demo:** chiedo a una pescatrice guidata da un LLM dove si pesca meglio; mi risponde e mi accompagna al laghetto.
**Aree:** AGENT (nuova); CHAR, PROTO, HOST, DEBUG, YAML (modificati).

## F09 — Natura viva: tempo e luce
**Obiettivo:** il mondo ha un'ora del giorno che scorre, con il sole che attraversa il cielo, una notte leggibile con la luna, le stelle e le finestre accese, e l'alba; agenti e programmi conoscono l'ora.
- Orologio del mondo nel file (`time`), unico con l'host; `/time` per portare il mondo a un'ora.
- Luce, cielo, nebbia e ombre che seguono l'ora; ombre che cambiano direzione ogni decimo del giorno (A9.2).
- Ora e parte del giorno nella percezione, nella libreria Python e nel contesto degli agenti.
- La scimmietta (`body: monkey`), primo animale, guidata da un agente autonomo (A9.1).

Vento sulle foglie e acqua animata erano previsti e sono stati tolti durante la fase (A9.3, A9.4); particelle e audio ambientale restano tra le idee in attesa.
**Demo:** porto il mondo alle 19:00 con `/time`, guardo il tramonto e la notte con le finestre accese; la scimmietta gira da sola per il borgo.
**Aree:** TIME (nuova); RENDER, CHAR, YAML, PROTO, PY, AGENT, DIALOG, DEBUG, PERF (modificati).

## F10 — Laboratorio: scenari, turni e misure
**Obiettivo:** gli strumenti comuni a tutti gli esperimenti sugli agenti, così che un risultato si possa ripetere, confrontare e rivedere (D-013).
- Tempo a turni: la simulazione avanza a passi e aspetta la risposta degli agenti; il tempo reale resta la modalità normale.
- Scenari nel file del mondo: l'obiettivo detto all'agente, un verificatore che l'agente non vede (successo, fallimento, tempo limite), perturbazioni a tempo (una meta che si sposta, un passaggio bloccato, un personaggio che cambia stato).
- Tracciato di ogni esecuzione: contesto inviato, risposta, azioni, esiti, token, costo e latenza, in un formato che permetta di rivedere l'esecuzione.
- Esecuzione in serie da riga di comando: uno scenario, uno o più cervelli, N esecuzioni; un rapporto con esito, passi, costo, latenza e variabilità.
- Istruzioni agli agenti versionate e riportate nel rapporto.
- Budget di costo dichiarato per ogni serie, con arresto al superamento.

**Note per la spec:** conciliare il tempo a turni con P10 (costituzione alla v1.5); il cervello finto come riferimento a costo zero per provare ogni scenario; primi scenari di esempio (commissione in più passi, domanda sul mondo con risposta verificabile, compito in due).
**Demo:** lancio 5 esecuzioni di uno scenario con due modelli e leggo nel rapporto chi ha raggiunto l'obiettivo, in quanti passi e con quale costo; riapro un'esecuzione e ne rivedo i passi.
**Aree:** LAB (nuova); AGENT, HOST, CLI, YAML, TIME (modificati).

## F11 — Controllare o programmare
**Obiettivo:** il primo esperimento di [research.md](research.md) (R1): sullo stesso corpo e negli stessi scenari, confrontare un LLM che guida il personaggio passo per passo, un LLM che scrive il programma Python del personaggio, e un ibrido in cui il programma richiama l'LLM quando qualcosa non va come previsto.
- Modalità «autore»: l'LLM scrive o riscrive il programma del suo personaggio, che l'host valida e avvia con le regole dei programmi (PY).
- Escalation: un programma può chiedere aiuto al suo LLM con il contesto dell'imprevisto, e ricevere una decisione o un programma nuovo.
- Scenari con perturbazioni, eseguiti in serie con F10; risultati e analisi nel diario di research.md.

**Demo:** il rapporto confronta le tre modalità su tre scenari: successo, costo, latenza e tenuta agli imprevisti.
**Aree:** AGENT, PY, LAB (modificati).

## F12 — Oggetti dichiarativi
**Obiettivo:** nuovi oggetti descritti nel YAML come composizione di forme semplici, senza TypeScript (D-013).
- Forme: parallelepipedo, cilindro, sfera o cupola, piramide, tetto a falde; posizione, dimensioni, blocco, cave o piene.
- Sottrazione (porte, finestre, cavità), ripetizione, simmetria, riuso di un oggetto dentro un altro, parametri semplici con valore predefinito.
- Gli oggetti si posizionano come le strutture e compaiono nella mappa dei personaggi con nome, descrizione e punto d'arrivo.
- Errori con file, riga e campo (P4); niente condizioni né cicli oltre la ripetizione.

**Note per la spec:** criteri `[manuale]` sulla comodità di scrittura (un pozzo, una panchina, una fontana in poche righe) e prova d'uso presto (process.md); misurare quanto spesso un LLM scrive un oggetto valido, come primo dato per R5.
**Demo:** scrivo un pozzo nel `world.yaml`, salvo, e compare nella piazza; un agente sa dove si trova.
**Aree:** YAML, STRUCT, MAP (modificati).

## Fasi successive (indicative)
L'ordine segue le domande di [research.md](research.md); ogni fase di ricerca usa il laboratorio di F10.
- **Percezione a richiesta e osservabilità parziale** (R2): un riassunto breve più strumenti per guardare, descrivere e ricordare; l'agente sa solo ciò che ha visto; eventualmente la propria visuale come immagine.
- **Memoria tra episodi** (R3): osservazioni salvate in SQLite, recupero e riflessione, memoria individuale o condivisa.
- **Socialità e vita spontanea** (R4): stato interno dei personaggi visibile all'osservatore e non agli altri agenti; sessioni lunghe con iniziativa autonoma e modelli economici o locali.
- **LLM che costruiscono** (R5): mondi e oggetti scritti da un LLM; poi modifica dei blocchi durante la simulazione.
- **Il mondo si allarga:** forma del terreno scelta nel file (colline, pianura, montagna, isola…); nuovi oggetti, elementi della natura, animali ed elementi architettonici, ognuno con qualcosa che un personaggio può farci (D-013).

Fuori dalle fasi: **metodologia SDD**, un documento formale con il metodo seguito in yw3d e le lezioni con i dati di [experiment.md](experiment.md).

## Idee in attesa (non pianificate)
- Blocchi non cubici (rampe, cunei) per tetti e terreno più morbido.
- Salvataggio dello stato del mondo.
- Altre strutture: ponti, recinti, mulini, sentieri (con F12 anche come oggetti dichiarativi).
- Comandi di programmazione nella console dei messaggi (D-010).
- Interazione senza browser (D-008): console di comandi dell'host oltre al dialogo di F06, mappa testuale nel terminale, screenshot su richiesta, riproduzione delle sessioni registrate.
- Apertura di una cartella del mondo direttamente dal browser, senza host (trascinamento o selettore di file).
- Pubblicazione del comando `yw3d` su npm.
- Generazione in un Web Worker e mondi più grandi.
- Natura viva, seguito di F09: particelle (polline, lucciole) e audio ambientale.

## Anteprima del YAML (non normativa)

Solo per dare un'idea della direzione. Terreno, strutture e personaggi con controllori sono definiti nelle spec vive ([world-file.md](specs/world-file.md), [characters.md](specs/characters.md)); nomi e luoghi la spec di F06; i programmi Python li definirà la spec di F07, gli agenti quella di F08.

```yaml
version: 2
name: Valle del Mulino
description: Una valle con un piccolo borgo, un bosco misto e un laghetto.
terrain:
  seed: 1234
  generator: 1

player:
  at: [158, 66]

places:
  - id: piazza
    name: Piazza del borgo
    at: [158, 66]

structures:
  - type: stone_farmhouse
    id: casa_fabbro
    name: Casa del fabbro
    at: [120, 100]
    rotation: 180
  - type: pond
    id: laghetto1
    name: Laghetto del mulino
    at: [196, 112]
    params: { radius: 10 }

characters:
  - id: tobia
    name: Tobia
    description: Garzone del fabbro, sempre in cerca di commissioni.
    at: [150, 70]
    program: characters/tobia.py        # F07: Python with the yw3d library
  - id: guardiano
    name: Il guardiano
    at: [160, 70]
    controller:
      command: python guardiano.py      # any language, JSON lines on stdio
  - id: marta
    name: Marta
    at: [196, 118]
    controller:
      agent: claude                     # F08: or codex, opencode, ollama…
      persona: >
        Anziana pescatrice del villaggio, conosce ogni albero della valle
        e diffida dei forestieri finché non le si parla del laghetto.
```
