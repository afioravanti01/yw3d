import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentWorld } from '../src/core/agents/agentWorld';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { resolveAppearance } from '../src/core/characters/appearance';
import { spawnCharacters } from '../src/core/characters/characters';
import { composeWorld } from '../src/core/compose/composeWorld';
import { NavGrid } from '../src/core/nav/navGrid';
import { Pathfinder } from '../src/core/nav/pathfinding';
import { PhysicsWorld } from '../src/core/physics/physicsWorld';
import { createDefaultStructures } from '../src/core/structures/builtin';

describe('performance with characters', () => {
  it('PERF-005.b: with 20 walking characters a host step costs at most 4 ms', () => {
    const file = 'worlds/default.yaml';
    const { world } = composeWorld(readFileSync(file, 'utf8'), file, {
      registry: createDefaultStructures(),
    });
    const registry = createDefaultRegistry();
    const physics = new PhysicsWorld(world!, registry);
    const finder = new Pathfinder(new NavGrid(world!, registry.solid));
    const starts = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      x: 130 + (i % 5) * 8 + 0.5,
      z: 40 + Math.floor(i / 5) * 8 + 0.5,
      yaw: 0,
      appearance: resolveAppearance(undefined, 1, `c${i}`),
      command: undefined,
    }));
    const agents = new AgentWorld(
      physics,
      spawnCharacters(physics, starts),
      undefined,
      (f, t) => finder.find(f, t),
      {
        event: () => {},
        perception: () => {},
      },
    );
    agents.step();
    // Every character walks somewhere across the village, finding its path at the start.
    starts.forEach((s, i) =>
      agents.request(s.id, { kind: 'walk_to', id: 'go', x: 100 + i * 5, z: 100 }),
    );
    const steps = 600;
    const start = performance.now();
    for (let i = 0; i < steps; i++) agents.step();
    expect((performance.now() - start) / steps).toBeLessThanOrEqual(4);
  });
});
