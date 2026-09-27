"""Nina, la contadina: lavora negli orti di ponente e offre la verdura a chi passa.

Passale vicino negli orti: ti chiede se vuoi una zucchina, e aspetta un sì o un no.
"""

from yw3d import ActionFailed, Character, run


class Nina(Character):
    near_distance = 8  # blocchi: 4 m

    def __init__(self):
        super().__init__()
        self.offerte = 0

    async def routine(self):
        await self.walk_to("orti")
        await self.wait(8)
        await self.say("Queste zucchine crescono bene.")
        await self.walk_to((124, 92))
        await self.wait(8)

    async def on_near(self, chi):
        if not chi.is_player or self.offerte >= 3:
            return
        self.offerte += 1
        await self.look_at("player")
        try:
            risposta = await self.ask("Ciao! Vuoi una zucchina dell'orto?", timeout=20)
        except ActionFailed:
            return  # il giocatore è già passato oltre
        if risposta is None:
            await self.say("Va bene, sarà per un'altra volta.")
        elif risposta.is_yes:
            await self.say("Eccola, è appena colta!", to="player")
        elif risposta.is_no:
            await self.say("Peccato, sono buonissime.", to="player")
        else:
            await self.say("Non ho capito: sì o no?", to="player")

    async def on_message(self, message):
        if message.to_me:
            await self.say("Scusa, ho da fare. Per le commissioni chiedi a **Tobia**.", to=message.sender)


run(Nina)
