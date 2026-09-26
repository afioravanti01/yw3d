"""Controller of the guardiano (village guard) of the example valley.

It walks around the village, stops at the pond, and greets the player when it sees them close.
The yw3d protocol is JSON lines: messages from the host on stdin, requests on stdout; anything
written on stderr appears in the terminal of yw3d. Only the Python standard library is used.
"""

import json
import sys

# Round of the guard: points of the village (x, z in blocks), and the pond south of it.
ROUND = [(158, 66), (132, 58), (118, 86), (150, 92), (182, 104), (205, 64), (180, 38)]
GREET_DISTANCE = 10  # blocks: 5 m
GREET_AGAIN_AFTER = 30  # seconds

counter = 0
stop = 0
last_greeting = -GREET_AGAIN_AFTER
busy_greeting = False


def send(message):
    print(json.dumps(message), flush=True)


def new_id(kind):
    global counter
    counter += 1
    return f"{kind}-{counter}"


def log(text):
    print(text, file=sys.stderr, flush=True)


def walk_on():
    """Walks to the next point of the round, at a calm pace."""
    global stop
    x, z = ROUND[stop]
    stop = (stop + 1) % len(ROUND)
    send({"type": "walk_to", "id": new_id("walk"), "x": x, "z": z, "speed": 1.3})


for line in sys.stdin:
    message = json.loads(line)
    kind = message["type"]

    if kind == "hello":
        log(f"guardiano ready, protocol {message['version']}")
        walk_on()

    elif kind == "perception":
        # Greet the player once in a while, when they come close.
        player = next((e for e in message["nearby"] if e["kind"] == "player"), None)
        now = message["time"]
        if player and player["distance"] <= GREET_DISTANCE and now - last_greeting > GREET_AGAIN_AFTER:
            last_greeting = now
            busy_greeting = True
            send({"type": "look_at", "id": new_id("look"), "target": "player"})
            send({"type": "say", "id": new_id("greet"), "text": "Buongiorno, viandante! Benvenuto nella valle."})

    elif kind == "interacted":
        busy_greeting = True
        send({"type": "look_at", "id": new_id("look"), "target": "player"})
        send({"type": "say", "id": new_id("greet"), "text": "Il laghetto è a sud del borgo: chiedi alla pescatrice."})

    elif kind == "action_done":
        if message["id"].startswith("greet"):
            busy_greeting = False
            walk_on()
        elif message["id"].startswith("walk"):
            if stop == ROUND.index((182, 104)) + 1:
                send({"type": "say", "id": new_id("say"), "text": "Tutto tranquillo al laghetto."})
            else:
                walk_on()
        elif message["id"].startswith("say"):
            walk_on()

    elif kind == "action_failed":
        log(f"action {message['id']} failed: {message['reason']}")
        if not busy_greeting:
            walk_on()

    elif kind == "action_replaced":
        pass

    elif kind == "error":
        log(f"the host says: {message['message']}")
