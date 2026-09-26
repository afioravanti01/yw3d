# yw3d
Yaml World in 3D

Mondo 3D a blocchi immerso nella natura, descritto da un file YAML e abitato da personaggi guidati da programmi in qualunque linguaggio o da agenti LLM, nel rispetto della fisica del mondo.

È anche un **esperimento di Spec-Driven Development**: ogni fase ha una spec, un piano con i task e una retrospettiva con metriche, per capire se l'SDD scala su un progetto che cresce.

| Documento | Contenuto |
|---|---|
| [sdd/constitution.md](sdd/constitution.md) | principi e stack |
| [sdd/process.md](sdd/process.md) | come si lavora: fasi, gate, convenzioni |
| [sdd/roadmap.md](sdd/roadmap.md) | fasi e stato |
| [sdd/phases/](sdd/phases/) | spec, piano e retro di ogni fase |
| [sdd/specs/](sdd/specs/) | spec vive: come si comporta il sistema oggi |
| [sdd/decisions.md](sdd/decisions.md) | registro delle decisioni |
| [sdd/experiment.md](sdd/experiment.md) | ipotesi e metriche dell'esperimento |

## Usare yw3d

Requisiti: Node.js 20 o successivo.

```sh
npm install
npm link          # rende disponibile il comando yw3d in ogni cartella
```

Se `npm link` fallisce per i permessi (la cartella globale di npm è di sistema, ad esempio `/usr/local`), si può usare `sudo npm link`, oppure spostare i pacchetti globali nella propria home una volta per tutte: `npm config set prefix ~/.npm-global` e aggiungere `~/.npm-global/bin` al `PATH`. Senza installarlo, il comando si lancia anche con `node <progetto>/bin/yw3d.js`.

Un mondo è una cartella con un file `world.yaml` (formato in [worlds/README.md](worlds/README.md)) e, facoltativa, una sottocartella `structures/` con strutture scritte in TypeScript:

```sh
yw3d valle/            # valida world.yaml, avvia l'host e apre il browser
yw3d valle/ --no-open  # senza aprire il browser
yw3d --help            # tutte le opzioni
```

Salvando `world.yaml` o una struttura il mondo si aggiorna nel browser. Chiudendo il browser l'host continua a girare; riaprendo l'indirizzo si ritrova il giocatore dov'era. Una struttura dell'autore importa da `yw3d`:

```ts
import { COBBLESTONE, defineStructure, int, object } from 'yw3d';

export default defineStructure({
  name: 'tower',
  params: object({ height: int({ min: 6, max: 20, default: 12 }) }),
  terrain: 'sit',
  footprint: () => ({ minX: -2, minZ: -2, maxX: 2, maxZ: 2 }),
  generate({ params, builder }) {
    builder.fill(-2, 0, -2, 2, params.height, 2, COBBLESTONE);
  },
});
```

I personaggi si dichiarano nel `world.yaml` e si guidano con programmi in qualunque linguaggio, lanciati dall'host o collegati via WebSocket: il protocollo è in [docs/controllori.md](docs/controllori.md). Un esempio completo, con un controllore in Python e uno in JavaScript, è in [examples/valle/](examples/valle/):

```sh
yw3d examples/valle
```

Senza host, `npm run dev` apre l'app da sola con i mondi del progetto (`?world=`).

**Stato:** vedi [sdd/roadmap.md](sdd/roadmap.md).
