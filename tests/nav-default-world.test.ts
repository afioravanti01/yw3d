import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { composeWorld, type ComposeResult } from '../src/core/compose/composeWorld';
import { createRng } from '../src/core/math/rng';
import { HEADROOM, NavGrid } from '../src/core/nav/navGrid';
import { MAX_DROP, MAX_STEP_UP, Pathfinder, type PathPoint } from '../src/core/nav/pathfinding';
import { PathFollower } from '../src/core/nav/pathFollower';
import { STEP_SECONDS } from '../src/core/physics/constants';
import { PhysicsWorld } from '../src/core/physics/physicsWorld';
import { spawnPlayer } from '../src/core/player/player';
import { createDefaultStructures } from '../src/core/structures/builtin';
import { houseLayout, type HouseStyle } from '../src/core/structures/houses';
import type { World } from '../src/core/world/world';

const registry = createDefaultRegistry();
let result: ComposeResult;
let finder: Pathfinder;

beforeAll(() => {
  const file = 'worlds/default.yaml';
  result = composeWorld(readFileSync(file, 'utf8'), file, { registry: createDefaultStructures() });
  finder = new Pathfinder(new NavGrid(result.world!, registry.solid));
}, 60_000);

/** Every point stands on its 4 columns with free space above, steps within the limits. */
function checkPath(world: World, points: readonly PathPoint[]): void {
  for (const [i, p] of points.entries()) {
    for (const [cx, cz] of [
      [p.x - 1, p.z - 1],
      [p.x, p.z - 1],
      [p.x - 1, p.z],
      [p.x, p.z],
    ]) {
      for (let k = 0; k < HEADROOM; k++) {
        expect(registry.solid[world.getBlock(cx!, p.y + k, cz!)]).toBe(0);
      }
    }
    if (i === 0) continue;
    const q = points[i - 1]!;
    expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.z - q.z))).toBe(1);
    expect(p.y - q.y).toBeLessThanOrEqual(MAX_STEP_UP);
    expect(q.y - p.y).toBeLessThanOrEqual(MAX_DROP);
  }
}

const inverse = (x: number, z: number, rotation: number): [number, number] => {
  switch (rotation) {
    case 90:
      return [z, -x];
    case 180:
      return [-x, -z];
    case 270:
      return [-z, x];
    default:
      return [x, z];
  }
};

describe('path search in the default world', () => {
  it('NAV-001.a: paths exist between reachable places and keep the limits', () => {
    const cases = [
      [
        { x: 158.5, y: 34, z: 66.5 },
        { x: 450, z: 66 },
      ],
      [
        { x: 20, y: 40, z: 20 },
        { x: 490, z: 490 },
      ],
      [
        { x: 450, y: 40, z: 66 },
        { x: 330, z: 420 },
      ],
    ] as const;
    for (const [from, to] of cases) {
      const path = finder.find(
        { ...from, y: finder.grid.point(finder.nearestNode(from.x, from.y, from.z)).y },
        to,
      );
      if (!path.ok) throw new Error(path.reason);
      checkPath(result.world!, path.points);
      const end = path.points.at(-1)!;
      expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThanOrEqual(2);
    }
  });

  it('NAV-001.a: from outside to inside a house the path goes through the door', () => {
    const houses = result.placements.filter(
      (p) => p.type === 'stone_farmhouse' || p.type === 'wooden_hut',
    );
    for (const house of houses) {
      const { width, depth } = house.params as { width: number; depth: number };
      const layout = houseLayout(house.type as HouseStyle, width, depth, createRng(house.seed));
      // From 12 blocks behind the house (north, local) to its middle.
      const [bx, bz] = inverse(0, layout.z0 - 12, (360 - house.rotation) % 360);
      const from = finder.grid.point(finder.nearestNode(house.x + bx, 60, house.z + bz));
      const [mx, mz] = inverse(0, 0, (360 - house.rotation) % 360);
      const path = finder.find(from, { x: house.x + mx, z: house.z + mz });
      if (!path.ok) throw new Error(`${house.source}: ${path.reason}`);
      checkPath(result.world!, path.points);
      const throughDoor = path.points.some((p) => {
        const [lx, lz] = inverse(p.x - house.x, p.z - house.z, house.rotation);
        return lx === layout.doorX + 1 && (lz === layout.z1 - 1 || lz === layout.z1);
      });
      expect(throughDoor, house.source).toBe(true);
    }
  });

  it('NAV-001.d: a path across the whole world takes at most 50 ms', () => {
    const from = finder.grid.point(finder.nearestNode(20, 40, 20));
    finder.find(from, { x: 490, z: 490 });
    const start = performance.now();
    const runs = 5;
    for (let i = 0; i < runs; i++) {
      expect(finder.find(from, { x: 490 - i, z: 490 }).ok).toBe(true);
    }
    expect((performance.now() - start) / runs).toBeLessThanOrEqual(50);
  });

  it('NAV-002.a: a character walks from behind each house to its middle, through the door', () => {
    const houses = result.placements.filter(
      (p) => p.type === 'stone_farmhouse' || p.type === 'wooden_hut',
    );
    for (const house of houses) {
      const { width, depth } = house.params as { width: number; depth: number };
      const layout = houseLayout(house.type as HouseStyle, width, depth, createRng(house.seed));
      const physics = new PhysicsWorld(result.world!, registry);
      const [bx, bz] = inverse(0, layout.z0 - 12, (360 - house.rotation) % 360);
      const entity = spawnPlayer(physics, house.x + bx + 0.5, house.z + bz + 0.5);
      physics.step();
      const [mx, mz] = inverse(0, 0, (360 - house.rotation) % 360);
      const follower = new PathFollower(
        (f, t) => finder.find(f, t),
        { x: house.x + mx, z: house.z + mz },
        entity.state,
        0,
      );
      let time = 0;
      for (let i = 0; i < 60 / STEP_SECONDS && follower.status.kind === 'moving'; i++) {
        time += STEP_SECONDS;
        entity.intent = follower.update(entity.state, time);
        physics.step();
      }
      expect(follower.status, house.source).toEqual({ kind: 'arrived' });
    }
  });
});
