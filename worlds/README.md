# File del mondo

Ogni file `*.yaml` di questa cartella descrive lo stato iniziale di un mondo. L'app carica `default.yaml`; un altro file si sceglie con `?world=<nome>` (senza estensione). Per controllare un file dal terminale: `npm run world:check -- worlds/<nome>.yaml`.

Coordinate in **blocchi** (1 blocco = 0,5 m); x verso est, z verso sud, y verso l'alto.

## Struttura

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `version` | sì | Versione dello schema del file. Oggi: `1`. |
| `terrain.seed` | sì | Seed del terreno, intero tra 0 e 4294967295. `?seed=` nell'indirizzo lo sostituisce, con un avviso. |
| `terrain.generator` | sì | Versione del generatore di terreno per cui il file è scritto. Se diversa da quella in uso, il mondo si genera comunque e compare un avviso. |
| `terrain.size` | no | `[x, y, z]` in blocchi, multipli di 32. Default `[512, 96, 512]`. |
| `structures` | no | Strutture posate una per una. |
| `scatter` | no | Strutture distribuite su un'area. |

### Una struttura (`structures`)

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `type` | sì | Tipo registrato: `oak`, `birch`, `willow`, `stone_farmhouse`, `wooden_hut`, `pond`. |
| `at` | sì | `[x, z]` del punto di ancoraggio. |
| `y` | no | Quota esplicita; senza, la struttura si appoggia alla superficie del terreno. |
| `rotation` | no | `0`, `90`, `180` o `270` gradi. Default `0`. |
| `seed` | no | Fissa l'aspetto della struttura; senza, deriva da seed del mondo e posizione. |
| `params` | no | Parametri del tipo; quelli omessi prendono il default. |

### Una distribuzione (`scatter`)

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `types` | sì | Tipi con i loro pesi, es. `{ oak: 3, birch: 2 }`. |
| `area` | sì | `{ rect: { from: [x, z], to: [x, z] } }` oppure `{ circle: { center: [x, z], radius: r } }`. |
| `density` | uno dei due | Strutture per 100 m². |
| `count` | uno dei due | Numero di strutture. |
| `minDistance` | sì | Distanza minima tra due strutture, in blocchi. |
| `seed` | no | Fissa le posizioni; senza, derivano da seed del mondo e ordine della distribuzione. |

Le posizioni in conflitto con altre strutture o con l'acqua vengono scartate.

## Esempio

```yaml
version: 1
terrain:
  seed: 1
  generator: 1
structures:
  - type: stone_farmhouse
    at: [256, 300]
    rotation: 90
    params: { width: 14, depth: 10 }
  - type: pond
    at: [200, 240]
scatter:
  - types: { oak: 3, birch: 2 }
    area: { circle: { center: [120, 380], radius: 60 } }
    density: 0.8
    minDistance: 7
```
