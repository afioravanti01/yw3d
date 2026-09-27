"""The channel to the host: JSON messages, one per line, on stdin and stdout (PROTO-001)."""

import asyncio
import json
import sys
import threading
from typing import Any, BinaryIO, Dict, Optional, TextIO


class StdioConnection:
    """Reads the messages of the host on stdin and writes requests on stdout.

    Lines are read by a thread and handed to the event loop, so that reading works the same on
    every system. The program's own `print` goes to stderr, which the host shows in its
    terminal: stdout belongs to the protocol.
    """

    def __init__(self, stdin: Optional[BinaryIO] = None, stdout: Optional[TextIO] = None) -> None:
        self._in = stdin if stdin is not None else sys.stdin.buffer
        self._out = stdout if stdout is not None else sys.stdout
        if stdout is None:
            sys.stdout = sys.stderr
        self._queue: "Optional[asyncio.Queue[Optional[Dict[str, Any]]]]" = None

    def read_first(self) -> Dict[str, Any]:
        """The first message, read before the event loop starts: the `hello` of the host."""
        line = self._in.readline()
        if not line:
            raise SystemExit("yw3d: no hello from the host; run this program with yw3d")
        return json.loads(line)

    def start(self) -> None:
        """Starts reading the next messages; call it inside the event loop."""
        loop = asyncio.get_running_loop()
        queue: "asyncio.Queue[Optional[Dict[str, Any]]]" = asyncio.Queue()
        self._queue = queue

        def read() -> None:
            for line in self._in:
                if line.strip():
                    loop.call_soon_threadsafe(queue.put_nowait, json.loads(line))
            loop.call_soon_threadsafe(queue.put_nowait, None)

        threading.Thread(target=read, name="yw3d-stdin", daemon=True).start()

    async def receive(self) -> Optional[Dict[str, Any]]:
        """The next message of the host, or None when the host closed the channel."""
        assert self._queue is not None, "start() first"
        return await self._queue.get()

    def send(self, message: Dict[str, Any]) -> None:
        self._out.write(json.dumps(message, ensure_ascii=False) + "\n")
        self._out.flush()
