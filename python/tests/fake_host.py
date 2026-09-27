"""A host that tests drive by hand: they read what the character asks and answer it."""

import asyncio
from typing import Any, Dict, List, Optional

HELLO = {
    "type": "hello",
    "version": 3,
    "character": {"id": "tobia", "name": "Tobia", "description": "Il garzone."},
    "world": {"size": [64, 96, 64]},
    "map": {
        "name": "Borgo",
        "description": None,
        "entries": [
            {"id": "pozzo", "kind": "place", "name": "Pozzo vecchio", "description": None,
             "shape": {"kind": "point", "x": 44, "z": 30}},
            {"id": "orto", "kind": "place", "name": "Orto", "description": "Zucchine.",
             "shape": {"kind": "rect", "from": [10, 10], "to": [20, 30]}},
            {"id": "tobia", "kind": "character", "name": "Tobia", "description": None,
             "shape": {"kind": "point", "x": 30.5, "z": 34.5}},
            {"id": "player", "kind": "player", "name": "Ada", "description": None,
             "shape": {"kind": "point", "x": 30.5, "z": 30.5}},
        ],
    },
}


class FakeHost:
    """The connection of a character, with the host played by the test."""

    def __init__(self) -> None:
        self.sent: List[Dict[str, Any]] = []
        self._incoming: "asyncio.Queue[Optional[Dict[str, Any]]]" = asyncio.Queue()
        self._new = asyncio.Event()

    # The side of the character.
    def start(self) -> None:
        pass

    async def receive(self) -> Optional[Dict[str, Any]]:
        return await self._incoming.get()

    def send(self, message: Dict[str, Any]) -> None:
        self.sent.append(message)
        self._new.set()

    # The side of the test.
    def tell(self, message: Dict[str, Any]) -> None:
        self._incoming.put_nowait(message)

    def close(self) -> None:
        self._incoming.put_nowait(None)

    async def next(self, timeout: float = 2.0) -> Dict[str, Any]:
        """The next request of the character, waiting for it."""
        seen = getattr(self, "_seen", 0)
        async def wait() -> None:
            while len(self.sent) <= seen:
                self._new.clear()
                await self._new.wait()
        await asyncio.wait_for(wait(), timeout)
        self._seen = seen + 1
        return self.sent[seen]

    async def nothing(self, seconds: float = 0.1) -> None:
        """Checks that the character asks for nothing more for a while."""
        seen = getattr(self, "_seen", 0)
        await asyncio.sleep(seconds)
        assert len(self.sent) == seen, f"unexpected requests: {self.sent[seen:]}"

    def done(self, request: Dict[str, Any]) -> None:
        self.tell({"type": "action_done", "id": request["id"]})

    def failed(self, request: Dict[str, Any], reason: str) -> None:
        self.tell({"type": "action_failed", "id": request["id"], "reason": reason})

    def replaced(self, request: Dict[str, Any]) -> None:
        self.tell({"type": "action_replaced", "id": request["id"]})

    def perception(self, time: float, x: float = 30.5, z: float = 34.5, nearby: Any = (),
                   clock: str = "08:00", part: str = "day") -> None:
        self.tell({
            "type": "perception", "time": time, "time_of_day": clock, "part_of_day": part,
            "self": {"x": x, "y": 34, "z": z, "yaw": 0, "on_ground": True, "in_water": False},
            "action": None, "nearby": list(nearby),
        })

    def heard(self, text: str, sender: str = "player", to: Optional[str] = "tobia",
              mentions: Optional[str] = None, yes_no: Optional[str] = None) -> None:
        self.tell({"type": "heard", "from": sender, "text": text, "distance": 4.0, "to": to,
                   "mentions": mentions, "yes_no": yes_no})


def strip(request: Dict[str, Any]) -> Dict[str, Any]:
    """A request without its id, to compare it."""
    return {k: v for k, v in request.items() if k != "id"}
