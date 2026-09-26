import { describe, expect, it } from 'vitest';
import { raycast } from './raycast';

const blocks = new Set(['5,0,0', '0,3,0', '-2,-2,-2']);
const isBlocking = (x: number, y: number, z: number) => blocks.has(`${x},${y},${z}`);

describe('raycast', () => {
  it('finds the distance to the first blocking block along each axis', () => {
    expect(raycast([0.5, 0.5, 0.5], [1, 0, 0], 20, isBlocking)).toBeCloseTo(4.5, 10);
    expect(raycast([0.5, 0.5, 0.5], [0, 1, 0], 20, isBlocking)).toBeCloseTo(2.5, 10);
    expect(raycast([0.5, 0.5, 0.5], [0, 0, 1], 20, isBlocking)).toBe(20);
    expect(raycast([0.5, 0.5, 0.5], [1, 0, 0], 3, isBlocking)).toBe(3);
  });

  it('follows diagonals and starts at 0 inside a block', () => {
    const d = 1 / Math.sqrt(3);
    const hit = raycast([0.5, 0.5, 0.5], [-d, -d, -d], 20, isBlocking);
    expect(hit).toBeCloseTo(1.5 * Math.sqrt(3), 6);
    expect(raycast([5.5, 0.5, 0.5], [1, 0, 0], 20, isBlocking)).toBe(0);
  });
});
