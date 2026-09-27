"""The yw3d library: characters of a yw3d world written in Python (PY-001).

A character is a class that extends `Character`: its `routine` says what it does, again and
again, and its handlers (`on_message`, …) what it does when something happens. The program
ends with `run(TheClass)`:

    from yw3d import Character, run

    class Guardiano(Character):
        async def routine(self):
            await self.walk_to("piazza")
            await self.wait(5)

    run(Guardiano)

The host of yw3d puts this package on the import path of every program it starts, so a
program imports it without installing anything. It uses only the standard library.
"""

import asyncio
import sys
from typing import Type

from .character import ActionFailed, Character
from .connection import StdioConnection
from .world import Entity, MapEntry, Message, Position, WorldMap

PROTOCOL_VERSION = 3

__all__ = [
    "ActionFailed",
    "Character",
    "Entity",
    "MapEntry",
    "Message",
    "Position",
    "WorldMap",
    "run",
]


def run(character_class: Type[Character]) -> None:
    """Starts the character: it talks with the host of yw3d until the host closes."""
    connection = StdioConnection()
    hello = connection.read_first()
    if hello.get("version") != PROTOCOL_VERSION:
        print(
            f"yw3d: this library speaks the protocol {PROTOCOL_VERSION}, "
            f"the host speaks {hello.get('version')}",
            file=sys.stderr,
        )
    character = character_class()
    character._hello(hello)
    try:
        asyncio.run(character._main(connection))
    except KeyboardInterrupt:
        pass
