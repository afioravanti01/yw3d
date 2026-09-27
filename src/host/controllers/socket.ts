import { parseControllerMessage, type ControllerError } from '../../protocol/controller';
import type { HostSession } from '../session';
import { PREFIX, type Terminal } from '../terminal';
import { ControllerLink } from './link';
import { PlayerLink } from './player';

/** The part of a WebSocket (the `ws` package) that a controller connection needs. */
export interface ControllerSocket {
  readonly bufferedAmount: number;
  send(text: string): void;
  close(): void;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
}

/** Above this many bytes waiting to be sent, the client counts as full (PROTO-006.a). */
const BUFFER_LIMIT = 64 * 1024;
const DRAIN_CHECK_MS = 200;

/**
 * A client on the WebSocket `/controller` (PROTO-004, plan F05 P10): its first message says
 * which character it drives; from then on it speaks the same protocol as stdio controllers.
 */
export function attachControllerSocket(
  socket: ControllerSocket,
  session: HostSession,
  terminal: Terminal,
  now: () => number,
): void {
  let link: ControllerLink | undefined;
  let player: PlayerLink | undefined;
  let drainTimer: ReturnType<typeof setInterval> | undefined;
  const refuse = (message: string) => {
    const error: ControllerError = { type: 'error', message };
    socket.send(JSON.stringify(error));
    socket.close();
  };

  socket.on('message', (data) => {
    const text = String(data);
    if (link) {
      link.receive(text);
      return;
    }
    if (player) {
      player.receive(text);
      return;
    }
    const parsed = parseControllerMessage(text);
    if (!parsed.ok) return refuse(parsed.error.message);
    if (parsed.message.kind === 'player') {
      if (!session.world) return refuse('there is no world yet');
      // Speaks as the player (PROTO-007).
      player = new PlayerLink(session, (message) => socket.send(JSON.stringify(message)));
      terminal.line(`${PREFIX}  a client on the WebSocket speaks as the player`);
      return;
    }
    if (parsed.message.kind !== 'control') {
      return refuse(
        'the first message must be {"type": "control", "character": "…"} or {"type": "player"}',
      );
    }
    const id = parsed.message.character;
    if (!session.agents?.ids.includes(id)) return refuse(`there is no character "${id}"`);
    if (session.isControlled(id)) return refuse(`the character "${id}" already has a controller`);
    link = new ControllerLink(
      id,
      session,
      {
        send: (message) => {
          socket.send(message);
          return socket.bufferedAmount < BUFFER_LIMIT;
        },
      },
      terminal,
      now,
    );
    terminal.line(`${PREFIX}  [${id}] driven by a client on the WebSocket`);
    link.start();
    // The `ws` package has no drain event: check the buffer now and then.
    drainTimer = setInterval(() => {
      if (socket.bufferedAmount < BUFFER_LIMIT) link?.drained();
    }, DRAIN_CHECK_MS);
  });

  socket.on('close', () => {
    if (drainTimer) clearInterval(drainTimer);
    player?.close();
    if (!link) return;
    link.close();
    terminal.line(
      `${PREFIX}  [${link.characterId}] the WebSocket client left: the character stops`,
    );
  });
}
