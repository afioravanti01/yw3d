import type { BlockRegistry } from '../blocks/registry';
import type { World } from '../world/world';
import { RUN_SPEED, STEP_SECONDS, WALK_SPEED } from './constants';
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

/** The single physical system of the world (roadmap F03): all entities move through it. */
export class PhysicsWorld {
  private readonly bodies: Body[] = [];
  private nextId = 1;

  constructor(
    readonly world: World,
    private readonly registry: BlockRegistry,
  ) {}

  /** Places a new entity with its feet at (x, y, z): the only way to set a position. */
  spawn(size: BoxSize, x: number, y: number, z: number): EntityHandle {
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

  /** Whether the block at a position stops movement. */
  isSolid(x: number, y: number, z: number): boolean {
    return this.registry.solid[this.world.getBlock(x, y, z)] === 1;
  }

  private stepBody(body: Body): void {
    const { state, intent } = body;
    const speed = intent.run ? RUN_SPEED : WALK_SPEED;
    state.vx = intent.moveX * speed;
    state.vz = intent.moveZ * speed;
    state.x += state.vx * STEP_SECONDS;
    state.y += state.vy * STEP_SECONDS;
    state.z += state.vz * STEP_SECONDS;
  }
}
