import { describe, expect, it } from 'vitest';
import { intentFromKeys, turnFromKeys, TURN_SPEED } from './input';

const intent = (codes: string[], yaw = 0) => intentFromKeys(new Set(codes), yaw);

describe('player input', () => {
  it('maps keys to intents: move relative to the view, turn with ←/→, run, jump, swim', () => {
    expect(intent([])).toEqual({ moveX: 0, moveZ: 0, run: false, jump: false, swim: 0 });
    expect(intent(['KeyW'])).toMatchObject({ moveX: 0, moveZ: -1 });
    expect(intent(['ArrowUp'])).toEqual(intent(['KeyW']));
    const east = intent(['KeyW'], -Math.PI / 2);
    expect(east.moveX).toBeCloseTo(1, 10);
    expect(east.moveZ).toBeCloseTo(0, 10);
    expect(intent(['KeyW', 'ShiftLeft']).run).toBe(true);
    expect(intent(['Space'])).toMatchObject({ jump: true, swim: 1 });
    expect(intent(['KeyZ'])).toMatchObject({ jump: false, swim: 1 });
    expect(intent(['KeyX']).swim).toBe(-1);
    expect(intent(['KeyZ', 'KeyX']).swim).toBe(0);
    // ←/→ do not move sideways: they turn the view (A3.1).
    expect(intent(['ArrowLeft'])).toEqual(intent([]));
    expect(intent(['ArrowRight'])).toEqual(intent([]));
    expect(intent(['ArrowDown'])).toEqual(intent(['KeyS']));
    expect(turnFromKeys(new Set(['ArrowLeft']), 0.5)).toBeCloseTo(TURN_SPEED / 2, 10);
    expect(turnFromKeys(new Set(['ArrowRight']), 1)).toBe(-TURN_SPEED);
    expect(turnFromKeys(new Set(['ArrowLeft', 'ArrowRight']), 1)).toBe(0);
    expect(turnFromKeys(new Set(['KeyA']), 1)).toBe(0);
    const diagonal = intent(['KeyW', 'KeyD']);
    expect(Math.hypot(diagonal.moveX, diagonal.moveZ)).toBeCloseTo(1, 10);
  });
});
