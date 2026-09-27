"""Rules of the Character class, with a host played by the tests (PY-002, plan F07 P9)."""

import asyncio
import unittest
from typing import Any, Awaitable, Callable, List

from fake_host import HELLO, FakeHost, strip
from yw3d import ActionFailed, Character, Message, Position


def scenario(character: Character, test: Callable[[FakeHost], Awaitable[None]]) -> None:
    """Runs the character against a fake host while the test plays the host."""

    async def main() -> None:
        host = FakeHost()
        character._hello(HELLO)
        running = asyncio.ensure_future(character._main(host))
        try:
            await test(host)
        finally:
            host.close()
            await asyncio.wait_for(running, 2)

    asyncio.run(main())


class Round(Character):
    """Walks between two places, saying where it is."""

    def __init__(self) -> None:
        super().__init__()
        self.log_lines: List[str] = []

    async def routine(self) -> None:
        await self.walk_to("pozzo")
        await self.say("Al pozzo.")
        await self.walk_to("orto", speed=1.2)
        await self.wait(10)


class TestActions(unittest.TestCase):
    def test_actions_are_awaited_one_after_the_other(self) -> None:
        async def host_side(host: FakeHost) -> None:
            walk = await host.next()
            self.assertEqual(strip(walk), {"type": "walk_to", "target": "pozzo"})
            await host.nothing()
            host.done(walk)
            say = await host.next()
            self.assertEqual(strip(say), {"type": "say", "text": "Al pozzo."})
            host.done(say)
            walk2 = await host.next()
            self.assertEqual(strip(walk2), {"type": "walk_to", "target": "orto", "speed": 1.2})
            host.done(walk2)
            self.assertEqual(strip(await host.next()), {"type": "wait", "seconds": 10})

        scenario(Round(), host_side)

    def test_a_failed_action_raises_with_its_cause_and_a_replaced_one_does_not(self) -> None:
        caught: List[str] = []

        class Careful(Character):
            async def routine(self) -> None:
                try:
                    await self.walk_to((500, 500))
                except ActionFailed as error:
                    caught.append(error.reason)
                await self.say("Ci ho provato.")
                await self.look_at(x=3, z=4)
                caught.append("after look_at")
                await self.wait(100)

        async def host_side(host: FakeHost) -> None:
            walk = await host.next()
            self.assertEqual(strip(walk), {"type": "walk_to", "x": 500, "z": 500})
            host.failed(walk, "no path to (500, 500)")
            say = await host.next()
            host.replaced(say)
            look = await host.next()
            self.assertEqual(strip(look), {"type": "look_at", "x": 3, "z": 4})
            host.done(look)
            await host.next()
            self.assertEqual(caught, ["no path to (500, 500)", "after look_at"])

        scenario(Careful(), host_side)


class Listener(Round):
    """The round, and an answer to every message."""

    def __init__(self) -> None:
        super().__init__()
        self.messages: List[Message] = []

    async def on_message(self, message: Message) -> None:
        self.messages.append(message)
        await self.say(f"Ho sentito: {message.text}")


class TestInterruptions(unittest.TestCase):
    def test_a_message_interrupts_the_routine_which_goes_on_from_the_interrupted_action(self) -> None:
        character = Listener()

        async def host_side(host: FakeHost) -> None:
            walk = await host.next()
            host.heard("vai al pozzo vecchio", mentions="pozzo")
            say = await host.next()
            self.assertEqual(strip(say), {"type": "say", "text": "Ho sentito: vai al pozzo vecchio"})
            # The handler's say replaced the walk: the routine does not see it.
            host.replaced(walk)
            await host.nothing()
            host.done(say)
            again = await host.next()
            self.assertEqual(strip(again), {"type": "walk_to", "target": "pozzo"})
            self.assertNotEqual(again["id"], walk["id"])
            host.done(again)
            self.assertEqual(strip(await host.next()), {"type": "say", "text": "Al pozzo."})
            message = character.messages[0]
            self.assertEqual(message.sender, "player")
            self.assertEqual(message.sender_name, "Ada")
            self.assertTrue(message.to_me)
            self.assertEqual(message.mentions.name if message.mentions else None, "Pozzo vecchio")

        scenario(character, host_side)

    def test_a_wait_goes_on_with_the_time_left(self) -> None:
        class Waiter(Listener):
            async def routine(self) -> None:
                await self.wait(10)
                await self.say("Fine.")

        async def host_side(host: FakeHost) -> None:
            host.perception(time=100)
            wait = await host.next()
            self.assertEqual(strip(wait), {"type": "wait", "seconds": 10})
            host.perception(time=104)
            host.heard("ciao")
            say = await host.next()
            host.replaced(wait)
            host.perception(time=106)
            host.done(say)
            again = await host.next()
            self.assertEqual(strip(again), {"type": "wait", "seconds": 4})

        scenario(Waiter(), host_side)

    def test_the_routine_waits_while_a_handler_runs(self) -> None:
        async def host_side(host: FakeHost) -> None:
            walk = await host.next()
            host.heard("ciao")
            say = await host.next()
            # The walk ends before the handler's say replaces it: it counts as done, and the
            # routine's next action waits for the end of the handler.
            host.done(walk)
            await host.nothing()
            host.done(say)
            self.assertEqual(strip(await host.next()), {"type": "say", "text": "Al pozzo."})

        scenario(Listener(), host_side)

    def test_handlers_run_one_after_the_other(self) -> None:
        async def host_side(host: FakeHost) -> None:
            walk = await host.next()
            host.heard("uno")
            host.heard("due")
            first = await host.next()
            host.replaced(walk)
            self.assertEqual(first["text"], "Ho sentito: uno")
            await host.nothing()
            host.done(first)
            second = await host.next()
            self.assertEqual(second["text"], "Ho sentito: due")
            host.done(second)
            self.assertEqual(strip(await host.next()), {"type": "walk_to", "target": "pozzo"})

        scenario(Listener(), host_side)

    def test_without_on_message_the_routine_is_not_interrupted(self) -> None:
        async def host_side(host: FakeHost) -> None:
            walk = await host.next()
            host.heard("ciao")
            await host.nothing()
            host.done(walk)
            self.assertEqual(strip(await host.next()), {"type": "say", "text": "Al pozzo."})

        scenario(Round(), host_side)


class TestState(unittest.TestCase):
    def test_position_nearby_and_map_are_read_without_asking(self) -> None:
        seen: List[Any] = []

        class Looker(Character):
            async def routine(self) -> None:
                seen.append((self.id, self.name, self.description, self.position.x, self.position.z))
                await self.wait(1)
                seen.append((self.time, self.position.x, [(e.id, e.name, e.is_player) for e in self.nearby]))
                seen.append((self.map.name, self.map["orto"].description, self.map["orto"].center,
                             [e.id for e in self.map.of_kind("place")], "pozzo" in self.map))
                seen.append((self.map["orto"].contains(Position(12, 34, 29.9)),
                             self.map["orto"].contains(Position(20, 34, 25)),
                             self.map["pozzo"].contains(Position(45, 34, 31)),
                             self.map["pozzo"].contains(self.position)))
                await self.wait(100)

        async def host_side(host: FakeHost) -> None:
            wait = await host.next()
            host.perception(time=3.5, x=31, z=33, nearby=[
                {"id": "player", "name": "Ada", "kind": "player", "x": 30, "y": 34, "z": 30, "distance": 3.2},
            ])
            host.done(wait)
            await host.next()
            self.assertEqual(seen, [
                ("tobia", "Tobia", "Il garzone.", 30.5, 34.5),
                (3.5, 31, [("player", "Ada", True)]),
                ("Borgo", "Zucchine.", (15.0, 20.0), ["pozzo", "orto"], True),
                (True, False, True, False),
            ])

        scenario(Looker(), host_side)


if __name__ == "__main__":
    unittest.main()
