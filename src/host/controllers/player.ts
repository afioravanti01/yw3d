import type { SpokenLine } from '../../core/sim/simulation';
import {
  CONTROLLER_PROTOCOL_VERSION,
  parsePlayerMessage,
  type HostToPlayer,
} from '../../protocol/controller';
import type { HostSession } from '../session';

/**
 * A client on the WebSocket that speaks as the player (PROTO-007, plan F06 P13): it says
 * sentences, with an addressee if it wants, and hears what the player hears.
 */
export class PlayerLink {
  private readonly stop: () => void;

  constructor(
    private readonly session: HostSession,
    private readonly send: (message: HostToPlayer) => void,
  ) {
    const { result } = session.world!;
    const size = result.world.size;
    send({
      type: 'hello',
      version: CONTROLLER_PROTOCOL_VERSION,
      player: { id: 'player', name: result.playerName! },
      world: { size: [size.x, size.y, size.z] },
      map: result.map!,
    });
    this.stop = session.listen((line) => this.heard(line));
  }

  /** A message of the client. */
  receive(text: string): void {
    if (text.trim() === '') return;
    const parsed = parsePlayerMessage(text);
    if (!parsed.ok) return this.send(parsed.error);
    const said = this.session.playerSays(parsed.text, { to: parsed.to ?? null });
    if (!said.ok) this.send({ type: 'error', message: said.error });
  }

  close(): void {
    this.stop();
  }

  private heard(line: SpokenLine): void {
    this.send({
      type: 'heard',
      from: line.from,
      from_name: line.fromName,
      to: line.to,
      to_name: line.toName,
      text: line.text,
    });
  }
}
