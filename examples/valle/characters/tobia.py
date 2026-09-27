"""Tobia, il garzone: fa il giro del borgo e risponde a chi gli parla."""

from yw3d import ActionFailed, Character, run

class Tobia(Character):
    # La routine: cosa fa, dall'inizio alla fine, e poi di nuovo da capo.
    async def routine(self):
        pass
        #await self.walk_to("piazza")
        #await self.say("Eccomi in piazza.")
        #await self.wait(5)

        #try:
        #    await self.walk_to("laghetto1")
        #except ActionFailed as error:
        #    self.log("non arrivo al laghetto:", error.reason)

        #await self.wait(5)

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
