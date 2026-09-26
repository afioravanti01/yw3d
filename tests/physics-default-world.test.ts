import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { composeWorld } from '../src/core/compose/composeWorld';
import { boxIntersectsSolid, boxOf } from '../src/core/physics/collide';
import { IDLE } from '../src/core/physics/entity';
import { PhysicsWorld } from '../src/core/physics/physicsWorld';
import { createDefaultStructures } from '../src/core/structures/builtin';

const registry = createDefaultRegistry();
const SIZE = { width: 1.2, height: 3.5 };

describe('physics in the default world', () => {
  it('PHYS-004.a: after every step the entity overlaps no solid block (10 000 random steps)', () => {
    const file = 'worlds/default.yaml';
    const { world } = composeWorld(readFileSync(file, 'utf8'), file, {
      registry: createDefaultStructures(),
    });
    const physics = new PhysicsWorld(world!, registry);
    const isSolid = (x: number, y: number, z: number) => physics.isSolid(x, y, z);
    // Start in the village, where there are walls, doors and trees.
    const entity = physics.spawn(SIZE, 150.5, 30, 60.5);
    let seed = 12345;
    const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    let overlaps = 0;
    for (let i = 0; i < 10_000; i++) {
      if (i % 30 === 0) {
        const a = random() * 2 - 1;
        const b = random() * 2 - 1;
        const length = Math.hypot(a, b) || 1;
        entity.intent = { ...IDLE, moveX: a / length, moveZ: b / length, run: random() < 0.5 };
      }
      physics.step();
      if (boxIntersectsSolid(boxOf(entity.state, SIZE), isSolid)) overlaps++;
    }
    expect(overlaps).toBe(0);
  });
});
