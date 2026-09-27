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
| F09 | Natura viva | planned | F02 |

La struttura da F04 in poi è stata rivista dopo la chiusura di F03 con la decisione D-008 (host headless e controllori esterni in qualunque linguaggio). Dopo la chiusura di F05, D-009 ha inserito F06 (comportamenti, mappa e dialogo) come prerequisito degli agenti LLM. Dopo l'uso di F06, D-010 ha sostituito il linguaggio dei comportamenti con programmi in Python e il dialogo con una console dei messaggi (F07); gli agenti LLM passano a F08, la natura viva a F09.

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

## F09 — Natura viva
Ciclo giorno/notte, vento su foglie ed erba, acqua animata, particelle (polline, lucciole), audio ambientale.

**Note per la spec** (da F06, 2026-09-26): un orologio del mondo con l'ora del giorno, a disposizione dei programmi dei personaggi.
**Aree:** RENDER, AUDIO, WORLD.

## Idee in attesa (non pianificate)
- Blocchi non cubici (rampe, cunei) per tetti e terreno più morbido.
- Modifica dei blocchi in gioco e salvataggio dello stato.
- Altre strutture: ponti, recinti, mulini, sentieri.
- Personaggi che conversano tra loro.
- Comandi di programmazione nella console dei messaggi (D-010).
- Interazione senza browser (D-008): console di comandi dell'host oltre al dialogo di F06, mappa testuale nel terminale, screenshot su richiesta, riproduzione delle sessioni registrate.
- Apertura di una cartella del mondo direttamente dal browser, senza host (trascinamento o selettore di file).
- Pubblicazione del comando `yw3d` su npm.
- Generazione in un Web Worker e mondi più grandi.

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
