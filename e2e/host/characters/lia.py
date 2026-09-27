"""Lia answers whoever speaks to her: the end-to-end test of a Python character (PY-003)."""

from yw3d import Character, run


class Lia(Character):
    async def on_message(self, message):
        if message.to_me:
            await self.say(f"Ciao {message.sender_name}, sono **Lia**!", to=message.sender)


run(Lia)
