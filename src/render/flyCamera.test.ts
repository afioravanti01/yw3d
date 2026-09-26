import { describe, expect, it } from 'vitest';
import { STONE } from '../core/blocks/builtin';
import { World } from '../core/world/world';
import { clampCamera, clampSpeed, initialCameraPose, movementDirection } from './flyCamera';

const size = { x: 512, y: 96, z: 512 };
const round = (v: { x: number; y: number; z: number }) => ({
  x: Math.round(v.x * 1e6) / 1e6 + 0,
  y: Math.round(v.y * 1e6) / 1e6 + 0,
  z: Math.round(v.z * 1e6) / 1e6 + 0,
});

describe('fly camera', () => {
  it('CAM-001.d: the camera stays within the world extended by 16 m, and not below y = 0', () => {
    expect(clampCamera({ x: 100, y: 50, z: 100 }, size)).toEqual({ x: 100, y: 50, z: 100 });
    // 16 m = 32 blocks.
    expect(clampCamera({ x: -100, y: -5, z: 1000 }, size)).toEqual({ x: -32, y: 0, z: 544 });
    expect(clampCamera({ x: 600, y: 500, z: -40 }, size)).toEqual({ x: 544, y: 128, z: -32 });
  });

  it('speed is limited to 2–40 m/s', () => {
    expect(clampSpeed(1)).toBe(2);
    expect(clampSpeed(8)).toBe(8);
    expect(clampSpeed(100)).toBe(40);
  });

  it('WASD move on the horizontal plane relative to the view, Space and Shift vertically', () => {
    const move = (codes: string[], yaw = 0) => round(movementDirection(new Set(codes), yaw));
    expect(move(['KeyW'])).toEqual({ x: 0, y: 0, z: -1 });
    expect(move(['KeyS'])).toEqual({ x: 0, y: 0, z: 1 });
    expect(move(['KeyD'])).toEqual({ x: 1, y: 0, z: 0 });
    expect(move(['KeyA'])).toEqual({ x: -1, y: 0, z: 0 });
    expect(move(['KeyW'], -Math.PI / 2)).toEqual({ x: 1, y: 0, z: 0 });
    expect(move(['Space'])).toEqual({ x: 0, y: 1, z: 0 });
    expect(move(['ShiftLeft'])).toEqual({ x: 0, y: -1, z: 0 });
    const diagonal = movementDirection(new Set(['KeyW', 'KeyD']), 0);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });

  it('Z and X move up and down like Space and Shift (A2.2)', () => {
    const move = (codes: string[]) => round(movementDirection(new Set(codes), 0));
    expect(move(['KeyZ'])).toEqual(move(['Space']));
    expect(move(['KeyX'])).toEqual(move(['ShiftLeft']));
    expect(move(['KeyZ', 'Space'])).toEqual({ x: 0, y: 1, z: 0 });
    expect(move(['KeyZ', 'KeyX'])).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('arrow keys move like WASD (A1.1)', () => {
    const move = (codes: string[], yaw = 0) => round(movementDirection(new Set(codes), yaw));
    expect(move(['ArrowUp'])).toEqual(move(['KeyW']));
    expect(move(['ArrowDown'])).toEqual(move(['KeyS']));
    expect(move(['ArrowLeft'])).toEqual(move(['KeyA']));
    expect(move(['ArrowRight'])).toEqual(move(['KeyD']));
    expect(move(['ArrowUp'], -Math.PI / 2)).toEqual({ x: 1, y: 0, z: 0 });
    // The same direction from both key sets does not double the speed.
    expect(move(['KeyW', 'ArrowUp'])).toEqual(move(['KeyW']));
  });

  it('starts above the center of the world, higher than the terrain', () => {
    const world = World.fromColumns({ x: 128, y: 96, z: 128 }, (_x, _z, c) => c.fill(STONE, 0, 41));
    const pose = initialCameraPose(world);
    expect(pose.position.x).toBe(64);
    expect(pose.position.z).toBe(64);
    expect(pose.position.y).toBeGreaterThan(40);
    expect(pose.pitch).toBeLessThan(0);
  });
});
