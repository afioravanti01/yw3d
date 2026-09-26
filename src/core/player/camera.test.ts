import { describe, expect, it } from 'vitest';
import { thirdPersonCamera, THIRD_PERSON_DISTANCE, viewDirection } from './player';

describe('third-person camera', () => {
  it('PLAYER-003.b: 8 blocks behind the eyes, closer when a block is in the way', () => {
    expect(THIRD_PERSON_DISTANCE).toBe(8);
    const eye: [number, number, number] = [10.5, 20.2, 10.5];
    const open = thirdPersonCamera(eye, 0, 0, () => false);
    // Looking north (-z): the camera is 8 blocks south of the eyes.
    expect(open[0]).toBeCloseTo(10.5, 10);
    expect(open[2]).toBeCloseTo(18.5, 10);
    // Looking down, the camera goes up behind the player.
    const [, dy] = viewDirection(0, -0.5);
    expect(dy).toBeLessThan(0);
    expect(thirdPersonCamera(eye, 0, -0.5, () => false)[1]).toBeGreaterThan(eye[1]);
    // A wall 4 blocks behind: the camera stops before it, never inside a block.
    const wall = (_x: number, _y: number, z: number) => z === 14;
    const near = thirdPersonCamera(eye, 0, 0, wall);
    expect(near[2]).toBeLessThan(14);
    expect(near[2]).toBeGreaterThan(13);
    expect(wall(Math.floor(near[0]), Math.floor(near[1]), Math.floor(near[2]))).toBe(false);
    // Turned east (yaw -90°), the camera is west of the eyes.
    const east = thirdPersonCamera(eye, -Math.PI / 2, 0, () => false);
    expect(east[0]).toBeCloseTo(2.5, 10);
  });
});
