import { describe, expect, it } from 'vitest';
import { composeWorld } from '../compose/composeWorld';
import { createDefaultStructures } from '../structures/builtin';
import { loadWorldFile } from '../yaml/worldFile';
import { formatClock, parseClock, partOfDay, secondsBetween, timeOfDay } from './clock';

const HOUR = { startMinutes: 8 * 60, dayMinutes: 60 };

describe('the clock of the world', () => {
  it('TIME-001.a: the hour moves with the simulated time; a day lasts 60 real minutes, or what the file says', () => {
    expect(formatClock(timeOfDay(0, HOUR))).toBe('08:00');
    // 60 real minutes for 24 hours: 2.5 real minutes for an hour of the world.
    expect(formatClock(timeOfDay(150, HOUR))).toBe('09:00');
    expect(formatClock(timeOfDay(16 * 150, HOUR))).toBe('00:00');
    expect(formatClock(timeOfDay(3600, HOUR))).toBe('08:00');
    const slow = { startMinutes: 21 * 60 + 30, dayMinutes: 120 };
    expect(formatClock(timeOfDay(300, slow))).toBe('22:30');
    // The same time always gives the same hour.
    expect(timeOfDay(1234.5, HOUR)).toBe(timeOfDay(1234.5, HOUR));
    expect(secondsBetween(8 * 60, 22 * 60, HOUR)).toBe(14 * 150);
    expect(secondsBetween(22 * 60, 8 * 60, HOUR)).toBe(10 * 150);
    expect(parseClock('07:05')).toBe(425);
    expect(parseClock('24:00')).toBeUndefined();
    expect(parseClock('7:5')).toBeUndefined();
  });

  it('TIME-001.d: the parts of the day: dawn 05:30–07:00, day to 18:30, dusk to 20:00, night to 05:30', () => {
    const part = (hhmm: string) => partOfDay(parseClock(hhmm)!);
    expect(
      ['05:29', '05:30', '06:59', '07:00', '18:29', '18:30', '19:59', '20:00', '00:00'].map(part),
    ).toEqual(['night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night']);
  });

  it('TIME-001.a, YAML-001.a: the world file sets the start and the length of a day; 08:00 and 60 when absent', () => {
    const base = 'version: 2\nname: T\nterrain: { seed: 1, generator: 1, size: [64, 96, 64] }\n';
    const clock = (text: string) =>
      composeWorld(text, 'w.yaml', { registry: createDefaultStructures() }).clock;
    expect(clock(base)).toEqual({ startMinutes: 480, dayMinutes: 60 });
    expect(clock(`${base}time: { start: "21:15", day_minutes: 20 }\n`)).toEqual({
      startMinutes: 21 * 60 + 15,
      dayMinutes: 20,
    });
    expect(clock(`${base}time: { day_minutes: 30 }\n`)).toEqual({
      startMinutes: 480,
      dayMinutes: 30,
    });
    const errors = (time: string) =>
      loadWorldFile(`${base}time: ${time}\n`, 'w.yaml').diagnostics.map((d) => d.path);
    expect(errors('{ start: "25:00" }')).toEqual(['time.start']);
    expect(errors('{ day_minutes: 0 }')).toEqual(['time.day_minutes']);
  });
});
