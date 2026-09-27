import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeWorld } from '../src/core/compose/composeWorld';
import { Simulation } from '../src/core/sim/simulation';
import type { World } from '../src/core/world/world';
import { createDefaultStructures } from '../src/core/structures/builtin';

// Time budgets run alone, after the other tests (plan F06, T6.19+).

/** Places of the village of the default world, where the villagers walk. */
const STOPS: readonly [string, number, number][] = [
  ['piazza', 158, 66],
  ['ovest', 132, 58],
  ['orti', 118, 86],
  ['sud', 150, 92],
  ['laghetto', 182, 104],
  ['nord', 180, 38],
];

function villagers(): string {
  const places = STOPS.map(([id, x, z]) => `  - { id: ${id}, name: ${id}, at: [${x}, ${z}] }`);
  const characters = Array.from({ length: 20 }, (_, i) => {
    const route = STOPS.map((_, k) => STOPS[(i + k) % STOPS.length]![0]).join(', ');
    return `  - { id: c${i}, name: C${i}, at: [${130 + (i % 5) * 8}, ${40 + Math.floor(i / 5) * 8}], behavior: { use: giro, params: { tappe: [${route}] } } }`;
  });
  return `
places:
${places.join('\n')}
behaviors:
  - name: giro
    params: { tappe: { type: list, of: id } }
    memory: { counters: [giri] }
    routine:
      - walk_to: $tappe
      - count: giri
      - if: { chance: 0.3 }
        then: [{ say: Che bella giornata! }]
      - wait: 1s
    reactions:
      - on: { near: player, within: 6 }
        every: 20s
        do: [{ look_at: player }, { say: Buongiorno! }]
characters:
${characters.join('\n')}
`;
}

describe('performance with behaviors', () => {
  it('PERF-006.a: with 20 characters driven by behaviors a host step costs at most 4 ms', () => {
    const file = 'worlds/default.yaml';
    const text = readFileSync(file, 'utf8') + villagers();
    const result = composeWorld(text, file, { registry: createDefaultStructures() });
    expect(result.diagnostics).toEqual([]);
    const sim = new Simulation(result as typeof result & { world: World });
    sim.step();
    const steps = 600;
    const start = performance.now();
    for (let i = 0; i < steps; i++) sim.step();
    expect((performance.now() - start) / steps).toBeLessThanOrEqual(4);
    // They really walked.
    const moved = result.characters.filter((c) => {
      const s = sim.agents.stateOf(c.id)!;
      return Math.hypot(s.x - c.x, s.z - c.z) > 5;
    });
    expect(moved.length).toBeGreaterThanOrEqual(18);
  });
});
