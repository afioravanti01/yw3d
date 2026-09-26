import { STEP_SECONDS } from './constants';

/** At most this many steps per frame: after a long pause the extra time is dropped (plan P6). */
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Turns variable frame durations into a whole number of fixed simulation steps (PHYS-002.a),
 * keeping the remainder for the next frame and for interpolation.
 */
export class FixedStepper {
  private accumulated = 0;

  /** Adds a frame of `seconds` and returns how many steps to simulate now. */
  advance(seconds: number): number {
    this.accumulated += Math.max(0, seconds);
    // The tolerance absorbs rounding: 1/120 + 1/120 must make one step of 1/60.
    let steps = Math.floor(this.accumulated / STEP_SECONDS + 1e-9);
    if (steps > MAX_STEPS_PER_FRAME) {
      steps = MAX_STEPS_PER_FRAME;
      this.accumulated = 0;
    } else {
      this.accumulated = Math.max(0, this.accumulated - steps * STEP_SECONDS);
    }
    return steps;
  }

  /** How far the current time is between the last step and the next one, 0..1. */
  get alpha(): number {
    return Math.min(1, this.accumulated / STEP_SECONDS);
  }
}
