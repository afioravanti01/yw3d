import { describe, expect, it } from 'vitest';
import { WindowLights } from './windows';

describe('the lit windows', () => {
  it('RENDER-008.b: one quad per window, hidden by day, warm and shown at night', () => {
    const windows = new WindowLights([
      { from: [2, 10, 5.9], to: [4, 12, 5.9] },
      { from: [7.1, 10, 3], to: [7.1, 12, 1] },
    ]);
    expect(windows.mesh.geometry.getAttribute('position').count).toBe(8);
    expect(windows.mesh.geometry.index!.count).toBe(12);
    windows.setBrightness(0);
    expect(windows.mesh.visible).toBe(false);
    windows.setBrightness(1);
    expect(windows.mesh.visible).toBe(true);
    const { r, g, b } = windows.mesh.material.color;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    windows.dispose();
  });

  it('RENDER-008.b: a world without windows never shows the mesh', () => {
    const windows = new WindowLights([]);
    windows.setBrightness(1);
    expect(windows.mesh.visible).toBe(false);
  });
});
