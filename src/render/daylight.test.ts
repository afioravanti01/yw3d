import { describe, expect, it } from 'vitest';
import { daylight, lightStep, moonDirection, sunDirection } from './daylight';

const at = (hh: number, mm = 0) => hh * 60 + mm;

describe('the light of the hour', () => {
  it('RENDER-003.a: the sun rises in the east, is high in the south at midday, sets in the west; at night the moon lights', () => {
    const rise = sunDirection(at(6));
    expect(rise[0]).toBeCloseTo(1, 2);
    expect(rise[1]).toBeCloseTo(0, 2);
    const noon = sunDirection(at(12, 30));
    expect(noon[2]).toBeGreaterThan(0.45);
    expect(noon[1]).toBeCloseTo(Math.sin((60 * Math.PI) / 180), 2);
    const set = sunDirection(at(19));
    expect(set[0]).toBeCloseTo(-1, 2);
    expect(sunDirection(at(0))[1]).toBeLessThan(0);
    expect(moonDirection(at(0, 30))[1]).toBeGreaterThan(0.5);
    expect(moonDirection(at(12))[1]).toBeLessThan(0);
    // The one light follows the sun by day, the moon by night, never grazing the ground.
    const day = daylight(at(10));
    expect(day.light.intensity).toBeGreaterThan(1.5);
    expect(day.light.towards[0]).toBeGreaterThan(0);
    const night = daylight(at(1));
    expect(night.light.intensity).toBeGreaterThan(0.2);
    expect(night.light.intensity).toBeLessThan(0.5);
    for (let m = 0; m < 1440; m += 15) {
      const { towards } = daylight(m).light;
      expect(towards[1]).toBeGreaterThanOrEqual(Math.sin((8 * Math.PI) / 180) - 1e-9);
      expect(Math.hypot(...towards)).toBeCloseTo(1, 6);
    }
  });

  it('RENDER-003.b, RENDER-008.a: the ambient light never goes dark, not even at night', () => {
    for (let m = 0; m < 1440; m += 10) {
      const { ambient } = daylight(m);
      expect(ambient.intensity).toBeGreaterThanOrEqual(1.0);
      expect(Math.max(...ambient.sky)).toBeGreaterThan(0.2);
    }
  });

  it('RENDER-004.a, RENDER-008.b: the sky follows the hour: warm at sunset, dark with stars at night; windows light up at night', () => {
    const noon = daylight(at(12));
    const sunset = daylight(at(18, 45));
    const night = daylight(at(23));
    // Warm: more red than blue at the horizon at sunset, not at midday.
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.horizon[2]);
    expect(noon.horizon[0]).toBeLessThanOrEqual(noon.horizon[2]);
    expect(Math.max(...night.zenith)).toBeLessThan(0.2);
    expect([noon.stars, night.stars]).toEqual([0, 1]);
    expect([noon.windows, night.windows]).toEqual([0, 1]);
    // No jumps: small steps of the hour give small changes of the colors.
    for (let m = 0; m < 1440; m += 1) {
      const a = daylight(m).horizon;
      const b = daylight(m + 1).horizon;
      expect(Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))).toBeLessThan(0.03);
    }
  });

  it('TIME-003.a: the light changes direction in steps of a tenth of the day, not all the time', () => {
    expect(lightStep(at(12, 5))).toBe(at(13, 12));
    expect(lightStep(at(9, 40))).toBe(lightStep(at(11, 59)));
    // Within a step the direction stays, while the colors keep flowing.
    const a = daylight(at(9, 40));
    const b = daylight(at(11, 50));
    expect(b.light.towards).toEqual(a.light.towards);
    expect(b.zenith).not.toEqual(a.zenith);
    expect(daylight(at(12, 5)).light.towards).not.toEqual(a.light.towards);
  });
});
