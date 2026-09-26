/** Size of the axis-aligned box of an entity, in blocks (PHYS-001.a). */
export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/**
 * What the code driving an entity asks for (PHYS-001.b): it never sets positions. The
 * movement is a horizontal vector of length at most 1, already in world axes.
 */
export interface Intent {
  readonly moveX: number;
  readonly moveZ: number;
  readonly run: boolean;
  readonly jump: boolean;
  /** In water: 1 swims up, -1 swims down, 0 floats. */
  readonly swim: -1 | 0 | 1;
}

export const IDLE: Intent = { moveX: 0, moveZ: 0, run: false, jump: false, swim: 0 };

/**
 * Physical state of an entity. The position is the center of the base of its box: x and z in
 * the middle, y at the feet (plan F03 P2).
 */
export interface EntityState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Resting on a solid block. */
  onGround: boolean;
  /** Fraction of the box inside water blocks, 0..1. */
  submerged: number;
}
