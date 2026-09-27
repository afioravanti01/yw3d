# File del mondo

Ogni file `*.yaml` di questa cartella descrive lo stato iniziale di un mondo. L'app carica `default.yaml`; un altro file si sceglie con `?world=<nome>` (senza estensione). Per controllare un file dal terminale: `npm run world:check -- worlds/<nome>.yaml`.

Coordinate in **blocchi** (1 blocco = 0,5 m); x verso est, z verso sud, y verso l'alto.

## Struttura

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `version` | sì | Versione dello schema del file. Oggi: `2`. Un file in versione `1` dà un errore che spiega cosa aggiungere. |
| `name` | sì | Nome del mondo, 1–60 caratteri: è il titolo della pagina. |
| `description` | no | Descrizione del mondo, al più 1000 caratteri. |
| `terrain.seed` | sì | Seed del terreno, intero tra 0 e 4294967295. `?seed=` nell'indirizzo lo sostituisce, con un avviso. |
| `terrain.generator` | sì | Versione del generatore di terreno per cui il file è scritto. Se diversa da quella in uso, il mondo si genera comunque e compare un avviso. |
| `terrain.size` | no | `[x, y, z]` in blocchi, multipli di 32. Default `[512, 96, 512]`. |
| `player` | no | Partenza del giocatore: `at: [x, z]` e `yaw` in gradi (0 = nord, 90 = est); `name` (per default «viandante»), `description` e `appearance` facoltativi. Senza, il giocatore parte dal centro del mondo. |
| `places` | no | Luoghi con nome: punti o aree che non sono strutture. |
| `structures` | no | Strutture posate una per una. |
| `scatter` | no | Strutture distribuite su un'area. |
| `characters` | no | Personaggi (vedi sotto). |
| `behaviors` | no | Libreria di comportamenti, usabili da più personaggi (vedi [docs/comportamenti.md](../docs/comportamenti.md)). |

Ogni struttura, distribuzione, luogo e personaggio ha un **nome** (`name`, 1–60 caratteri, obbligatorio) e una **descrizione** (`description`, al più 1000 caratteri, facoltativa). Personaggi, luoghi, strutture e distribuzioni condividono gli **id**: lettere minuscole, cifre, `_` e `-`, al più 32 caratteri, mai ripetuti.

### Una struttura (`structures`)

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `type` | sì | Tipo registrato: `oak`, `birch`, `willow`, `stone_farmhouse`, `wooden_hut`, `pond`. |
| `name` | sì | Nome della struttura, es. `Casa del fabbro`. |
| `id` | no | Identificatore, per riferirsi alla struttura. |
| `description` | no | Descrizione. |
| `at` | sì | `[x, z]` del punto di ancoraggio. |
| `y` | no | Quota esplicita; senza, la struttura si appoggia alla superficie del terreno. |
| `rotation` | no | `0`, `90`, `180` o `270` gradi. Default `0`. |
| `seed` | no | Fissa l'aspetto della struttura; senza, deriva da seed del mondo e posizione. |
| `params` | no | Parametri del tipo; quelli omessi prendono il default. |

### Una distribuzione (`scatter`)

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `name` | sì | Nome del gruppo, es. `Bosco di levante`. |
| `id` | no | Identificatore, per riferirsi all'area. |
| `description` | no | Descrizione. |
| `types` | sì | Tipi con i loro pesi, es. `{ oak: 3, birch: 2 }`. |
| `area` | sì | `{ rect: { from: [x, z], to: [x, z] } }` oppure `{ circle: { center: [x, z], radius: r } }`. |
| `density` | uno dei due | Strutture per 100 m². |
| `count` | uno dei due | Numero di strutture. |
| `minDistance` | sì | Distanza minima tra due strutture, in blocchi. |
| `seed` | no | Fissa le posizioni; senza, derivano da seed del mondo e ordine della distribuzione. |

Le posizioni in conflitto con altre strutture o con l'acqua vengono scartate.

### Un luogo (`places`)

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `id` | sì | Identificatore del luogo. |
| `name` | sì | Nome, es. `Piazza del borgo`. |
| `description` | no | Descrizione. |
| `at` | uno dei due | `[x, z]`: un punto. |
| `area` | uno dei due | Un'area, come per le distribuzioni: rettangolo o cerchio. |

I luoghi non cambiano il mondo: danno un nome a un punto o a una zona.

### Un personaggio (`characters`)

| Campo | Obbligatorio | Descrizione |
|---|---|---|
| `id` | sì | Identificatore del personaggio. |
| `name` | sì | Nome, es. `Tobia`. |
| `description` | no | Descrizione. |
| `at` | sì | `[x, z]` della partenza. |
| `yaw` | no | Orientamento in gradi (0 = nord, 90 = est). |
| `appearance` | no | Colori: `skin`, `hair`, `shirt`, `trousers`, come `'#a55f3a'`. |
| `behavior` | no | Cosa fa, in YAML: vedi [docs/comportamenti.md](../docs/comportamenti.md). |
| `controller` | no | In alternativa al comportamento: `{ command: … }`, un programma della cartella (vedi [docs/controllori.md](../docs/controllori.md)). |

Senza comportamento né controllore il personaggio sta fermo.

## Esempio

```yaml
version: 2
name: Valle del mulino
description: Un casolare, un laghetto e un bosco a sud.
terrain:
  seed: 1
  generator: 1
player:
  at: [150, 60]
  yaw: 180
places:
  - id: piazza
    name: Piazza
    at: [240, 280]
structures:
  - type: stone_farmhouse
    id: casolare
    name: Casolare del mulino
    at: [256, 300]
    rotation: 90
    params: { width: 14, depth: 10 }
  - type: pond
    id: laghetto
    name: Laghetto del mulino
    at: [200, 240]
scatter:
  - name: Bosco del sud
    types: { oak: 3, birch: 2 }
    area: { circle: { center: [120, 380], radius: 60 } }
    density: 0.8
    minDistance: 7
```
