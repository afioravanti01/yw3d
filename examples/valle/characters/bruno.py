"""Bruno, il guardiano: fa il giro del borgo e saluta chi incontra.

Avvicinati mentre passa, oppure premi E vicino a lui.
"""

from yw3d import ActionFailed, Character, run

# Il giro: la piazza, gli orti, il laghetto, il casolare.
GIRO = ["piazza", "orti", "laghetto1", "casolare"]


class Bruno(Character):
    near_distance = 10  # blocchi: 5 m

    def __init__(self):
        super().__init__()
        self.ultimo_saluto = -60.0

    async def routine(self):
        for tappa in GIRO:
            await self.walk_to(tappa, speed=1.2)
            await self.wait(4)
        await self.say("Tutto tranquillo nel borgo.")

    async def on_near(self, chi):
        # Saluta il giocatore, ma non più di una volta al minuto.
        if chi.is_player and self.time - self.ultimo_saluto > 60:
            self.ultimo_saluto = self.time
            await self.look_at("player")
            try:
                await self.say(f"Buongiorno, {chi.name}! Benvenuto nella valle.", to="player")
            except ActionFailed:
                pass  # il giocatore si è già allontanato

    async def on_interact(self):
        await self.look_at("player")
        await self.say("Il laghetto è a sud del borgo: se vuoi sapere dei pesci, chiedi a **Marta**.")

    async def on_message(self, message):
        if message.to_me:
            await self.say("Io faccio la guardia. Per le commissioni chiedi a **Tobia**.", to=message.sender)


run(Bruno)
