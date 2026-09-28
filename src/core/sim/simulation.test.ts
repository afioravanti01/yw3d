import { describe, expect, it } from 'vitest';
import type { AgentEvent, Perception } from '../agents/agentWorld';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createDefaultStructures } from '../structures/builtin';
import type { World } from '../world/world';
import { AIR, STONE } from '../blocks/builtin';
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
  it('DIALOG-001.b, DIALOG-002.a: without @ the characters within 16 blocks hear it; with @ only a character within 16 blocks, else «Personaggio non in prossimità»', () => {
    const lines: SpokenLine[] = [];
    const sim = simulation({ heard: (line) => lines.push(line) });
    sim.step();
    const marta = sink();
    const lontano = sink();
    sim.attach('marta', marta.listener);
    sim.attach('lontano', lontano.listener);
    expect(sim.playerSays('Buongiorno a tutti!')).toMatchObject({ ok: true });
    expect(marta.events).toEqual([
      expect.objectContaining({
        type: 'heard',
        from: 'player',
        text: 'Buongiorno a tutti!',
        to: null,
      }),
    ]);
    expect(lontano.events).toEqual([]);
    expect(sim.playerSaying).toBe('Buongiorno a tutti!');
    // With @: only a character near the player; Lontano, 85 blocks away, is refused (A7.5).
    expect(sim.playerSays('@lontano vieni qui!')).toEqual({
      ok: false,
      error: 'Personaggio non in prossimità',
    });
    expect(lontano.events).toEqual([]);
    sim.playerSays('@marta vieni qui!');
    expect(marta.events.at(-1)).toMatchObject({ text: 'vieni qui!', to: 'marta' });
    expect(sim.playerSays('ciao', { to: 'lontano' })).toMatchObject({ ok: false });
    // Every message of the world reaches the log, also far from the player.
    sim.agents.request('lontano', { kind: 'say', id: 's1', text: 'Arrivo!' });
    sim.step();
    expect(lines.map((l) => [l.fromName, l.toName, l.text])).toEqual([
      ['Ada', null, 'Buongiorno a tutti!'],
      ['Ada', 'Marta', 'vieni qui!'],
      ['Lontano', null, 'Arrivo!'],
    ]);
    // 1 to 500 characters.
    expect(sim.playerSays('   ')).toEqual({
      ok: false,
      error: 'a message has 1 to 500 characters',
    });
    expect(sim.playerSays('@marta').ok).toBe(false);
    expect(sim.playerSays('x'.repeat(501)).ok).toBe(false);
  });

  it('DIALOG-001.c: the addressee is only the one of @, by id or name; looking at a character does not count', () => {
    const sim = simulation();
    sim.step();
    const marta = sink();
    sim.attach('marta', marta.listener);
    expect(sim.playerSays('@marta ciao')).toMatchObject({
      ok: true,
      line: { to: 'marta', toName: 'Marta', text: 'ciao' },
    });
    expect(sim.playerSays('@Màrta, come va?')).toMatchObject({
      line: { to: 'marta', text: 'come va?' },
    });
    expect(marta.events.at(-1)).toMatchObject({ type: 'heard', to: 'marta', text: 'come va?' });
    expect(sim.playerSays('@nessuno ciao')).toEqual({
      ok: false,
      error:
        'no character is called "nessuno"; the characters are: Tobia (tobia), Marta (marta), Lontano (lontano)',
    });
    expect(marta.events).toHaveLength(2);
    // Looking straight at Marta says nothing about the addressee.
    const p = sim.player.state;
    const m = sim.agents.stateOf('marta')!;
    sim.view = { yaw: Math.atan2(-(m.x - p.x), -(m.z - p.z)), pitch: 0 };
    expect(sim.playerSays('eccoti')).toMatchObject({ line: { to: null } });
    // A channel may give the addressee (a client of the player).
    expect(sim.playerSays('ciao', { to: 'marta' })).toMatchObject({ line: { to: 'marta' } });
    expect(sim.playerSays('ciao', { to: 'nessuno' })).toEqual({
      ok: false,
      error: 'there is no character "nessuno"',
    });
  });

  it('DIALOG-003.e: the event of a sentence says whether it is a yes or a no', () => {
    const sim = simulation();
    sim.step();
    const marta = sink();
    sim.attach('marta', marta.listener);
    const yesNo = (text: string) => {
      sim.playerSays(text);
      return (marta.events.at(-1) as { yes_no: unknown }).yes_no;
    };
    expect(yesNo('@marta sì, certo')).toBe('yes');
    expect(yesNo('@marta no grazie')).toBe('no');
    expect(yesNo('@marta forse domani')).toBeNull();
    // The sentences of the characters too.
    sim.agents.request('tobia', { kind: 'say', id: 's1', text: 'Va bene!' });
    sim.step();
    expect(marta.events.at(-1)).toMatchObject({ from: 'tobia', yes_no: 'yes' });
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
      yes_no: null,
    });
    // The sentences of the characters too.
    sim.agents.request('tobia', { kind: 'say', id: 's1', text: 'Tutto bene al pozzo vecchio.' });
    sim.step();
    const fromTobia = marta.events.filter((e) => e.type === 'heard' && e.from === 'tobia');
    expect(fromTobia[0]).toMatchObject({ to: null, mentions: 'pozzo' });
  });

  it('LAB-004.b: blocks set during the simulation never go inside someone, and paths take them into account', () => {
    const sim = simulation();
    const { events, listener } = sink();
    sim.attach('tobia', listener);
    const tobia = sim.agents.stateOf('tobia')!;
    const at = [Math.floor(tobia.x), Math.floor(tobia.y), Math.floor(tobia.z)] as const;
    // A block where Tobia stands is left out; the others are set.
    const around = sim.editBlocks([at[0] - 1, at[1], at[2]], [at[0] + 1, at[1], at[2]], STONE);
    expect(around.skipped).toBeGreaterThan(0);
    expect(around.edits.length + around.skipped).toBeLessThanOrEqual(3);
    for (const [x, y, z] of around.edits) expect(sim.result.world.getBlock(x, y, z)).toBe(STONE);
    // Free way first: the walk towards the well starts without failing.
    sim.editBlocks([at[0] - 1, at[1], at[2]], [at[0] + 1, at[1], at[2]], AIR);
    sim.agents.request('tobia', { kind: 'walk_to', target: 'pozzo', id: 'w0' });
    for (let i = 0; i < 10; i++) sim.step();
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'action_failed', id: 'w0' }));
    // A wall across the whole world, as high as the world, between Tobia and the well.
    const wall = sim.editBlocks([0, 0, 43], [127, 95, 43], STONE);
    expect(wall.edits.length).toBeGreaterThan(0);
    sim.agents.request('tobia', { kind: 'walk_to', target: 'pozzo', id: 'w1' });
    for (let i = 0; i < 10; i++) sim.step();
    expect(events).toContainEqual(expect.objectContaining({ type: 'action_failed', id: 'w1' }));
  });

  it('LAB-004.a: a place that moves leads the characters to its new column; a sentence said without an action leaves the action running', () => {
    const sim = simulation();
    const { events, listener } = sink();
    sim.attach('marta', listener);
    sim.movePlace('pozzo', 42, 48);
    sim.agents.request('marta', { kind: 'walk_to', target: 'pozzo', id: 'w1' });
    for (let i = 0; i < 60 * 8; i++) sim.step();
    expect(events).toContainEqual(expect.objectContaining({ type: 'action_done', id: 'w1' }));
    const marta = sim.agents.stateOf('marta')!;
    expect(Math.hypot(marta.x - 42.5, marta.z - 48.5)).toBeLessThan(2);
    sim.agents.request('marta', { kind: 'wait', seconds: 5, id: 'w2' });
    const heard = sink();
    sim.attach('tobia', heard.listener);
    expect(sim.agents.speak('marta', 'Il pozzo si è spostato!', null)).toBeUndefined();
    expect(heard.events).toContainEqual(
      expect.objectContaining({ type: 'heard', from: 'marta', text: 'Il pozzo si è spostato!' }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'action_replaced', id: 'w2' }),
    );
    expect(sim.agents.speak('lontano', 'Ehi!', 'marta')).toBe('"marta" is not nearby');
  });
});
