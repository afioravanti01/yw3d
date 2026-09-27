import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE } from '../blocks/builtin';
import { spawnCharacters } from '../characters/characters';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import type { Goal } from '../map/worldMap';
import { NavGrid } from '../nav/navGrid';
import { Pathfinder } from '../nav/pathfinding';
import { PhysicsWorld } from '../physics/physicsWorld';
import { createDefaultStructures } from '../structures/builtin';
import type { World } from '../world/world';
import { AgentWorld, type AgentEvent } from './agentWorld';

const registry = createDefaultRegistry();

/** A small valley with a hut, a pond, places and a character (MAP-003). */
const WORLD = `version: 2
name: Test
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }
places:
  - { id: pozzo, name: Pozzo, at: [30, 30] }
  - { id: orto, name: Orto, area: { rect: { from: [80, 20], to: [90, 30] } } }
structures:
  - { type: wooden_hut, id: capanno, name: Capanno, at: [64, 64], rotation: 90 }
  - { type: pond, id: laghetto, name: Laghetto, at: [64, 100], params: { radius: 8 } }
  - { type: birch, name: Betulla, at: [20, 60] }
characters:
  - { id: tobia, name: Tobia, at: [40, 40] }
  - { id: marta, name: Marta, at: [50, 44] }
`;

/** `change` edits the world after composing it, before the paths are searched. */
function setup(change?: (world: World) => void) {
  const result = composeWorld(WORLD, 'w.yaml', { registry: createDefaultStructures() });
  expect(result.diagnostics).toEqual([]);
  const world = result.world!;
  change?.(world);
  const physics = new PhysicsWorld(world, registry);
  const finder = new Pathfinder(new NavGrid(world, registry.solid));
  const characters = spawnCharacters(physics, result.characters);
  physics.step();
  const events: [string, AgentEvent][] = [];
  const agents = new AgentWorld(
    physics,
    characters,
    undefined,
    finder,
    { event: (id, e) => events.push([id, e]), perception: () => {} },
    result.goals,
  );
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) agents.step();
  };
  const state = (id: string) => characters.find((c) => c.start.id === id)!.entity.state;
  const outcome = (id: string) => events.find(([, e]) => 'id' in e && e.id === id)?.[1];
  return { result, world, agents, events, run, state, outcome, finder };
}

/** Arrival within 1 block of a corner of the column: at most 1 + √2 / 2 from its center. */
const ARRIVED = 1 + Math.SQRT1_2;

const columnsOf = (goal: Goal | undefined) => (goal as Extract<Goal, { kind: 'columns' }>).columns;

describe('elements of the map as destinations', () => {
  it('MAP-003.a, PROTO-001.b: walk_to and look_at take any id of the map; follow only who moves', () => {
    const { agents, run, state, outcome } = setup();
    agents.request('tobia', { kind: 'walk_to', id: 'w1', target: 'pozzo' });
    run(20);
    expect(outcome('w1')).toEqual({ type: 'action_done', id: 'w1' });
    expect(Math.hypot(state('tobia').x - 30.5, state('tobia').z - 30.5)).toBeLessThanOrEqual(1);
    // look_at an extended element looks at the center of its footprint.
    agents.request('tobia', { kind: 'look_at', id: 'l1', target: 'orto' });
    const yaw = agents.perceive('tobia').self.yaw;
    const s = state('tobia');
    expect(yaw).toBeCloseTo(Math.atan2(-(85 - s.x), -(25 - s.z)), 6);
    // follow: characters and the player only.
    agents.request('tobia', { kind: 'follow', id: 'f1', target: 'capanno', distance: 3 });
    expect(outcome('f1')).toEqual({
      type: 'action_failed',
      id: 'f1',
      reason: '"capanno" does not move: follow a character or the player',
    });
    agents.request('tobia', { kind: 'follow', id: 'f2', target: 'marta', distance: 3 });
    run(10);
    expect(
      Math.hypot(state('tobia').x - state('marta').x, state('tobia').z - state('marta').z),
    ).toBeLessThanOrEqual(3.5);
    agents.request('tobia', { kind: 'walk_to', id: 'w2', target: 'nessuno' });
    expect(outcome('w2')).toEqual({
      type: 'action_failed',
      id: 'w2',
      reason: 'there is no "nessuno" in the map',
    });
  });

  it('MAP-001.c: the protocol takes the generated ids too', () => {
    const { agents, run, outcome } = setup();
    agents.request('tobia', { kind: 'walk_to', id: 'w1', target: 'birch#1' });
    run(30);
    expect(outcome('w1')).toEqual({ type: 'action_done', id: 'w1' });
  });

  it('MAP-003.b: towards a house the character arrives in front of the door, outside', () => {
    const { agents, run, state, outcome, result } = setup();
    agents.request('tobia', { kind: 'walk_to', id: 'w', target: 'capanno', speed: 3 });
    run(40);
    expect(outcome('w')).toEqual({ type: 'action_done', id: 'w' });
    const door = columnsOf(result.goals.get('capanno'));
    const s = state('tobia');
    const nearest = Math.min(...door.map(([x, z]) => Math.hypot(s.x - (x + 0.5), s.z - (z + 0.5))));
    expect(nearest).toBeLessThanOrEqual(ARRIVED);
    // Outside the walls of the hut.
    const { from, to } = result.map!.entries.find((e) => e.id === 'capanno')!.shape as unknown as {
      from: [number, number];
      to: [number, number];
    };
    const insideWalls =
      s.x > from[0] + 2 && s.x < to[0] - 2 && s.z > from[1] + 2 && s.z < to[1] - 2;
    expect(insideWalls).toBe(false);
  });

  it('MAP-003.b: towards a pond the character arrives on the shore, at the nearest place along the way', () => {
    const { agents, run, state, outcome, result, finder } = setup();
    const shore = columnsOf(result.goals.get('laghetto'));
    for (const [id, start] of [
      ['tobia', 'west'],
      ['marta', 'north'],
    ] as const) {
      const from = { ...state(id) };
      agents.request(id, { kind: 'walk_to', id: `to-${start}`, target: 'laghetto', speed: 3 });
      // The way it takes is the shortest to any column of the shore.
      const best = Math.min(
        ...shore
          .map(([x, z]) => finder.find(from, { x: x + 0.5, z: z + 0.5 }))
          .map((r) => (r.ok ? r.length : Infinity)),
      );
      const region = result.goals.get('laghetto')!;
      expect(region.kind).toBe('columns');
      run(40);
      expect(outcome(`to-${start}`)).toEqual({ type: 'action_done', id: `to-${start}` });
      const s = state(id);
      expect(s.submerged).toBe(0);
      const walked = Math.min(
        ...shore.map(([x, z]) => Math.hypot(s.x - (x + 0.5), s.z - (z + 0.5))),
      );
      expect(walked).toBeLessThanOrEqual(ARRIVED);
      // Along the way, not farther than the best column (corners allow half a block).
      expect(Math.hypot(s.x - from.x, s.z - from.z)).toBeLessThanOrEqual(best + 1.5);
    }
  });

  it('MAP-003.c: a place that is a point, and an area: nearest point inside, or done at once when inside', () => {
    const { agents, run, state, outcome } = setup();
    agents.request('tobia', { kind: 'walk_to', id: 'area', target: 'orto', speed: 3 });
    run(30);
    expect(outcome('area')).toEqual({ type: 'action_done', id: 'area' });
    const s = state('tobia');
    // Inside the area: its column is one of the area's.
    expect(Math.floor(s.x)).toBeGreaterThanOrEqual(80);
    expect(Math.floor(s.x)).toBeLessThan(90);
    expect(Math.floor(s.z)).toBeGreaterThanOrEqual(20);
    expect(Math.floor(s.z)).toBeLessThan(30);
    // Inside already: completed in the same step.
    agents.request('marta', { kind: 'walk_to', id: 'there', target: 'orto' });
    run(30);
    const events: string[] = [];
    agents.request('marta', { kind: 'walk_to', id: 'again', target: 'orto' });
    events.push(JSON.stringify(outcome('again')));
    expect(events).toEqual([JSON.stringify({ type: 'action_done', id: 'again' })]);
  });

  it('MAP-003.d: an element with no reachable place fails with the cause', () => {
    // A ring of stone around the well: nobody can stand next to it any more.
    const { agents, outcome, run } = setup((world) => {
      for (let z = 24; z <= 36; z++) {
        for (let x = 24; x <= 36; x++) {
          if (Math.max(Math.abs(x - 30), Math.abs(z - 30)) < 4) continue;
          for (let y = 0; y < 96; y++) world.setBlock(x, y, z, STONE);
        }
      }
    });
    agents.request('tobia', { kind: 'walk_to', id: 'w', target: 'pozzo' });
    run(0.1);
    expect(outcome('w')).toEqual({
      type: 'action_failed',
      id: 'w',
      reason: 'there is no path to the destination',
    });
  });
});
