import { describe, expect, it } from 'vitest';
import { RUN_SPEED, WALK_SPEED } from '../core/physics/constants';
import { activityOf, advancePhase, pose, type PoseInput } from './pose';

const base: PoseInput = {
  speed: 0,
  onGround: true,
  submerged: 0,
  speaking: false,
  time: 1.3,
  phase: 1,
};

describe('figure pose', () => {
  it('CHAR-002.a: the pose depends only on the state: idle, walk, run, jump, swim, speech', () => {
    // Same state, same pose.
    expect(pose(base)).toEqual(pose({ ...base }));
    expect(activityOf(base)).toBe('idle');
    expect(activityOf({ ...base, speed: WALK_SPEED })).toBe('walk');
    expect(activityOf({ ...base, speed: RUN_SPEED })).toBe('run');
    expect(activityOf({ ...base, onGround: false })).toBe('air');
    expect(activityOf({ ...base, submerged: 0.8, onGround: false })).toBe('swim');
    // Still: the legs stand straight.
    expect(pose(base).leftLeg).toBe(0);
    // Walking and running: legs in opposition, wider swing when faster.
    const walking = pose({ ...base, speed: WALK_SPEED, phase: Math.PI / 2 });
    const running = pose({ ...base, speed: RUN_SPEED, phase: Math.PI / 2 });
    expect(walking.leftLeg).toBeCloseTo(-walking.rightLeg, 10);
    expect(Math.sign(walking.leftArm)).toBe(-Math.sign(walking.leftLeg));
    expect(running.leftLeg).toBeGreaterThan(walking.leftLeg);
    // Jumping and swimming have poses of their own.
    expect(pose({ ...base, onGround: false })).not.toEqual(pose(base));
    const swimming = pose({ ...base, submerged: 1, onGround: false });
    expect(swimming.lean).toBeGreaterThan(0.3);
    expect(swimming.leftArm).toBeLessThan(-0.3);
    // Speaking moves the head over time; silence keeps it still.
    const heads = [0.1, 0.2, 0.3].map((time) => pose({ ...base, speaking: true, time }).head);
    expect(new Set(heads).size).toBe(3);
    expect(pose({ ...base, time: 0.1 }).head).toBe(0);
  });

  it('the step cycle follows the distance walked, not the time', () => {
    expect(advancePhase(0, 2.6)).toBeCloseTo(0, 10);
    expect(advancePhase(0, 1.3)).toBeCloseTo(Math.PI, 10);
  });
});
