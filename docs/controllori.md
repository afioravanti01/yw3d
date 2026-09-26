# Controllori dei personaggi

Un **controllore** è un programma che guida un personaggio: riceve quello che il personaggio percepisce e chiede azioni. Si scrive in qualunque linguaggio: basta leggere e scrivere righe di testo in JSON. Gli esempi completi sono in [examples/valle/controllers](../examples/valle/controllers): `guardiano.py` in Python, `pescatrice.mjs` in JavaScript.

## Collegare un controllore

**Lanciato dall'host.** Nel `world.yaml` il personaggio dichiara il comando, eseguito nella cartella del mondo:

```yaml
characters:
  - id: guardiano
    at: [160, 70]
    controller: { command: python3 controllers/guardiano.py }
```

L'host scrive un messaggio per riga sullo **stdin** del programma e legge un messaggio per riga dal suo **stdout**. Quello che il programma scrive sullo **stderr** compare nel terminale di yw3d, preceduto dal nome del personaggio: è il posto per i messaggi di debug.

La prima volta che una cartella vuole lanciare dei comandi, yw3d li elenca e chiede il permesso; il permesso si ricorda finché i comandi non cambiano. `yw3d <cartella> --allow-commands` li lancia senza chiedere. Salvando `world.yaml` i controllori ripartono.

**Da fuori, via WebSocket.** Un client si collega a `ws://localhost:5180/controller` e come primo messaggio chiede un personaggio che non ha già un controllore:

```json
{ "type": "control", "character": "guardiano" }
```

Da lì in poi i messaggi sono gli stessi di stdio, uno per frame.

## Messaggi dall'host

Il primo messaggio è il saluto:

```json
{ "type": "hello", "version": 1, "character": { "id": "guardiano" }, "world": { "size": [512, 96, 512] } }
```

Poi, **4 volte al secondo**, la percezione:

```json
{
  "type": "perception",
  "time": 12.5,
  "self": { "x": 158.5, "y": 34, "z": 66.5, "yaw": 0, "on_ground": true, "in_water": false },
  "action": { "id": "walk-3", "kind": "walk_to" },
  "nearby": [{ "id": "player", "kind": "player", "x": 162.1, "y": 34, "z": 70.4, "distance": 5.4 }]
}
```

- `time`: secondi di simulazione dall'avvio del mondo.
- `nearby`: entità entro 32 blocchi (16 m), dalla più vicina; `kind` è `player` o `character`.
- Se il programma legge più lentamente, riceve solo l'ultima percezione, non un arretrato.

E subito, quando succedono, gli **eventi**:

| Messaggio | Quando |
|---|---|
| `{ "type": "heard", "from": "pescatrice", "text": "…", "distance": 6 }` | qualcuno entro 16 blocchi ha detto qualcosa |
| `{ "type": "interacted", "by": "player" }` | il giocatore, entro 3 m, ha premuto E |
| `{ "type": "action_done", "id": "walk-3" }` | l'azione è finita |
| `{ "type": "action_failed", "id": "walk-3", "reason": "…" }` | l'azione non è riuscita, con la causa |
| `{ "type": "action_replaced", "id": "walk-3" }` | un'azione nuova ha preso il suo posto |
| `{ "type": "error", "message": "…" }` | un messaggio del controllore non era valido |

## Azioni

Ogni azione ha un `id` scelto dal controllore, che ritorna nel suo esito. Un personaggio fa **un'azione alla volta**: una nuova sostituisce quella in corso. Coordinate in blocchi (1 blocco = 0,5 m), velocità in m/s.

| Azione | Campi | Finisce |
|---|---|---|
| `walk_to` | `x`, `z` oppure `target` (un id, o `player`); `speed` facoltativa, 0,5–7 m/s, predefinita 1,5 | all'arrivo, entro 1 blocco |
| `look_at` | `x`, `z` oppure `target` | subito |
| `say` | `text`, 1–500 caratteri | dopo 1 s + 0,06 s per carattere |
| `follow` | `target`; `distance` 1–32 blocchi, predefinita 3; `speed` | mai: finché non la sostituisci |
| `wait` | `seconds`, 0–3600 | dopo i secondi indicati |
| `stop` | — | subito, fermando l'azione in corso |

Esempi:

```json
{ "type": "walk_to", "id": "w1", "x": 182, "z": 104, "speed": 1.3 }
{ "type": "say", "id": "s1", "text": "Buongiorno!" }
{ "type": "follow", "id": "f1", "target": "player", "distance": 4 }
```

Il personaggio trova da solo la strada: sale i gradini di un blocco, scende fino a tre, passa dalle porte e nuota solo se il giro all'asciutto è più lungo del doppio. Se resta bloccato ricalcola la strada; dopo tre tentativi `walk_to` fallisce. Ogni `walk_to` ha anche un tempo limite, il doppio del tempo previsto più 5 s.

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
