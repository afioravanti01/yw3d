import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../blocks/builtin';
import { World } from '../world/world';
import { STEP_SECONDS, WALK_SPEED } from './constants';
import { IDLE, type EntityState, type Intent } from './entity';
import { FixedStepper, MAX_STEPS_PER_FRAME } from './fixedStep';
import { PhysicsWorld } from './physicsWorld';

const registry = createDefaultRegistry();
const SIZE = { width: 1.2, height: 3.5 };

function emptyWorld() {
  return new PhysicsWorld(new World({ x: 64, y: 64, z: 64 }), registry);
}

/** Deterministic pseudo-random intents, the same for every run. */
function intentAt(i: number): Intent {
  const a = ((i * 2654435761) >>> 0) / 4294967296;
  const b = ((i * 40503 + 17) % 97) / 97;
  const length = Math.hypot(a - 0.5, b - 0.5) || 1;
  return {
    moveX: (a - 0.5) / length,
    moveZ: (b - 0.5) / length,
    run: i % 7 < 3,
    jump: i % 11 === 0,
    swim: 0,
  };
}

function run(steps: number, framing?: number[]): EntityState {
  const physics = emptyWorld();
  const entity = physics.spawn(SIZE, 32, 30, 32);
  if (!framing) {
    for (let i = 0; i < steps; i++) {
      entity.intent = intentAt(i);
      physics.step();
    }
    return entity.state;
  }
  const stepper = new FixedStepper();
  let done = 0;
  for (let f = 0; done < steps; f++) {
    const n = Math.min(stepper.advance(framing[f % framing.length]!), steps - done);
    for (let k = 0; k < n; k++) {
      entity.intent = intentAt(done++);
      physics.step();
    }
  }
  return entity.state;
}

describe('physics world', () => {
  it('PHYS-001.a: an entity has a box, a position and a velocity', () => {
    const entity = emptyWorld().spawn(SIZE, 10, 20, 30);
    expect(entity.size).toEqual(SIZE);
    expect(entity.state).toMatchObject({ x: 10, y: 20, z: 30, vx: 0, vy: 0, vz: 0 });
  });

  it('PHYS-001.b: intents drive the entity; its position changes only in the step', () => {
    const physics = emptyWorld();
    const entity = physics.spawn(SIZE, 10, 40, 10);
    // The state is a copy: writing to it moves nothing.
    const copy = entity.state as EntityState;
    copy.x = 99;
    expect(entity.state.x).toBe(10);
    entity.intent = { ...IDLE, moveX: 1 };
    expect(entity.state.x).toBe(10);
    physics.step();
    expect(entity.state.x).toBeCloseTo(10 + WALK_SPEED * STEP_SECONDS, 10);
  });

  it('PHYS-002.a: the simulation advances in fixed steps of 1/60 s', () => {
    expect(STEP_SECONDS).toBe(1 / 60);
    const stepper = new FixedStepper();
    expect(stepper.advance(1 / 120)).toBe(0);
    expect(stepper.advance(1 / 120)).toBe(1);
    expect(stepper.advance(0.06)).toBe(3);
    expect(stepper.alpha).toBeGreaterThan(0);
    // After a long pause at most a few steps run, and the backlog is dropped.
    expect(stepper.advance(10)).toBe(MAX_STEPS_PER_FRAME);
    expect(stepper.advance(0)).toBe(0);
  });

  it('PHYS-002.b: same world, state and intents give identical results', () => {
    expect(run(600)).toEqual(run(600));
  });

  it('PHYS-002.c: the same simulated time at 30, 60 and 144 fps gives the same state', () => {
    const reference = run(300);
    for (const fps of [30, 60, 144]) {
      expect(run(300, [1 / fps])).toEqual(reference);
    }
    // Irregular frames too.
    expect(run(300, [0.004, 0.021, 0.017, 0.033, 0.009])).toEqual(reference);
    // Five seconds of frames give five seconds of steps, within one step.
    for (const fps of [30, 60, 144]) {
      const stepper = new FixedStepper();
      let steps = 0;
      for (let f = 0; f < 5 * fps; f++) steps += stepper.advance(1 / fps);
      expect(Math.abs(steps - 300)).toBeLessThanOrEqual(1);
    }
  });
});
