# Controllori dei personaggi

Un **controllore** è un programma che guida un personaggio: riceve quello che il personaggio percepisce e chiede azioni. Si scrive in qualunque linguaggio: basta leggere e scrivere righe di testo in JSON. Questa guida descrive il protocollo, versione 3. Per scrivere personaggi in Python c'è una libreria che parla il protocollo al posto tuo (vedi [python.md](python.md)); questa guida serve per gli altri linguaggi e per capire cosa succede sotto. In fondo c'è lo scheletro di un controllore senza libreria; i personaggi d'esempio, in [examples/valle/characters](../examples/valle/characters), usano la libreria Python.

## Collegare un controllore

**Lanciato dall'host.** Nel `world.yaml` il personaggio dichiara il comando, eseguito nella cartella del mondo:

```yaml
characters:
  - id: guardiano
    name: Bruno
    at: [160, 70]
    controller: { command: python3 controllers/guardiano.py }
```

L'host scrive un messaggio per riga sullo **stdin** del programma e legge un messaggio per riga dal suo **stdout**. Quello che il programma scrive sullo **stderr** compare nel terminale di yw3d, preceduto dal nome del personaggio: è il posto per i messaggi di debug.

La prima volta che una cartella vuole lanciare dei comandi, yw3d li elenca e chiede il permesso; il permesso si ricorda finché i comandi non cambiano. `yw3d <cartella> --allow-commands` li lancia senza chiedere. Salvando `world.yaml` i controllori ripartono.

**Da fuori, via WebSocket.** Un client si collega a `ws://localhost:5180/controller` e come primo messaggio chiede un personaggio che non ha già un controllore:

```json
{ "type": "control", "character": "guardiano" }
```

Da lì in poi i messaggi sono gli stessi di stdio, uno per frame. Il client può prendere anche un personaggio guidato da un **programma** della cartella del mondo: il programma riceve `{ "type": "paused" }` e, finché il client guida, le sue azioni falliscono con la causa `paused`; quando il client si scollega il programma riceve `{ "type": "resumed" }` e torna a guidare. Un personaggio con un `controller` invece non si può prendere.

## Messaggi dall'host

Il primo messaggio è il saluto:

```json
{
  "type": "hello",
  "version": 3,
  "character": { "id": "guardiano", "name": "Bruno", "description": null },
  "world": { "size": [512, 96, 512] },
  "map": { "name": "La valle", "description": "…", "size": [512, 96, 512], "entries": ["…"] }
}
```

La **mappa** elenca ogni elemento del mondo con `id`, `kind` (`place`, `structure`, `scatter`, `character`, `player`), `name`, `description` e `shape`: un punto (`{ "kind": "point", "x", "z" }`), un rettangolo (`{ "kind": "rect", "from": [x, z], "to": [x, z] }`, `to` escluso) o un cerchio (`{ "kind": "circle", "center", "radius" }`). Le strutture hanno anche `type` e `base_y` (la quota della base), le distribuzioni `types`. Per i personaggi e il giocatore la forma è il punto di partenza: dove sono adesso lo dice la percezione. Le strutture senza `id` nel file ne hanno uno generato, come `pond#1`.

```json
{ "id": "laghetto1", "kind": "structure", "type": "pond", "name": "Laghetto del borgo", "description": null,
  "shape": { "kind": "rect", "from": [180, 96], "to": [212, 128] }, "base_y": 32 }
```

Quando il mondo si ricarica, i client sul WebSocket ricevono la mappa nuova: `{ "type": "map", "map": { … } }`. I programmi lanciati dall'host invece ripartono e ricevono un nuovo `hello`.

Poi, **4 volte al secondo**, la percezione:

```json
{
  "type": "perception",
  "time": 12.5,
  "self": { "x": 158.5, "y": 34, "z": 66.5, "yaw": 0, "on_ground": true, "in_water": false },
  "action": { "id": "walk-3", "kind": "walk_to" },
  "nearby": [
    { "id": "player", "name": "viandante", "kind": "player", "x": 162.1, "y": 34, "z": 70.4, "distance": 5.4 }
  ]
}
```

- `time`: secondi di simulazione dall'avvio del mondo.
- `nearby`: entità entro 32 blocchi (16 m), dalla più vicina; `kind` è `player` o `character`.
- Se il programma legge più lentamente, riceve solo l'ultima percezione, non un arretrato.

E subito, quando succedono, gli **eventi**:

| Messaggio | Quando |
|---|---|
| `{ "type": "heard", "from": "player", "text": "…", "distance": 6, "to": "guardiano", "mentions": "laghetto1", "yes_no": null }` | qualcuno ha detto qualcosa entro 16 blocchi: un personaggio o il giocatore; `to` è a chi l'ha detto (o `null`), `mentions` l'elemento della mappa che la frase nomina, se ne nomina uno solo (o `null`), `yes_no` è `"yes"` o `"no"` se la frase è un sì o un no (o `null`) |
| `{ "type": "interacted", "by": "player" }` | il giocatore, entro 3 m, ha premuto E |
| `{ "type": "action_done", "id": "walk-3" }` | l'azione è finita |
| `{ "type": "action_failed", "id": "walk-3", "reason": "…" }` | l'azione non è riuscita, con la causa |
| `{ "type": "action_replaced", "id": "walk-3" }` | un'azione nuova ha preso il suo posto |
| `{ "type": "paused" }`, `{ "type": "resumed" }` | un client sul WebSocket ha preso il personaggio di questo programma, o l'ha lasciato |
| `{ "type": "error", "message": "…" }` | un messaggio del controllore non era valido |

## Azioni

Ogni azione ha un `id` scelto dal controllore, che ritorna nel suo esito. Un personaggio fa **un'azione alla volta**: una nuova sostituisce quella in corso. Coordinate in blocchi (1 blocco = 0,5 m), velocità in m/s.

| Azione | Campi | Finisce |
|---|---|---|
| `walk_to` | `x`, `z` oppure `target` (un id della mappa, o `player`); `speed` facoltativa, 0,5–7 m/s, predefinita 1,5 | all'arrivo, entro 1 blocco |
| `look_at` | `x`, `z` oppure `target` (un id della mappa; un elemento esteso si guarda al centro) | subito |
| `say` | `text`, 1–500 caratteri; `to` facoltativo, un personaggio o `player` entro 16 blocchi, altrimenti fallisce | dopo 1 s + 0,06 s per carattere |
| `follow` | `target` (un personaggio o `player`); `distance` 1–32 blocchi, predefinita 3; `speed` | mai: finché non la sostituisci |
| `wait` | `seconds`, 0–3600 | dopo i secondi indicati |
| `stop` | — | subito, fermando l'azione in corso |

Esempi:

```json
{ "type": "walk_to", "id": "w1", "x": 182, "z": 104, "speed": 1.3 }
{ "type": "say", "id": "s1", "text": "Buongiorno!" }
{ "type": "follow", "id": "f1", "target": "player", "distance": 4 }
```

```json
{ "type": "walk_to", "id": "w2", "target": "laghetto1" }
```

Verso un elemento della mappa il personaggio arriva dove ha senso: davanti alla porta di una casa, sulla sponda di un laghetto più vicina lungo la strada, ai piedi di un albero, dentro un'area (se c'è già, `walk_to` è subito finito). Il personaggio trova da solo la strada: sale i gradini di un blocco, scende fino a tre, passa dalle porte e nuota solo se il giro all'asciutto è più lungo del doppio. Se resta bloccato ricalcola la strada; dopo tre tentativi `walk_to` fallisce. Ogni `walk_to` ha anche un tempo limite, il doppio del tempo previsto più 5 s.

## Parlare come il giocatore

Un client sul WebSocket può parlare **come il giocatore** invece di guidare un personaggio: un bot di prova, un'altra interfaccia. Il primo messaggio è `{ "type": "player" }`; l'host risponde con un saluto che contiene il nome del giocatore e la mappa:

```json
{ "type": "hello", "version": 3, "player": { "id": "player", "name": "viandante" }, "world": { "size": [512, 96, 512] }, "map": { … } }
```

Poi il client dice frasi, con un destinatario facoltativo (o `@` con l'id o il nome all'inizio del testo), e riceve tutti i messaggi del mondo, suoi compresi:

```json
{ "type": "say", "text": "Portami al laghetto1", "to": "tobia" }
{ "type": "heard", "from": "tobia", "from_name": "Tobia", "to": null, "to_name": null, "text": "Vado subito a Laghetto del borgo!" }
```

## Uno scheletro in Python

```python
import json, sys

def send(message):
    print(json.dumps(message), flush=True)

for line in sys.stdin:
    message = json.loads(line)
    if message["type"] == "hello":
        send({"type": "say", "id": "s1", "text": "Eccomi!"})
    elif message["type"] == "interacted":
        send({"type": "walk_to", "id": "w1", "target": "player"})
```

Ricorda il `flush=True`: senza, Python trattiene le righe e il personaggio sembra non rispondere.
