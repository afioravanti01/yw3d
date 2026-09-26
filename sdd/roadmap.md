# Roadmap

> Le fasi future sono **indicative**. La spec di una fase si scrive quando la precedente è chiusa, così incorpora ciò che si è imparato. Questo file cambia nel tempo; la sua storia è in git.

| Fase | Nome | Stato | Dipende da |
|---|---|---|---|
| F01 | Fondamenta e mondo voxel | `done` (G3, 2026-09-26) | — |
| F02 | Mondo da YAML e strutture programmabili | `verifying` | F01 |
| F03 | Fisica e giocatore | planned | F01, F02 |
| F04 | Personaggi animati e comportamenti programmati | planned | F02, F03 |
| F05 | Personaggi AI e interazione | planned | F04 |
| F06 | Natura viva | planned | F02 |

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

## F04 — Personaggi animati e comportamenti programmati
**Obiettivo:** personaggi a voxel animati che si muovono nel mondo tramite la fisica di F03, guidati da script scritti dall'utente.
- Modello a voxel con parti articolate e animazioni procedurali: fermo, camminata, salto, parlata.
- Navigazione: ricerca del percorso sulla griglia voxel (gradini, porte, acqua).
- API dei comportamenti (`defineBehavior`) con primitive asincrone: `walkTo`, `lookAt`, `wait`, `say`, `follow`.
- Sezione `characters` del YAML con `control: script`.
- Interazione di base: mi avvicino, premo un tasto, il personaggio reagisce secondo lo script.

**Demo:** un personaggio fa il giro del villaggio evitando le case, si ferma al laghetto e mi saluta quando mi avvicino.
**Aree:** CHAR, NAV, BEHAV, YAML (modificati).

## F05 — Personaggi AI e interazione
**Obiettivo:** personaggi guidati da un modello AI con cui dialogare liberamente.
- `control: ai` nel YAML, con persona, obiettivi e luogo di riferimento.
- Architettura "cervello e corpo": il modello (Claude, tramite backend Node) riceve una percezione sintetica (dove sono, cosa vedo, chi mi parla, cosa ricordo) e risponde chiamando **strumenti** che corrispondono alle primitive di F04 (`walk_to`, `say`, `look_at`, `follow`, `wait`). Il corpo li esegue con navigazione e fisica: il modello non può violare la fisica per costruzione (P3).
- Dialogo libero con il giocatore, memoria per personaggio.
- Budget di costo e latenza, limiti di frequenza, comportamento di ripiego se il modello non è raggiungibile.

**Demo:** chiedo a un pescatore dove si pesca meglio, mi risponde e mi accompagna al laghetto.
**Aree:** AI, UI, BEHAV (modificati).

## F06 — Natura viva
Ciclo giorno/notte, vento su foglie ed erba, acqua animata, particelle (polline, lucciole), audio ambientale.
**Aree:** RENDER, AUDIO, WORLD.

## Idee in attesa (non pianificate)
- Blocchi non cubici (rampe, cunei) per tetti e terreno più morbido.
- Modifica dei blocchi in gioco e salvataggio dello stato.
- Altre strutture: ponti, recinti, mulini, sentieri.
- Personaggi AI che conversano tra loro.
- Generazione in un Web Worker e mondi più grandi.

## Anteprima del YAML (non normativa)

Solo per dare un'idea della direzione; lo schema vero lo definiranno le spec di F02, F04 e F05.

```yaml
version: 1
world:
  name: Valle dei Salici
  seed: 1234
  size: [512, 96, 512]          # blocchi (x, y, z) = 256 m × 48 m × 256 m
  terrain: { preset: rolling-hills }

objects:
  - type: tree
    species: oak
    at: [64, 80]                # (x, z); y dal terreno
  - type: house
    id: casa-marta
    style: stone-cottage
    at: [120, 100]
    facing: south
  - type: pond
    id: laghetto
    at: [150, 60]
    radius: 7

characters:
  - id: guardiano
    control: script
    behavior: ./behaviors/patrol.ts
  - id: marta
    control: ai
    home: casa-marta
    persona: >
      Anziana pescatrice del villaggio, conosce ogni albero della valle
      e diffida dei forestieri finché non le si parla del laghetto.
```
