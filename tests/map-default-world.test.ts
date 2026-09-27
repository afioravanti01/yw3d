import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentWorld, type AgentEvent } from '../src/core/agents/agentWorld';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { resolveAppearance } from '../src/core/characters/appearance';
import { spawnCharacters } from '../src/core/characters/characters';
import { composeWorld } from '../src/core/compose/composeWorld';
import type { Goal } from '../src/core/map/worldMap';
import { NavGrid } from '../src/core/nav/navGrid';
import { Pathfinder } from '../src/core/nav/pathfinding';
import { PhysicsWorld } from '../src/core/physics/physicsWorld';
import { createDefaultStructures } from '../src/core/structures/builtin';

const file = 'worlds/default.yaml';
const result = composeWorld(readFileSync(file, 'utf8'), file, {
  registry: createDefaultStructures(),
});
const registry = createDefaultRegistry();
const finder = new Pathfinder(new NavGrid(result.world!, registry.solid));
/** Arrival within 1 block of a corner of the column: at most 1 + √2 / 2 from its center. */
const ARRIVED = 1 + Math.SQRT1_2;

/** Where the villagers start: the square and the corners of the village. */
const STARTS: readonly [number, number][] = [
  [158, 66],
  [120, 60],
  [195, 40],
  [170, 95],
];

describe('destinations in the default world', () => {
  it('MAP-003.b: from every corner of the village a character arrives in front of the door of every house', () => {
    const houses = result.map!.entries.filter(
      (e) => e.type === 'stone_farmhouse' || e.type === 'wooden_hut',
    );
    expect(houses).toHaveLength(6);
    for (const [sx, sz] of STARTS) {
      const physics = new PhysicsWorld(result.world!, registry);
      const characters = spawnCharacters(
        physics,
        houses.map((_, i) => ({
          id: `v${i}`,
          name: `v${i}`,
          description: undefined,
          x: sx + 0.5 + (i % 3),
          z: sz + 0.5 + Math.floor(i / 3),
          yaw: 0,
          appearance: resolveAppearance(undefined, 1, `v${i}`),
          command: undefined,
          program: undefined,
        })),
      );
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
      houses.forEach((h, i) =>
        agents.request(`v${i}`, { kind: 'walk_to', id: h.id, target: h.id, speed: 4 }),
      );
      for (let i = 0; i < 90 * 60 && events.length < houses.length; i++) agents.step();
      houses.forEach((h, i) => {
        const where = `${h.name} from [${sx}, ${sz}]`;
        expect(events.find(([id]) => id === `v${i}`)?.[1], where).toEqual({
          type: 'action_done',
          id: h.id,
        });
        const door = (result.goals.get(h.id) as Extract<Goal, { kind: 'columns' }>).columns;
        const s = characters[i]!.entity.state;
        const distance = Math.min(
          ...door.map(([x, z]) => Math.hypot(s.x - x - 0.5, s.z - z - 0.5)),
        );
        expect(distance, where).toBeLessThanOrEqual(ARRIVED);
      });
    }
  });
});
