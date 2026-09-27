import { describe, expect, it } from 'vitest';
import type { AgentEvent, Perception } from '../agents/agentWorld';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createDefaultStructures } from '../structures/builtin';
import type { World } from '../world/world';
import { Simulation, type SpokenLine } from './simulation';

const WORLD = `version: 2
name: Test
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }
player: { at: [40, 40], name: Ada }
places:
  - { id: pozzo, name: Pozzo vecchio, at: [50, 44] }
  - { id: prato, name: Prato, at: [30, 50] }
characters:
  - { id: tobia, name: Tobia, at: [44, 40] }
  - { id: marta, name: Marta, at: [40, 46] }
  - { id: lontano, name: Lontano, at: [100, 100] }
`;

function simulation(options: ConstructorParameters<typeof Simulation>[1] = {}) {
  const result = composeWorld(WORLD, 'w.yaml', { registry: createDefaultStructures() });
  expect(result.diagnostics).toEqual([]);
  return new Simulation(result as typeof result & { world: World }, options);
}

/** Collects what an external controller of a character receives. */
function sink() {
  const events: AgentEvent[] = [];
  const perceptions: Perception[] = [];
  return {
    events,
    perceptions,
    listener: {
      event: (_: string, e: AgentEvent) => events.push(e),
      perception: (_: string, p: Perception) => perceptions.push(p),
    },
  };
}

describe('the shared simulation', () => {
  it('DIALOG-001.b: a sentence of the player is heard by the characters within 16 blocks', () => {
    const lines: SpokenLine[] = [];
    const sim = simulation({ heard: (line) => lines.push(line) });
    sim.step();
    const marta = sink();
    const lontano = sink();
    sim.attach('marta', marta.listener);
    sim.attach('lontano', lontano.listener);
    const said = sim.playerSays('Buongiorno a tutti!');
    expect(said).toMatchObject({ ok: true });
    expect(marta.events).toEqual([
      expect.objectContaining({
        type: 'heard',
        from: 'player',
        text: 'Buongiorno a tutti!',
        to: null,
      }),
    ]);
    expect(lontano.events).toEqual([]);
    expect(lines.map((l) => [l.fromName, l.text])).toEqual([['Ada', 'Buongiorno a tutti!']]);
    expect(sim.playerSaying).toBe('Buongiorno a tutti!');
    // 1 to 500 characters.
    expect(sim.playerSays('   ')).toEqual({
      ok: false,
      error: 'a sentence has 1 to 500 characters',
    });
    expect(sim.playerSays('x'.repeat(501)).ok).toBe(false);
  });

  it('DIALOG-001.c: the addressee is @id, or the character looked at within 10°; an unknown @id is refused', () => {
    const sim = simulation();
    sim.step();
    const marta = sink();
    sim.attach('marta', marta.listener);
    expect(sim.playerSays('@marta ciao')).toMatchObject({
      ok: true,
      line: { to: 'marta', toName: 'Marta', text: 'ciao' },
    });
    expect(marta.events.at(-1)).toMatchObject({ type: 'heard', to: 'marta', text: 'ciao' });
    expect(sim.playerSays('@nessuno ciao')).toEqual({
      ok: false,
      error: 'there is no character "nessuno"',
    });
    expect(marta.events).toHaveLength(1);
    // Look at the middle of Marta's body, from the eyes of the player.
    const p = sim.player.state;
    const m = sim.agents.stateOf('marta')!;
    const toward = Math.atan2(-(m.x - p.x), -(m.z - p.z));
    const pitch = Math.atan2(m.y + 1.75 - (p.y + 3.2), Math.hypot(m.x - p.x, m.z - p.z));
    sim.view = { yaw: toward, pitch };
    expect(sim.lookedAt()).toBe('marta');
    expect(sim.playerSays('eccoti', { lookAt: true })).toMatchObject({ line: { to: 'marta' } });
    sim.view = { yaw: toward + (12 * Math.PI) / 180, pitch };
    expect(sim.lookedAt()).toBeUndefined();
    expect(sim.playerSays('eccoti', { lookAt: true })).toMatchObject({ line: { to: null } });
    // A channel may give the addressee (the console, a client).
    expect(sim.playerSays('ciao', { to: 'marta' })).toMatchObject({ line: { to: 'marta' } });
  });

  it('PROTO-002.a, PROTO-002.b: perception names who is near; sentences carry addressee and the element named', () => {
    const sim = simulation();
    const marta = sink();
    sim.attach('marta', marta.listener);
    sim.step();
    for (let i = 0; i < 30; i++) sim.step();
    const perception = marta.perceptions.at(-1)!;
    expect(perception.nearby.find((e) => e.id === 'player')).toMatchObject({ name: 'Ada' });
    expect(perception.nearby.find((e) => e.id === 'tobia')).toMatchObject({ name: 'Tobia' });
    sim.playerSays('@tobia vai al pozzo vecchio');
    expect(marta.events.at(-1)).toMatchObject({
      type: 'heard',
      from: 'player',
      to: 'tobia',
      mentions: 'pozzo',
    });
    // The sentences of the characters too.
    sim.agents.request('tobia', { kind: 'say', id: 's1', text: 'Tutto bene al pozzo vecchio.' });
    sim.step();
    const fromTobia = marta.events.filter((e) => e.type === 'heard' && e.from === 'tobia');
    expect(fromTobia[0]).toMatchObject({ to: null, mentions: 'pozzo' });
  });
});
