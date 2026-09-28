import { WATER } from '../blocks/builtin';
import type { BlockRegistry } from '../blocks/registry';
import type { World } from '../world/world';
import { boxIntersectsSolid, boxOf, EPSILON, moveAlongAxis, type Axis, type Box } from './collide';
import {
  BUOYANCY_STIFFNESS,
  FLOAT_FRACTION,
  GRAVITY,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  RUN_SPEED,
  STEP_HEIGHT,
  STEP_SECONDS,
  SWIM_SPEED,
  WALK_SPEED,
  WATER_DRAG,
  WATER_SPEED_FACTOR,
  WATER_STEP_HEIGHT,
} from './constants';
import { IDLE, type BoxSize, type EntityState, type Intent } from './entity';

/**
 * Handle to an entity of a PhysicsWorld. Code outside the physics reads the state and sets
 * intents; the position changes only in `PhysicsWorld.step` (P3, PHYS-001.b).
 */
export interface EntityHandle {
  readonly id: number;
  readonly size: BoxSize;
  /** A copy of the current state: changing it has no effect on the entity. */
  readonly state: Readonly<EntityState>;
  intent: Intent;
}

interface Body {
  readonly id: number;
  readonly size: BoxSize;
  readonly state: EntityState;
  intent: Intent;
}

function shift(box: Box, axis: Axis, amount: number): Box {
  const min: [number, number, number] = [...box.min];
  const max: [number, number, number] = [...box.max];
  min[axis] += amount;
  max[axis] += amount;
  return { min, max };
}

/** Removes rounding noise after a vertical collision: feet rest exactly on a block face. */
function snap(y: number): number {
  const rounded = Math.round(y);
  return Math.abs(y - rounded) < 1e-6 ? rounded : y;
}

/** The single physical system of the world (roadmap F03): all entities move through it. */
export class PhysicsWorld {
  private readonly bodies: Body[] = [];
  private nextId = 1;

  constructor(
    readonly world: World,
    private readonly registry: BlockRegistry,
  ) {}

  /**
   * Places a new entity with its feet at (x, y, z): the only way to set a position. If the box
   * would overlap solid blocks, the entity rises to the first free space above (PHYS-001.c).
   */
  spawn(size: BoxSize, x: number, y: number, z: number): EntityHandle {
    while (y < this.world.size.y && boxIntersectsSolid(boxOf({ x, y, z }, size), this.solidAt)) {
      y = Math.floor(y) + 1;
    }
    const body: Body = {
      id: this.nextId++,
      size,
      state: { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, submerged: 0 },
      intent: IDLE,
    };
    this.bodies.push(body);
    return {
      id: body.id,
      size,
      get state() {
        return { ...body.state };
      },
      get intent() {
        return body.intent;
      },
      set intent(intent: Intent) {
        body.intent = intent;
      },
    };
  }

  /** Whether the block cell (x, y, z) overlaps the box of an entity (LAB-004.b). */
  occupied(x: number, y: number, z: number): boolean {
    return this.bodies.some((body) => {
      const { min, max } = boxOf(body.state, body.size);
      return (
        min[0] < x + 1 - EPSILON &&
        max[0] > x + EPSILON &&
        min[1] < y + 1 - EPSILON &&
        max[1] > y + EPSILON &&
        min[2] < z + 1 - EPSILON &&
        max[2] > z + EPSILON
      );
    });
  }

  /** Advances every entity by one fixed step of 1/60 s (PHYS-002.a). */
  step(): void {
    for (const body of this.bodies) this.stepBody(body);
  }

  /**
   * Whether the block at a position stops movement. Outside the world, the ground below y = 0
   * and the sides are solid, so that nothing leaves the valley; above the world is open.
   */
  isSolid(x: number, y: number, z: number): boolean {
    const { size } = this.world;
    if (y < 0 || x < 0 || z < 0 || x >= size.x || z >= size.z) return true;
    if (y >= size.y) return false;
    return this.registry.solid[this.world.getBlock(x, y, z)] === 1;
  }

  private readonly solidAt = (x: number, y: number, z: number) => this.isSolid(x, y, z);

  private stepBody(body: Body): void {
    const { state, intent } = body;
    const water = this.waterAround(body);
    state.submerged = water.submerged;
    const inWater = state.submerged >= 0.5;
    const speed = (intent.run ? RUN_SPEED : WALK_SPEED) * (inWater ? WATER_SPEED_FACTOR : 1);
    state.vx = intent.moveX * speed;
    state.vz = intent.moveZ * speed;
    if (state.submerged > 0) {
      // Buoyancy against gravity, balanced at FLOAT_FRACTION, with drag (plan F03 P5). The
      // depth below the surface keeps pushing even when the entity is fully under water.
      const depth = water.surface - state.y;
      const buoyancy =
        BUOYANCY_STIFFNESS * GRAVITY * (depth / body.size.height / FLOAT_FRACTION - 1);
      if (intent.swim === 0) {
        state.vy = (state.vy + buoyancy * STEP_SECONDS) * WATER_DRAG;
      } else {
        // Swimming takes over: the vertical speed tends to the swimming speed (PHYS-006.c).
        state.vy = state.vy * WATER_DRAG + (1 - WATER_DRAG) * intent.swim * SWIM_SPEED;
      }
      state.vy = Math.max(-SWIM_SPEED, Math.min(SWIM_SPEED, state.vy));
    } else {
      // A jump starts only from the ground (PHYS-005.a).
      if (intent.jump && state.onGround) state.vy = JUMP_SPEED;
      state.vy = Math.max(-MAX_FALL_SPEED, state.vy - GRAVITY * STEP_SECONDS);
    }

    // Vertical first, then the two horizontal axes (plan F03 P3).
    const vertical = this.move(body, 1, state.vy * STEP_SECONDS);
    state.onGround = vertical.blocked && state.vy < 0;
    if (vertical.blocked) state.vy = 0;
    const stepHeight = state.submerged > 0 ? WATER_STEP_HEIGHT : state.onGround ? STEP_HEIGHT : 0;
    if (this.moveHorizontal(body, 0, state.vx * STEP_SECONDS, stepHeight)) state.vx = 0;
    if (this.moveHorizontal(body, 2, state.vz * STEP_SECONDS, stepHeight)) state.vz = 0;
  }

  /**
   * Moves along a horizontal axis. When blocked, tries again raised by at most `stepHeight`
   * and then lowered onto the step (plan F03 P4, PHYS-005.b). Returns whether it stays blocked.
   */
  private moveHorizontal(body: Body, axis: 0 | 2, delta: number, stepHeight: number): boolean {
    const first = this.move(body, axis, delta);
    if (!first.blocked || stepHeight === 0) return first.blocked;
    const remaining = delta - first.moved;
    const box = boxOf(body.state, body.size);
    const up = moveAlongAxis(box, 1, stepHeight, this.solidAt);
    const raised = shift(box, 1, up.moved);
    const across = moveAlongAxis(raised, axis, remaining, this.solidAt);
    if (Math.abs(across.moved) < 1e-6) return true;
    const down = moveAlongAxis(shift(raised, axis, across.moved), 1, -up.moved, this.solidAt);
    const { state } = body;
    state.y = snap(state.y + up.moved + down.moved);
    if (axis === 0) state.x += across.moved;
    else state.z += across.moved;
    return across.blocked;
  }

  /**
   * Water on the central column of a body: the fraction of its height inside water blocks,
   * and the height of the water surface above its lowest wet block.
   */
  private waterAround(body: Body): { submerged: number; surface: number } {
    const { x, y, z } = body.state;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const top = y + body.size.height;
    let wet = 0;
    let surface = -Infinity;
    for (let by = Math.floor(y); by < top; by++) {
      if (this.world.getBlock(bx, by, bz) !== WATER) continue;
      wet += Math.min(top, by + 1) - Math.max(y, by);
      if (surface === -Infinity) {
        let s = by + 1;
        while (this.world.getBlock(bx, s, bz) === WATER) s++;
        surface = s;
      }
    }
    return { submerged: wet / body.size.height, surface };
  }

  /** Moves a body along an axis, stopping at solid blocks. */
  private move(body: Body, axis: Axis, delta: number): { moved: number; blocked: boolean } {
    const box = boxOf(body.state, body.size);
    const { moved, blocked } = moveAlongAxis(box, axis, delta, this.solidAt);
    const { state } = body;
    if (axis === 0) state.x += moved;
    else if (axis === 1) state.y = blocked ? snap(state.y + moved) : state.y + moved;
    else state.z += moved;
    return { moved, blocked };
  }
}
