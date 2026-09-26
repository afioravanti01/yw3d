import { metersToBlocks } from '../world/units';

/**
 * Physics constants. The spec gives them in meters (F03 Q1, Q2); the physics works in blocks
 * and seconds like the rest of the core (plan F03 P1), so they are converted here only.
 */

/** Simulation step: 60 steps per second (PHYS-002.a). */
export const STEP_SECONDS = 1 / 60;

/** Gravity, 20 m/s² (Q1). */
export const GRAVITY = metersToBlocks(20);
/** Maximum falling speed, 40 m/s (Q1). */
export const MAX_FALL_SPEED = metersToBlocks(40);
/** Walking and running speed, 4 and 7 m/s (Q2). */
export const WALK_SPEED = metersToBlocks(4);
export const RUN_SPEED = metersToBlocks(7);
/** Height reached by the feet when jumping: 1.1 m, in the 1.0–1.2 m of PHYS-005.a. */
export const JUMP_HEIGHT = metersToBlocks(1.1);
/** Initial vertical speed that reaches JUMP_HEIGHT under GRAVITY. */
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
/** Highest step climbed without jumping (PHYS-005.b), and in contact with water (plan P4). */
export const STEP_HEIGHT = 1;
export const WATER_STEP_HEIGHT = 1.3;
/** In water the horizontal speed is at most half of the speed on land (PHYS-006.a). */
export const WATER_SPEED_FACTOR = 0.5;
/** In water an entity floats with this fraction of its height submerged (head out, PHYS-006.b). */
export const FLOAT_FRACTION = 0.85;
/** Strength of buoyancy: how hard the water pushes an entity back to its floating height. */
export const BUOYANCY_STIFFNESS = 2;
/** Fraction of the vertical speed kept at each step in water: near-critical damping of bobbing. */
export const WATER_DRAG = 0.87;
/** Vertical speed when swimming up or down, and highest vertical speed in water: 3 m/s. */
export const SWIM_SPEED = metersToBlocks(3);
/** Walking speed of characters when their controller does not choose one: a calm 1.5 m/s (A5.1). */
export const CHARACTER_WALK_SPEED = metersToBlocks(1.5);
/** Speeds a controller may ask for, in m/s (A5.1). */
export const MIN_CHARACTER_SPEED_MPS = 0.5;
export const MAX_CHARACTER_SPEED_MPS = 7;
