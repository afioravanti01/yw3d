"""A character of the world as a class: a routine that repeats, and handlers (PY-002)."""

import asyncio
import contextvars
import sys
from typing import Any, Awaitable, Callable, Deque, Dict, List, Optional, Tuple, Union
from collections import deque

from .world import Entity, MapEntry, Message, Position, WorldMap

# Who is acting in the running task: the routine or a handler (plan F07 P9).
_ROLE: "contextvars.ContextVar[str]" = contextvars.ContextVar("yw3d_role", default="routine")

Target = Union[str, Entity, MapEntry, Tuple[float, float]]


class ActionFailed(Exception):
    """An action could not be done; `reason` says why, as the host said it (PY-002.b)."""

    def __init__(self, action: str, reason: str) -> None:
        super().__init__(f"{action} failed: {reason}")
        self.action = action
        self.reason = reason


class _Action:
    """An action asked to the host, with the future its caller awaits."""

    def __init__(self, kind: str, fields: Dict[str, Any], role: str, future: "asyncio.Future[None]") -> None:
        self.kind = kind
        self.fields = fields
        self.role = role
        self.future = future
        self.sent_at: Optional[float] = None

    def remaining(self, now: float) -> Dict[str, Any]:
        """The fields to ask it (again): a wait asked again asks only for the time left."""
        if self.kind != "wait" or self.sent_at is None:
            return self.fields
        return {**self.fields, "seconds": max(0.0, self.fields["seconds"] - (now - self.sent_at))}


class Character:
    """Extend it to write a character: `routine` is what it does, again and again; the
    handlers (`on_message`, …) interrupt the routine, which then goes on from the action it
    was doing. Start it with `run(MyCharacter)`.
    """

    def __init__(self) -> None:
        self.id = ""
        self.name = ""
        self.description: Optional[str] = None
        self.map = WorldMap({})
        self.position = Position(0.0, 0.0, 0.0)
        self.yaw = 0.0
        self.on_ground = True
        self.in_water = False
        self.time = 0.0
        self.nearby: List[Entity] = []
        self._connection: Any = None
        self._next_id = 0
        self._pending: Dict[str, _Action] = {}
        self._parked: List[_Action] = []
        self._handlers: "Deque[Tuple[Callable[..., Awaitable[None]], Tuple[Any, ...]]]" = deque()
        self._handler_waiting: Optional[asyncio.Event] = None
        self._handler_active = False
        self._routine_free: Optional[asyncio.Event] = None

    # What the author writes -------------------------------------------------------------

    async def routine(self) -> None:
        """What the character does, repeated while the program runs. By default it waits."""
        await self.wait(60)

    async def on_message(self, message: Message) -> None:
        """Someone said something the character heard: to it, or near it."""

    # Actions (PY-002.b) -----------------------------------------------------------------

    async def walk_to(
        self,
        target: Optional[Target] = None,
        *,
        x: Optional[float] = None,
        z: Optional[float] = None,
        speed: Optional[float] = None,
    ) -> None:
        """Walks to an element of the map (its id), an entity, or a point (x, z) in blocks."""
        fields = _target(target, x, z)
        if speed is not None:
            fields["speed"] = speed
        await self._act("walk_to", fields)

    async def look_at(
        self, target: Optional[Target] = None, *, x: Optional[float] = None, z: Optional[float] = None
    ) -> None:
        """Turns towards an element of the map, an entity, or a point."""
        await self._act("look_at", _target(target, x, z))

    async def say(self, text: str, to: Optional[Union[str, Entity]] = None) -> None:
        """Says something aloud, heard within 16 blocks; `to` (an id, or `player`) hears it
        wherever it is. Ends when the speech bubble goes away."""
        fields: Dict[str, Any] = {"text": text}
        if to is not None:
            fields["to"] = to if isinstance(to, str) else to.id
        await self._act("say", fields)

    async def follow(
        self,
        target: Union[str, Entity],
        distance: float = 3,
        speed: Optional[float] = None,
        seconds: Optional[float] = None,
    ) -> None:
        """Follows a character or the player, keeping `distance` blocks. Without `seconds` it
        goes on until another action; with `seconds` it returns after them and keeps following
        until the next action."""
        fields: Dict[str, Any] = {
            "target": target if isinstance(target, str) else target.id,
            "distance": distance,
        }
        if speed is not None:
            fields["speed"] = speed
        action = self._act("follow", fields)
        if seconds is None:
            await action
            return
        try:
            await asyncio.wait_for(asyncio.shield(action), seconds)
        except asyncio.TimeoutError:
            pass

    async def wait(self, seconds: float) -> None:
        """Stands still for some seconds of the world."""
        await self._act("wait", {"seconds": seconds})

    async def stop(self) -> None:
        """Stops the action in progress."""
        await self._act("stop", {})

    def log(self, *parts: Any) -> None:
        """Writes a line in the terminal of yw3d, with the character's id: for debugging."""
        print(*parts, file=sys.stderr, flush=True)

    # Running ------------------------------------------------------------------------------

    def _hello(self, hello: Dict[str, Any]) -> None:
        character = hello["character"]
        self.id = character["id"]
        self.name = character["name"]
        self.description = character.get("description")
        self.map = WorldMap(hello["map"])
        start = self.map.get(self.id)
        if start is not None:
            x, z = start.center
            self.position = Position(x, self.position.y, z)

    async def _main(self, connection: Any) -> None:
        """Runs the routine and the handlers until the host closes the channel."""
        self._connection = connection
        self._routine_free = asyncio.Event()
        self._routine_free.set()
        self._handler_waiting = asyncio.Event()
        connection.start()
        reader = asyncio.ensure_future(self._read())
        routine = asyncio.ensure_future(self._run_routine())
        handlers = asyncio.ensure_future(self._run_handlers())
        tasks = {reader, routine, handlers}
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _read(self) -> None:
        while True:
            message = await self._connection.receive()
            if message is None:
                return
            self._receive(message)

    async def _run_routine(self) -> None:
        _ROLE.set("routine")
        while True:
            before = self._next_id
            await self.routine()
            if self._next_id == before:
                # A routine that asks for nothing must not keep the program busy.
                await asyncio.sleep(0.5)

    async def _run_handlers(self) -> None:
        _ROLE.set("handler")
        assert self._handler_waiting is not None and self._routine_free is not None
        while True:
            while not self._handlers:
                self._handler_waiting.clear()
                await self._handler_waiting.wait()
            handler, args = self._handlers.popleft()
            self._handler_active = True
            self._routine_free.clear()
            try:
                await handler(*args)
            finally:
                self._handler_active = False
                if not self._handlers:
                    self._resume_routine()

    def _resume_routine(self) -> None:
        """After the handlers, the routine asks again for the action they interrupted."""
        assert self._routine_free is not None
        parked, self._parked = self._parked, []
        for action in parked:
            self._send(action)
        self._routine_free.set()

    def _handle(self, handler: Callable[..., Awaitable[None]], *args: Any) -> None:
        assert self._handler_waiting is not None
        self._handlers.append((handler, args))
        self._handler_waiting.set()

    def _overrides(self, name: str) -> bool:
        return getattr(type(self), name) is not getattr(Character, name)

    async def _act(self, kind: str, fields: Dict[str, Any]) -> None:
        role = _ROLE.get()
        assert self._routine_free is not None, "actions work only inside the running character"
        if role == "routine":
            # While a handler runs, the routine waits before its next action (PY-002.c).
            while not self._routine_free.is_set():
                await self._routine_free.wait()
        future: "asyncio.Future[None]" = asyncio.get_running_loop().create_future()
        self._send(_Action(kind, fields, role, future))
        await future

    def _send(self, action: _Action) -> None:
        self._next_id += 1
        id = f"{action.kind}-{self._next_id}"
        fields = action.remaining(self.time)
        action.sent_at = self.time
        action.fields = fields
        self._pending[id] = action
        self._connection.send({"type": action.kind, "id": id, **fields})

    def _receive(self, message: Dict[str, Any]) -> None:
        kind = message.get("type")
        if kind == "perception":
            self._perceive(message)
        elif kind == "map":
            self.map = WorldMap(message["map"])
        elif kind in ("action_done", "action_failed", "action_replaced"):
            self._outcome(kind, message)
        elif kind == "heard":
            self._heard(message)
        elif kind == "error":
            self.log(f"the host refused a message: {message.get('message')}")

    def _outcome(self, kind: str, message: Dict[str, Any]) -> None:
        action = self._pending.pop(message["id"], None)
        if action is None or action.future.done():
            return
        if kind == "action_done":
            action.future.set_result(None)
        elif kind == "action_failed":
            action.future.set_exception(ActionFailed(action.kind, message.get("reason", "")))
        elif action.role == "routine" and self._handler_active:
            # A handler took the character: the routine's action is asked again after it.
            self._parked.append(action)
        else:
            # Replaced by another action of the same code: it ends without errors (PY-002.b).
            action.future.set_result(None)

    def _perceive(self, message: Dict[str, Any]) -> None:
        self.time = message["time"]
        me = message["self"]
        self.position = Position(me["x"], me["y"], me["z"])
        self.yaw = me["yaw"]
        self.on_ground = me["on_ground"]
        self.in_water = me["in_water"]
        self.nearby = [
            Entity(
                id=e["id"],
                name=e.get("name", e["id"]),
                kind=e["kind"],
                x=e["x"],
                y=e["y"],
                z=e["z"],
                distance=e["distance"],
            )
            for e in message["nearby"]
        ]

    def _heard(self, message: Dict[str, Any]) -> None:
        mentions = message.get("mentions")
        heard = Message(
            sender=message["from"],
            sender_name=self.map.name_of(message["from"]),
            text=message["text"],
            to=message.get("to"),
            to_me=message.get("to") == self.id,
            mentions=self.map.get(mentions) if mentions else None,
            yes_no=message.get("yes_no"),
            distance=message.get("distance", 0.0),
        )
        if self._overrides("on_message"):
            self._handle(self.on_message, heard)


def _target(target: Optional[Target], x: Optional[float], z: Optional[float]) -> Dict[str, Any]:
    if target is None:
        if x is None or z is None:
            raise TypeError("give a target, or both x and z")
        return {"x": x, "z": z}
    if isinstance(target, str):
        return {"target": target}
    if isinstance(target, (tuple, list)) and len(target) == 2:
        return {"x": target[0], "z": target[1]}
    if hasattr(target, "id"):
        return {"target": target.id}
    raise TypeError(f"not a target: {target!r}")
