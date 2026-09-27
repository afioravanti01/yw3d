"""Tobia, il garzone del fabbro: fa commissioni per chi glielo chiede.

Scrivigli, stando vicino:
  @Tobia vai al laghetto1                       ci va e ti dice quando è arrivato
  @Tobia vai da Marta e chiedile cosa si pesca  va da Marta, le chiede, torna e ti riferisce
  @Tobia ciao                                   ti spiega cosa sa fare
"""

import re

from yw3d import ActionFailed, Character, run


class Tobia(Character):
    # Tra una commissione e l'altra aspetta in piazza.
    async def routine(self):
        if not self.map["piazza"].contains(self.position):
            await self.walk_to("piazza")
        await self.wait(30)

    async def on_interact(self):
        await self.look_at("player")
        await self.say("Ciao! Scrivimi con **@Tobia** dove andare, o cosa chiedere a qualcuno.")

    async def on_message(self, message):
        if not (message.to_me and message.from_player):
            return
        chi = self.map.find_in(message.text, kind="character")
        domanda = re.search(r"\bchied\w*\s+(.+)", message.text, re.IGNORECASE)
        if chi and domanda:
            await self.chiedi(chi[0], domanda.group(1))
        elif message.mentions:
            await self.vai(message.mentions)
        else:
            await self.say(
                "Posso andare in un posto (*vai al laghetto1*) "
                "o chiedere qualcosa a qualcuno (*vai da Marta e chiedile cosa si pesca*).",
                to="player",
            )

    async def vai(self, luogo):
        if luogo.contains(self.position):
            await self.say("Sono già qui!")
            return
        await self.say(f"Vado a {luogo.name}!")
        try:
            await self.walk_to(luogo.id)
            await self.say(f"Eccomi a {luogo.name}.")
        except ActionFailed as error:
            self.log("non arrivo:", error.reason)
            await self.say(f"Non riesco ad arrivare a {luogo.name}.")

    async def chiedi(self, persona, domanda):
        domanda = domanda.strip().rstrip("?.! ")
        domanda = domanda[0].upper() + domanda[1:] + "?"
        await self.say(f"Vado da {persona.name} a chiederglielo!", to="player")
        try:
            await self.walk_to(persona.id)
            risposta = await self.ask(domanda, to=persona.id)
        except ActionFailed as error:
            # Non la trova, o si è allontanata mentre arrivava.
            self.log("non riesco a chiedere:", error.reason)
            risposta = None
        # Per riferire deve tornare vicino al giocatore.
        await self.walk_to("player")
        riferisco = f"{persona.name} dice: «{risposta.text}»" if risposta else f"{persona.name} non mi ha risposto."
        try:
            await self.say(riferisco, to="player")
        except ActionFailed:
            # Il giocatore si è allontanato: lo dice ad alta voce.
            await self.say(riferisco)


run(Tobia)
