# Personaggi in Python

Un personaggio di yw3d si programma in Python con la libreria `yw3d`. L'host la mette a disposizione di ogni programma: non si installa niente. Serve Python 3.10 o successivo; yw3d usa `python3` (su Windows `python`), oppure l'interprete indicato con `yw3d <cartella> --python <percorso>`.

Un programma è una **classe**: la `routine` dice cosa fa il personaggio, dall'inizio alla fine e poi da capo; i **gestori** (`on_message`, `on_near`, …) dicono cosa fa quando succede qualcosa. Un gestore interrompe la routine; quando finisce, la routine riprende dall'azione che stava facendo.

## Il template

Copia questo file nella cartella del mondo, per esempio in `characters/tobia.py`:

```python
"""Tobia, il garzone: fa il giro del borgo, saluta chi arriva, va dove gli dici."""

from yw3d import Character, run


class Tobia(Character):
    # La routine: cosa fa, dall'inizio alla fine, e poi da capo.
    async def routine(self):
        for tappa in ["piazza", "orti", "laghetto1"]:
            await self.walk_to(tappa)
            await self.wait(5)

    # Qualcuno si avvicina: se è il giocatore, lo saluta.
    async def on_near(self, chi):
        if chi.is_player:
            await self.say(f"Buongiorno, {chi.name}!")

    # Un messaggio rivolto a lui: se nomina un posto ci va, altrimenti risponde.
    async def on_message(self, message):
        if not message.to_me:
            return
        luogo = message.mentions
        if luogo is None:
            await self.say("Dimmi un posto e ci vado.", to=message.sender)
        elif luogo.contains(self.position):
            await self.say("Sono già qui!", to=message.sender)
        else:
            await self.say(f"Vado a {luogo.name}!", to=message.sender)
            await self.walk_to(luogo.id)


run(Tobia)
```

Poi dichiaralo nel `world.yaml`, al posto di un `controller`:

```yaml
characters:
  - id: tobia
    name: Tobia
    at: [154, 70]
    program: characters/tobia.py
```

Avvia il mondo con `yw3d <cartella>`. La prima volta yw3d mostra il comando che lancerà, per esempio `python3 -u characters/tobia.py`, e chiede il consenso; `--allow-commands` lo dà senza chiedere. **Salvando il file** il mondo si ricarica e il programma riparte.

Per parlargli avvicinati (entro 16 blocchi, 8 m) e scrivi nella console a destra: `@Tobia vai al laghetto1`. Con `/world` vedi dove sono i personaggi e gli id dei posti.

## Azioni

Ogni azione si **attende** con `await` e finisce quando il personaggio l'ha completata. Un personaggio fa un'azione alla volta. Le coordinate sono in blocchi (1 blocco = 0,5 m).

| Azione | Cosa fa |
|---|---|
| `await self.walk_to("laghetto1")` | cammina verso un elemento della mappa (il suo id), un'entità vicina o un punto `(x, z)`; `speed=` in m/s, da 0,5 a 7 (normale 1,5) |
| `await self.look_at("player")` | si gira verso un elemento, un'entità o un punto |
| `await self.say("Ciao!")` | dice una frase, sentita entro 16 blocchi; con `to="player"` o l'id di un personaggio la rivolge a qualcuno, che dev'essere entro 16 blocchi |
| `risposta = await self.ask("Dove vado?")` | fa una domanda e aspetta la risposta (vedi [Domande](#domande)) |
| `await self.follow("player", distance=4, seconds=20)` | segue un personaggio o il giocatore; senza `seconds` finché non fa altro |
| `await self.wait(5)` | resta fermo per 5 secondi del mondo |
| `await self.stop()` | si ferma |
| `self.log("testo")`, `print("testo")` | una riga nel terminale di yw3d, preceduta dall'id del personaggio: per capire cosa succede |

Verso un elemento della mappa il personaggio arriva dove ha senso: davanti alla porta di una casa, sulla sponda di un laghetto, ai piedi di un albero, dentro un'area. Trova da solo la strada.

**Se un'azione non riesce** solleva `ActionFailed`, con la causa in `error.reason`: un posto irraggiungibile, un id che non esiste, qualcuno non abbastanza vicino per parlargli. Se l'errore non è gestito il programma si ferma, e con lui il personaggio (vedi [Errori](#errori)). Quando conta, gestiscilo:

```python
try:
    await self.walk_to("laghetto1")
except ActionFailed as error:
    self.log("non arrivo al laghetto:", error.reason)
```

## Gestori

Si scrivono solo quelli che servono. Ognuno interrompe la routine; i gestori non si interrompono tra loro, ma aspettano il loro turno. Finiti i gestori, la routine riprende dall'azione interrotta: una `walk_to` riparte verso la stessa meta, una `wait` aspetta il tempo che mancava.

| Gestore | Quando |
|---|---|
| `async def on_message(self, message)` | qualcuno ha detto qualcosa che il personaggio ha sentito (vedi [Messaggi](#messaggi)) |
| `async def on_near(self, chi)` | un personaggio o il giocatore si avvicina entro `near_distance` blocchi |
| `async def on_far(self, chi)` | si allontana oltre `near_distance` |
| `async def on_interact(self)` | il giocatore, entro 3 m, ha premuto E |

`near_distance` vale 8 blocchi (4 m); per cambiarlo scrivi nella classe `near_distance = 10`. `on_near` scatta quando qualcuno entra, non a ogni istante in cui resta vicino.

## Cosa sa il personaggio

Senza chiederlo, il personaggio sa:

- `self.id`, `self.name`, `self.description`;
- `self.clock`, l'ora del mondo (`"21:30"`), e `self.part_of_day`: `"dawn"`, `"day"`, `"dusk"` o `"night"`; per esempio `if self.part_of_day == "night": await self.walk_to("casa")`;
- `self.position` (x, y, z in blocchi) e `self.time` (secondi dall'avvio del mondo). Arrivano 4 volte al secondo: subito dopo un'azione possono essere vecchi di un quarto di secondo;
- `self.nearby`: le entità entro 32 blocchi, ognuna con `id`, `name`, `distance` e `is_player`;
- `self.map`: ogni elemento del mondo. `self.map["laghetto1"]` ha `id`, `name`, `description`, `kind` (`place`, `structure`, `scatter`, `character`, `player`) e `center`; `for e in self.map` li scorre tutti, `self.map.of_kind("place")` quelli di un tipo.

Due domande utili alla mappa:

- `elemento.contains(self.position)`: il personaggio ci si trova già? Verso un'area in cui è già dentro, `walk_to` finisce subito: «Alberi dei prati», nella valle, copre quasi tutto il mondo;
- `self.map.find_in(testo, kind="character")`: gli elementi che un testo nomina, per id o per nome, nell'ordine in cui compaiono.

## Messaggi

`on_message(message)` riceve le frasi che il personaggio sente: quelle dette entro 16 blocchi, dal giocatore o da altri personaggi, rivolte a lui o a nessuno in particolare. Per parlare con qualcuno bisogna stargli vicino.

| Campo | Cosa contiene |
|---|---|
| `message.text` | il testo |
| `message.sender`, `message.sender_name` | l'id e il nome di chi l'ha detto (`player` per il giocatore) |
| `message.from_player` | se l'ha detto il giocatore |
| `message.to`, `message.to_me` | a chi era rivolto, e se era rivolto a questo personaggio |
| `message.mentions` | l'elemento della mappa che il testo nomina, se ne nomina uno solo |
| `message.is_yes`, `message.is_no` | se il testo è un sì («sì», «certo», «va bene», …) o un no |

I testi di `say` compaiono nella console con il Markdown: `**grassetto**`, `*corsivo*`, `` `codice` ``, elenchi con `-`.

## Domande

`ask` dice una domanda e aspetta la risposta: il primo messaggio che l'interrogato dice al personaggio, o ad alta voce. Si può chiedere al giocatore o a un personaggio vicino. Se entro `timeout` secondi (normale 30) nessuno risponde, restituisce `None`. La risposta non passa da `on_message`.

```python
risposta = await self.ask("Vuoi una zucchina?", timeout=20)
if risposta is None:
    await self.say("Sarà per un'altra volta.")
elif risposta.is_yes:
    await self.say("Eccola!")
```

Tra personaggi funziona allo stesso modo. Così Tobia, nella valle, va da Marta, le chiede dei pesci e torna a riferire:

```python
await self.walk_to("pescatrice")
risposta = await self.ask("Cosa si può pescare nel lago?", to="pescatrice")
await self.walk_to("player")
await self.say(f"Marta dice: «{risposta.text}»", to="player")
```

## Errori

Un errore non gestito, anche un `ActionFailed`, ferma il programma. Il terminale di yw3d mostra prima la riga da guardare, poi tutta la traccia:

```
yw3d  [tobia] characters/tobia.py:7: ActionFailed: walk_to failed: there is no "fontana" in the map
yw3d  [tobia] Traceback (most recent call last):
…
yw3d  [tobia] program ended (exit code 1): the character stops
```

L'overlay (F3) mostra, per il personaggio più vicino, il programma e il suo stato: `running`, `stopped`, `in error`. Correggi il file e salvalo: il programma riparte.

Casi frequenti:

- **`"marta" is not nearby`**: `say` o `ask` rivolti a qualcuno oltre 16 blocchi. Prima avvicinati: `await self.walk_to("pescatrice")`.
- **`walk_to` finisce subito senza muoversi**: il personaggio è già dentro l'area della meta (vedi `contains`).
- **Il personaggio non parte**: il terminale dice perché. Python mancante o più vecchio di 3.10 (usa `--python`), consenso negato, file inesistente o fuori dalla cartella del mondo.
- **`print` non esce nella console del browser**: esce nel terminale di yw3d; nella console del mondo parla solo `say`.
- **Una routine che non chiede azioni** (per esempio solo `pass`) è ammessa: fa una piccola pausa e ricomincia. Senza routine il personaggio aspetta i gestori.

## Quando un client prende il personaggio

Un client sul WebSocket può prendere un personaggio che ha un programma (vedi [controllori.md](controllori.md)). Finché lo guida, il programma resta in attesa: le sue azioni aspettano. Quando il client se ne va, il programma riprende dall'azione interrotta.

## Esempi

- [examples/valle/characters](../examples/valle/characters): **Tobia** fa commissioni («@Tobia vai da Marta e chiedile cosa si pesca»), **Marta** sa tutto dei pesci, **Bruno** fa la guardia e saluta, **Nina** offre una zucchina e aspetta un sì o un no.
- [examples/folla/characters/passeggia.py](../examples/folla/characters/passeggia.py): lo stesso programma per venti passanti.
