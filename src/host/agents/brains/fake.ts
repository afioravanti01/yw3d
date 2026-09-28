import { understandElement } from '../../../core/dialogue/understand';
import { blocksToMeters } from '../../../core/world/units';
import type { Brain, BrainRequest, Thought } from '../brain';
import { surroundings } from '../context';

/**
 * A brain without an LLM (plan F08 P11, Q7): deterministic replies computed from the context,
 * to test the whole circuit and to try a world without keys or CLIs. It describes what it sees,
 * goes to an element named in a message, greets who comes near, and otherwise echoes.
 */
export class FakeBrain implements Brain {
  readonly name = 'fake';

  think(request: BrainRequest): Promise<Thought> {
    return Promise.resolve({
      reply: this.reply(request),
      usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    });
  }

  /** The reply to a request: what an LLM would say, computed from the context. */
  private reply({ input }: BrainRequest): unknown {
    const trigger = input.triggers.at(-1);
    const say = (text: string, to: string | null = null) => ({ text, to });
    if (trigger?.kind === 'continue') return { say: null, actions: [] };
    if (!trigger || trigger.kind === 'autonomous') {
      return {
        say: null,
        actions: [{ type: 'look_at', target: null, x: input.self.x + 5, z: input.self.z }],
      };
    }
    if (trigger.kind === 'near') {
      return { say: say(`Ciao ${trigger.whoName}!`, trigger.who), actions: [] };
    }
    if (trigger.kind === 'interact') {
      return { say: say('Dimmi pure.', 'player'), actions: [] };
    }
    const text = trigger.text.toLowerCase();
    if (/\b(vedi|guardi|intorno|see|around)\b/.test(text)) {
      const seen = surroundings(input.map, input.self, input.nearby)
        .slice(0, 6)
        .map((s) =>
          s.direction === 'here'
            ? `${s.name} (qui)`
            : `${s.name} (${s.direction}, ${blocksToMeters(s.distance).toFixed(0)} m)`,
        );
      return {
        say: say(seen.length ? `Vedo: ${seen.join(', ')}.` : 'Non vedo niente.', trigger.from),
        actions: [],
      };
    }
    const elements = input.map.entries.map((e) => ({ id: e.id, name: e.name }));
    const named = understandElement(trigger.text, elements);
    if (named && named !== input.identity.id) {
      const name = input.map.entries.find((e) => e.id === named)!.name;
      return {
        say: say(`Vado a ${name}.`, trigger.from),
        actions: [{ type: 'walk_to', target: named }],
      };
    }
    return { say: say(`Ho sentito: ${trigger.text}`, trigger.from), actions: [] };
  }
}
