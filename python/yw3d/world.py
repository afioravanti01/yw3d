"""What a character knows of the world: positions, entities nearby, the map, messages."""

import math
from dataclasses import dataclass
from typing import Any, Dict, Iterator, List, Optional, Tuple


@dataclass(frozen=True)
class Position:
    """A point of the world, in blocks (1 block = 0.5 m); y is the height."""

    x: float
    y: float
    z: float

    def distance_to(self, other: Any) -> float:
        """Distance in blocks to anything with x, y and z (a position, an entity)."""
        return math.hypot(self.x - other.x, self.y - other.y, self.z - other.z)


@dataclass(frozen=True)
class Entity:
    """A character or the player within 32 blocks, as the character perceives it."""

    id: str
    name: str
    kind: str
    x: float
    y: float
    z: float
    distance: float

    @property
    def is_player(self) -> bool:
        return self.kind == "player"


@dataclass(frozen=True)
class MapEntry:
    """An element of the map: a place, a structure, a group of structures, a character."""

    id: str
    name: str
    kind: str
    description: Optional[str]
    shape: Dict[str, Any]
    type: Optional[str] = None

    @property
    def center(self) -> Tuple[float, float]:
        """The middle of the element, x and z in blocks."""
        shape = self.shape
        if shape["kind"] == "point":
            return (shape["x"], shape["z"])
        if shape["kind"] == "circle":
            return (shape["center"][0], shape["center"][1])
        (x0, z0), (x1, z1) = shape["from"], shape["to"]
        return ((x0 + x1) / 2, (z0 + z1) / 2)

    @staticmethod
    def from_message(data: Dict[str, Any]) -> "MapEntry":
        return MapEntry(
            id=data["id"],
            name=data["name"],
            kind=data["kind"],
            description=data.get("description"),
            shape=data["shape"],
            type=data.get("type"),
        )


class WorldMap:
    """Every element of the world by id (MAP-002): `world_map["laghetto1"]`, `for e in world_map`."""

    def __init__(self, data: Dict[str, Any]) -> None:
        self.name: str = data.get("name", "")
        self.description: Optional[str] = data.get("description")
        self._entries: Dict[str, MapEntry] = {}
        for entry in data.get("entries", []):
            self._entries[entry["id"]] = MapEntry.from_message(entry)

    def __getitem__(self, id: str) -> MapEntry:
        return self._entries[id]

    def get(self, id: str) -> Optional[MapEntry]:
        return self._entries.get(id)

    def __contains__(self, id: object) -> bool:
        return id in self._entries

    def __iter__(self) -> Iterator[MapEntry]:
        return iter(self._entries.values())

    def __len__(self) -> int:
        return len(self._entries)

    def of_kind(self, kind: str) -> List[MapEntry]:
        """The elements of one kind: `place`, `structure`, `scatter`, `character`, `player`."""
        return [e for e in self._entries.values() if e.kind == kind]

    def name_of(self, id: str) -> str:
        entry = self._entries.get(id)
        return entry.name if entry else id


@dataclass(frozen=True)
class Message:
    """Something said that the character heard: by the player or by another character."""

    sender: str
    """Id of who said it: a character, or `player`."""
    sender_name: str
    text: str
    to: Optional[str]
    """Id of whom it was said to, if to someone."""
    to_me: bool
    """Whether it was said to this character."""
    mentions: Optional[MapEntry]
    """The element of the map the message names, when it names exactly one (DIALOG-003)."""
    yes_no: Optional[str]
    """`"yes"` or `"no"` when the message says yes or no (DIALOG-003)."""
    distance: float

    @property
    def from_player(self) -> bool:
        return self.sender == "player"

    @property
    def is_yes(self) -> bool:
        return self.yes_no == "yes"

    @property
    def is_no(self) -> bool:
        return self.yes_no == "no"
