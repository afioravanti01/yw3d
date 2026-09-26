import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE } from '../blocks/builtin';
import { spawnCharacters } from '../characters/characters';
import { resolveAppearance } from '../characters/appearance';
import type { CharacterStart } from '../compose/composeWorld';
import { NavGrid } from '../nav/navGrid';
import { Pathfinder } from '../nav/pathfinding';
import { PhysicsWorld } from '../physics/physicsWorld';
import { spawnPlayer } from '../player/player';
import { World } from '../world/world';
import { AgentWorld, type AgentEvent, type Perception } from './agentWorld';

const registry = createDefaultRegistry();

const start = (id: string, x: number, z: number): CharacterStart => ({
  id,
  name: id,
  description: undefined,
  x,
  z,
  yaw: 0,
  appearance: resolveAppearance(undefined, 1, id),
  command: undefined,
});

function setup(
  starts: CharacterStart[],
  player?: [number, number],
  findPath?: ConstructorParameters<typeof AgentWorld>[3],
) {
  const world = new World({ x: 128, y: 32, z: 128 });
  for (let z = 0; z < 128; z++)
    for (let x = 0; x < 128; x++) for (let y = 0; y < 10; y++) world.setBlock(x, y, z, STONE);
  const physics = new PhysicsWorld(world, registry);
  const finder = new Pathfinder(new NavGrid(world, registry.solid));
  const characters = spawnCharacters(physics, starts);
  const playerEntity = player ? spawnPlayer(physics, player[0], player[1]) : undefined;
  const events: [string, AgentEvent][] = [];
  const perceptions: [string, Perception][] = [];
  const agents = new AgentWorld(
    physics,
    characters,
    playerEntity,
    findPath ?? ((f, t) => finder.find(f, t)),
    {
      event: (id, e) => events.push([id, e]),
      perception: (id, p) => perceptions.push([id, p]),
    },
  );
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) agents.step();
  };
  const state = (id: string) => characters.find((c) => c.start.id === id)!.entity.state;
  return { agents, events, perceptions, run, state, player: playerEntity, finder, physics };
}

describe('actions', () => {
  it('PROTO-001.b: walk_to, look_at, wait and stop end with their outcome', () => {
    const { agents, events, run, state } = setup([start('a', 20.5, 20.5), start('b', 40.5, 20.5)]);
    agents.request('a', { kind: 'walk_to', id: 'w1', x: 60, z: 60, speed: 4 });
    run(15);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 'w1' }]);
    expect(Math.hypot(state('a').x - 60, state('a').z - 60)).toBeLessThanOrEqual(1);
    // Towards an entity.
    agents.request('a', { kind: 'walk_to', id: 'w2', target: 'b', speed: 4 });
    run(15);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 'w2' }]);
    // look_at turns at once; wait lasts its time; stop ends at once.
    agents.request('a', { kind: 'look_at', id: 'l1', x: state('a').x + 10, z: state('a').z });
    run(0.1);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 'l1' }]);
    expect(agents.perceive('a').self.yaw).toBeCloseTo(-Math.PI / 2, 6);
    agents.request('a', { kind: 'wait', id: 'x1', seconds: 1 });
    run(0.9);
    expect(events).not.toContainEqual(['a', { type: 'action_done', id: 'x1' }]);
    run(0.2);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 'x1' }]);
    agents.request('a', { kind: 'stop', id: 's1' });
    run(0.05);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 's1' }]);
    // Unknown targets fail with the cause.
    agents.request('a', { kind: 'walk_to', id: 'w3', target: 'nobody' });
    expect(events).toContainEqual([
      'a',
      { type: 'action_failed', id: 'w3', reason: 'there is no entity "nobody"' },
    ]);
  });

  it('PROTO-001.b: say is heard nearby and lasts in proportion to its length; follow keeps the distance', () => {
    const { agents, events, run, state } = setup([
      start('a', 20.5, 20.5),
      start('near', 26.5, 20.5),
      start('far', 100.5, 100.5),
    ]);
    agents.request('a', { kind: 'say', id: 's1', text: 'Buongiorno!' });
    expect(events.filter(([, e]) => e.type === 'heard')).toEqual([
      ['near', { type: 'heard', from: 'a', text: 'Buongiorno!', distance: 6 }],
    ]);
    expect(agents.views().find((v) => v.id === 'a')!.speech).toBe('Buongiorno!');
    // 1 s + 0.06 s × 11 characters = 1.66 s.
    run(1.6);
    expect(events).not.toContainEqual(['a', { type: 'action_done', id: 's1' }]);
    run(0.1);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 's1' }]);
    expect(agents.views().find((v) => v.id === 'a')!.speech).toBeNull();
    agents.request('far', { kind: 'follow', id: 'f1', target: 'a', distance: 4, speed: 5 });
    run(25);
    const d = Math.hypot(state('far').x - state('a').x, state('far').z - state('a').z);
    expect(d).toBeLessThanOrEqual(5);
    expect(events.some(([id, e]) => id === 'far' && e.type !== 'heard')).toBe(false);
  });

  it('PROTO-001.b: characters walk at 1.5 m/s by default, or at the speed asked for (A5.1)', () => {
    const measure = (speed: number | undefined) => {
      const { agents, run, state } = setup([start('a', 10.5, 20.5)]);
      run(0.2);
      agents.request('a', {
        kind: 'walk_to',
        id: 'w',
        x: 110,
        z: 20.5,
        ...(speed ? { speed } : {}),
      });
      run(1);
      const x0 = state('a').x;
      run(2);
      // Blocks per second → m/s.
      return (state('a').x - x0) / 2 / 2;
    };
    expect(measure(undefined)).toBeCloseTo(1.5, 1);
    expect(measure(0.8)).toBeCloseTo(0.8, 1);
    expect(measure(6)).toBeCloseTo(6, 1);
  });

  it('PROTO-001.c: a new action replaces the running one, which ends as replaced', () => {
    const { agents, events, run } = setup([start('a', 20.5, 20.5)]);
    agents.request('a', { kind: 'walk_to', id: 'first', x: 100, z: 100 });
    run(0.5);
    agents.request('a', { kind: 'walk_to', id: 'second', x: 20, z: 40 });
    expect(events).toContainEqual(['a', { type: 'action_replaced', id: 'first' }]);
    run(20);
    expect(events).toContainEqual(['a', { type: 'action_done', id: 'second' }]);
    expect(events).not.toContainEqual(['a', { type: 'action_done', id: 'first' }]);
  });

  it('PROTO-006.b: an action that runs past its time limit fails with the cause', () => {
    // A misleading search: a path of one point, while the destination is 100 blocks away. The
    // limit (twice the path at walking speed, plus 5 s) expires long before the arrival.
    const { agents, events, run } = setup([start('a', 10.5, 10.5)], undefined, (from) => ({
      ok: true,
      points: [{ x: from.x, y: from.y, z: from.z, wet: false }],
      length: 0,
    }));
    agents.request('a', { kind: 'walk_to', id: 'far', x: 110, z: 10 });
    run(4.9);
    expect(events).toEqual([]);
    run(0.2);
    expect(events).toEqual([
      ['a', { type: 'action_failed', id: 'far', reason: 'time limit reached before arriving' }],
    ]);
  });
});

describe('perception and events', () => {
  it('PROTO-002.a: perception 4 times per second, with the entities within 32 blocks', () => {
    const { run, perceptions } = setup(
      [start('a', 20.5, 20.5), start('near', 30.5, 20.5), start('far', 100.5, 100.5)],
      [22.5, 20.5],
    );
    run(10);
    const mine = perceptions.filter(([id]) => id === 'a').map(([, p]) => p);
    // 4 per second: 40 in 10 s, plus the first one at the start.
    expect(mine).toHaveLength(41);
    const last = mine.at(-1)!;
    expect(last).toMatchObject({
      type: 'perception',
      self: { x: 20.5, z: 20.5, on_ground: true, in_water: false },
      action: null,
    });
    expect(last.nearby.map((e) => [e.id, e.kind])).toEqual([
      ['player', 'player'],
      ['near', 'character'],
    ]);
    expect(last.nearby[0]!.distance).toBeCloseTo(2, 6);
  });

  it('PROTO-002.b: sentences, interactions and outcomes arrive at once, not with the perception', () => {
    const { agents, events } = setup([start('a', 20.5, 20.5), start('b', 24.5, 20.5)]);
    agents.request('a', { kind: 'say', id: 's', text: 'Ciao' });
    agents.request('b', { kind: 'look_at', id: 'l', target: 'a' });
    // Before any step: the sentence is already heard.
    expect(events).toContainEqual(['b', { type: 'heard', from: 'a', text: 'Ciao', distance: 4 }]);
    agents.step();
    expect(events).toContainEqual(['b', { type: 'action_done', id: 'l' }]);
  });

  it('PROTO-002.c: E near a character sends it an interaction; too far, nothing', () => {
    const near = setup([start('a', 20.5, 20.5), start('b', 23.5, 20.5)], [21.5, 20.5]);
    near.agents.step();
    expect(near.agents.interact()).toBe('a');
    expect(near.events).toContainEqual(['a', { type: 'interacted', by: 'player' }]);
    const far = setup([start('a', 20.5, 20.5)], [40.5, 20.5]);
    far.agents.step();
    expect(far.agents.interact()).toBeUndefined();
    expect(far.events).toEqual([]);
  });
});
