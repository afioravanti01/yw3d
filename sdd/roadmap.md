# Roadmap

> Le fasi future sono **indicative**. La spec di una fase si scrive quando la precedente è chiusa, così incorpora ciò che si è imparato. Questo file cambia nel tempo; la sua storia è in git.

| Fase | Nome | Stato | Dipende da |
|---|---|---|---|
| F01 | Fondamenta e mondo voxel | `done` (G3, 2026-09-26) | — |
| F02 | Mondo da YAML e strutture programmabili | `done` (G3, 2026-09-26) | F01 |
| F03 | Fisica e giocatore | `done` (G3, 2026-09-26) | F01, F02 |
| F04 | Host e riga di comando | `planning` | F03 |
| F05 | Personaggi e protocollo dei controllori | planned | F04 |
| F06 | Agenti LLM | planned | F05 |
| F07 | Natura viva | planned | F02 |

La struttura da F04 in poi è stata rivista dopo la chiusura di F03 con la decisione D-008 (host headless e controllori esterni in qualunque linguaggio).

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

## F06 — Agenti LLM
**Obiettivo:** personaggi guidati da agenti LLM tramite le CLI disponibili sulla macchina dell'utente.
- Server MCP dell'host: le azioni di F05 come strumenti, la percezione come risorsa o come risposta agli strumenti.
- Controllori `agent` nel YAML: quale CLI usare (claude, codex, opencode, ollama…), persona, obiettivi, luogo di riferimento; avvio headless e verifica della configurazione.
- Architettura "cervello e corpo": l'agente decide, il corpo esegue con navigazione e fisica; nessun agente può violare la fisica (P3).
- Dialogo libero con il giocatore, memoria per personaggio.
- Budget di costo e latenza, limiti di frequenza, ripiego se l'agente non risponde. Valutazione di una modalità a turni per esperimenti riproducibili (D-008).

**Demo:** chiedo a una pescatrice guidata da un LLM dove si pesca meglio; mi risponde e mi accompagna al laghetto.
**Aree:** AGENT, MCP, UI, PROTO (modificati).

## F07 — Natura viva
Ciclo giorno/notte, vento su foglie ed erba, acqua animata, particelle (polline, lucciole), audio ambientale.
**Aree:** RENDER, AUDIO, WORLD.

## Idee in attesa (non pianificate)
- Blocchi non cubici (rampe, cunei) per tetti e terreno più morbido.
- Modifica dei blocchi in gioco e salvataggio dello stato.
- Altre strutture: ponti, recinti, mulini, sentieri.
- Personaggi AI che conversano tra loro.
- Interazione senza browser (D-008): console di comandi dell'host, mappa testuale nel terminale, screenshot su richiesta, riproduzione delle sessioni registrate.
- Apertura di una cartella del mondo direttamente dal browser, senza host (trascinamento o selettore di file).
- Pubblicazione del comando `yw3d` su npm.
- Generazione in un Web Worker e mondi più grandi.

## Anteprima del YAML (non normativa)

Solo per dare un'idea della direzione. Terreno e strutture sono già definiti (spec viva [world-file.md](specs/world-file.md)); personaggi e controllori li definiranno le spec di F05 e F06.

```yaml
version: 1
terrain:
  seed: 1234
  generator: 1

player:
  at: [158, 66]

structures:
  - type: stone_farmhouse
    at: [120, 100]
    rotation: 180
  - type: pond
    at: [196, 112]
    params: { radius: 10 }

characters:
  - id: guardiano
    at: [150, 70]
    controller:
      command: python guardiano.py      # any language, JSON lines on stdio
  - id: marta
    at: [196, 118]
    controller:
      agent: claude                     # or codex, opencode, ollama…
      persona: >
        Anziana pescatrice del villaggio, conosce ogni albero della valle
        e diffida dei forestieri finché non le si parla del laghetto.
```
