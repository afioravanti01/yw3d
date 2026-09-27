# Personaggi in Python

> **Bozza per la prova d'uso (F07, T7.09).** La guida completa arriva con T7.12: domande al giocatore, altri gestori ed errori frequenti non ci sono ancora.

Un personaggio si programma in Python con la libreria `yw3d`, che l'host mette a disposizione di ogni programma: non si installa niente. Serve Python 3.10 o successivo.

## Il template

Copia questo file nella cartella del mondo, per esempio `characters/tobia.py`, e dichiaralo nel `world.yaml`:

```yaml
characters:
  - id: tobia
    name: Tobia
    at: [154, 70]
    program: characters/tobia.py
```

```python
"""Tobia, il garzone: fa il giro del borgo e risponde a chi gli parla."""

from yw3d import ActionFailed, Character, run


class Tobia(Character):
    # La routine: cosa fa, dall'inizio alla fine, e poi di nuovo da capo.
    async def routine(self):
        await self.walk_to("piazza")
        await self.say("Eccomi in piazza.")
        await self.wait(5)

        try:
            await self.walk_to("laghetto1")
        except ActionFailed as error:
            self.log("non arrivo al laghetto:", error.reason)

        await self.wait(5)

    # Un messaggio del giocatore o di un altro personaggio: interrompe la routine,
    # che poi riprende dall'azione che stava facendo.
    async def on_message(self, message):
        if not message.to_me:
            return
        if message.mentions:
            luogo = message.mentions
            if luogo.contains(self.position):
                await self.say("Sono già qui!")
            else:
                await self.say(f"Vado a {luogo.name}!")
                await self.walk_to(luogo.id)
        else:
            await self.say(f"Ciao {message.sender_name}!", to=message.sender)


run(Tobia)
```

Salvando il file il mondo si ricarica e il programma riparte.

## Azioni

Ogni azione si **attende** con `await` e finisce quando il personaggio l'ha completata. Se non riesce solleva `ActionFailed`, con la causa in `error.reason`.

| Azione | Cosa fa |
|---|---|
| `await self.walk_to("laghetto1")` | cammina verso un elemento della mappa (il suo id), un'entità vicina o un punto `(x, z)` in blocchi; `speed=` in m/s |
| `await self.look_at("player")` | si gira verso un elemento, un'entità o un punto |
| `await self.say("Ciao!")` | dice una frase, sentita entro 16 blocchi; con `to="player"` o l'id di un personaggio la sente anche da lontano |
| `await self.follow("player", distance=4, seconds=20)` | segue un personaggio o il giocatore; senza `seconds` finché non fa altro |
| `await self.wait(5)` | resta fermo per 5 secondi del mondo |
| `await self.stop()` | si ferma |
| `self.log("testo")`, `print("testo")` | una riga nel terminale di yw3d, per capire cosa succede |

## Cosa sa il personaggio

Senza chiederlo, il personaggio sa:

- `self.id`, `self.name`, `self.description`;
- `self.position` (x, y, z in blocchi) e `self.time` (secondi dall'avvio del mondo), aggiornati 4 volte al secondo;
- `self.nearby`: le entità entro 32 blocchi, ognuna con `id`, `name`, `distance` e `is_player`;
- `self.map`: ogni elemento del mondo per id (`self.map["laghetto1"].name`), con nome, descrizione e forma; `elemento.contains(self.position)` dice se il personaggio ci si trova già. Verso un'area in cui è già dentro, `walk_to` finisce subito: per esempio «Alberi dei prati», che copre quasi tutta la valle.

## Messaggi

`on_message(message)` riceve ogni frase che il personaggio sente: quelle dette entro 16 blocchi e quelle rivolte a lui con `@` da qualunque distanza. Un messaggio ha `sender` e `sender_name` (chi l'ha detto), `text`, `to_me`, `mentions` (l'elemento della mappa nominato, se uno solo) e `is_yes` / `is_no`.

Le frasi di `say` compaiono nella console con il Markdown: `**grassetto**`, `*corsivo*`, `` `codice` ``, elenchi con `-`.
