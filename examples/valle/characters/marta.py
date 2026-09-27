"""Marta, la pescatrice: pesca al laghetto del borgo e sa tutto dei pesci della valle.

Chiedile qualcosa sui pesci, stando vicino (o manda Tobia a chiederglielo):
  @Marta cosa si pesca nel laghetto?
  @Marta quando abboccano?
  @Marta e nello stagno di ponente?
"""

import random
import re

from yw3d import Character, run

# Cosa sa Marta dei posti dove si pesca.
PESCI = {
    "laghetto1": "Nel Laghetto del borgo si pescano **tinche** e **carpe**, e qualche persico.",
    "stagno": "Nello Stagno di ponente ci sono **lucci** e **anguille**: servono esche vive.",
}
QUANDO = "Abboccano meglio all'alba e al tramonto; a mezzogiorno i pesci dormono."
ESCHE = "Per tinche e carpe va bene il mais; per i lucci un pesciolino vivo."
PAROLE_DEI_PESCI = ("pesc", "abbocc", "esca", "esche", "lago", "laghett", "stagno", "tinc", "carp", "lucc")


class Marta(Character):
    # Pesca sulla sponda del laghetto; ogni tanto qualcosa abbocca.
    async def routine(self):
        if not self.map["laghetto1"].contains(self.position):
            await self.walk_to("laghetto1")
        await self.look_at("laghetto1")
        await self.wait(random.uniform(20, 40))
        if random.random() < 0.3:
            await self.say(random.choice(["Ha abboccato una tinca!", "Niente, oggi sono furbi."]))

    async def on_interact(self):
        await self.look_at("player")
        await self.say("Vuoi sapere cosa si pesca qui? Chiedimelo con **@Marta**.")

    async def on_message(self, message):
        if not message.to_me:
            return
        await self.look_at(message.sender)
        await self.say(self.risposta(message.text.lower()), to=message.sender)

    def risposta(self, testo):
        parole = set(re.findall(r"\w+", testo))
        if not any(parola in testo for parola in PAROLE_DEI_PESCI):
            return "Io di pesci me ne intendo: chiedimi cosa si pesca, o quando abboccano."
        if parole & {"quando", "ora", "orario"}:
            return QUANDO
        if parole & {"esca", "esche"}:
            return ESCHE
        if "stagno" in testo or "ponente" in testo:
            return PESCI["stagno"]
        return PESCI["laghetto1"] + " " + QUANDO


run(Marta)
