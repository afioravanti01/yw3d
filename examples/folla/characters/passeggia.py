"""Un abitante che passeggia per il borgo: va in un punto a caso, si ferma un po', riparte.

Tutti e venti gli abitanti della folla usano questo stesso programma, ognuno nel suo processo
(PERF-005.a).
"""

import random

from yw3d import ActionFailed, Character, run


class Passante(Character):
    async def routine(self):
        try:
            await self.walk_to((random.uniform(110, 215), random.uniform(30, 95)),
                               speed=random.uniform(1, 2))
        except ActionFailed:
            pass  # un punto irraggiungibile: se ne sceglie un altro
        await self.wait(random.uniform(1, 4))


run(Passante)
