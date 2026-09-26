import { RUN_SPEED } from '../core/physics/constants';

/**
 * Pose of an animated figure from the state of its character (CHAR-002.a, plan F05 P13): a
 * pure function, so that the same state always gives the same pose. Angles in radians,
 * rotations about the x axis of each joint (positive swings forward).
 */
export interface PoseInput {
  /** Horizontal speed, blocks per second. */
  readonly speed: number;
  readonly onGround: boolean;
  /** Fraction of the body in water, 0..1. */
  readonly submerged: number;
  readonly speaking: boolean;
  /** Seconds, for breathing, swimming and speaking. */
  readonly time: number;
  /** Walking cycle, radians: advances with the distance walked (see `advancePhase`). */
  readonly phase: number;
}

export interface Pose {
  readonly leftLeg: number;
  readonly rightLeg: number;
  readonly leftArm: number;
  readonly rightArm: number;
  /** Nod of the head. */
  readonly head: number;
  /** Lean of the whole body forward. */
  readonly lean: number;
  /** Vertical offset of the body, blocks (breathing, bouncing steps). */
  readonly bob: number;
}

/** Blocks walked in one full step cycle (two steps). */
const STRIDE = 2.6;

export function advancePhase(phase: number, distance: number): number {
  return (phase + (distance / STRIDE) * 2 * Math.PI) % (2 * Math.PI);
}

export type Activity = 'idle' | 'walk' | 'run' | 'air' | 'swim';

export function activityOf(input: Pick<PoseInput, 'speed' | 'onGround' | 'submerged'>): Activity {
  if (input.submerged >= 0.5) return 'swim';
  if (!input.onGround) return 'air';
  if (input.speed < 0.3) return 'idle';
  return input.speed > RUN_SPEED * 0.75 ? 'run' : 'walk';
}

export function pose(input: PoseInput): Pose {
  const { time, phase } = input;
  const talk = input.speaking ? 0.09 * Math.sin(time * 14) : 0;
  switch (activityOf(input)) {
    case 'swim': {
      // Alternate arm strokes and fluttering legs, body leaning into the water.
      const stroke = Math.sin(time * 4);
      return {
        leftArm: -1.6 + 1.2 * stroke,
        rightArm: -1.6 - 1.2 * stroke,
        leftLeg: 0.35 * Math.sin(time * 9),
        rightLeg: -0.35 * Math.sin(time * 9),
        head: -0.3 + talk,
        lean: 0.6,
        bob: 0.05 * Math.sin(time * 2),
      };
    }
    case 'air':
      // Jumping or falling: one knee up, arms raised for balance.
      return {
        leftLeg: 0.5,
        rightLeg: -0.25,
        leftArm: -0.9,
        rightArm: -0.7,
        head: talk,
        lean: 0.1,
        bob: 0,
      };
    case 'idle': {
      const breath = Math.sin(time * 2);
      return {
        leftLeg: 0,
        rightLeg: 0,
        leftArm: 0.04 * breath,
        rightArm: -0.04 * breath,
        head: talk,
        lean: 0,
        bob: 0.02 * breath,
      };
    }
    default: {
      // Legs swing in opposition, arms against the legs; the swing grows with the speed.
      const amount = Math.min(1, input.speed / RUN_SPEED);
      const swing = Math.sin(phase);
      const legs = 0.25 + 0.75 * amount;
      return {
        leftLeg: legs * swing,
        rightLeg: -legs * swing,
        leftArm: -0.8 * legs * swing,
        rightArm: 0.8 * legs * swing,
        head: talk,
        lean: 0.15 * amount,
        bob: 0.08 * amount * Math.abs(Math.cos(phase)),
      };
    }
  }
}
