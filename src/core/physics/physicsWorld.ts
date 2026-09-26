import type { BlockRegistry } from '../blocks/registry';
import type { World } from '../world/world';
import { boxIntersectsSolid, boxOf, moveAlongAxis, type Axis } from './collide';
import { GRAVITY, MAX_FALL_SPEED, RUN_SPEED, STEP_SECONDS, WALK_SPEED } from './constants';
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
    const speed = intent.run ? RUN_SPEED : WALK_SPEED;
    state.vx = intent.moveX * speed;
    state.vz = intent.moveZ * speed;
    state.vy = Math.max(-MAX_FALL_SPEED, state.vy - GRAVITY * STEP_SECONDS);

    // Vertical first, then the two horizontal axes (plan F03 P3).
    const vertical = this.move(body, 1, state.vy * STEP_SECONDS);
    state.onGround = vertical.blocked && state.vy < 0;
    if (vertical.blocked) state.vy = 0;
    if (this.move(body, 0, state.vx * STEP_SECONDS).blocked) state.vx = 0;
    if (this.move(body, 2, state.vz * STEP_SECONDS).blocked) state.vz = 0;
  }

  /** Moves a body along an axis, stopping at solid blocks; returns whether it was blocked. */
  private move(body: Body, axis: Axis, delta: number): { blocked: boolean } {
    const box = boxOf(body.state, body.size);
    const { moved, blocked } = moveAlongAxis(box, axis, delta, this.solidAt);
    const { state } = body;
    if (axis === 0) state.x += moved;
    else if (axis === 1) state.y = blocked ? snap(state.y + moved) : state.y + moved;
    else state.z += moved;
    return { blocked };
  }
}
