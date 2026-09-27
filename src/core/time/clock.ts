/**
 * The clock of the world (TIME-001, plan F09 P1): the time of day from the simulated time, the
 * starting hour and the length of a day. Pure functions: the same simulated time always gives
 * the same hour, in the host, in the browser and in the tests.
 */

export const MINUTES_PER_DAY = 24 * 60;
/** A day of the world lasts one hour of real time, unless the world file says otherwise. */
export const DEFAULT_DAY_MINUTES = 60;
/** The world starts in the morning, unless the world file says otherwise (Q1). */
export const DEFAULT_START = '08:00';

export type PartOfDay = 'dawn' | 'day' | 'dusk' | 'night';

/** Where the parts of the day begin, minutes after midnight (Q4). */
export const PARTS_OF_DAY = {
  dawn: 5 * 60 + 30,
  day: 7 * 60,
  dusk: 18 * 60 + 30,
  night: 20 * 60,
} as const;

export interface ClockSettings {
  /** Minutes after midnight at the start of the world. */
  readonly startMinutes: number;
  /** Real minutes a whole day of the world lasts. */
  readonly dayMinutes: number;
}

export const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:MM` as minutes after midnight, or undefined when it is not a valid hour. */
export function parseClock(text: string): number | undefined {
  const m = CLOCK_PATTERN.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

/** Minutes after midnight as `HH:MM`. */
export function formatClock(minutes: number): string {
  const whole = Math.floor(wrap(minutes));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/** The time of day, minutes after midnight in [0, 1440), after `seconds` of simulated time. */
export function timeOfDay(seconds: number, settings: ClockSettings): number {
  const minutesPerSecond = MINUTES_PER_DAY / (settings.dayMinutes * 60);
  return wrap(settings.startMinutes + seconds * minutesPerSecond);
}

/** The simulated seconds that bring the clock from `from` to `to` minutes, going forward. */
export function secondsBetween(from: number, to: number, settings: ClockSettings): number {
  return (wrap(to - from) * settings.dayMinutes * 60) / MINUTES_PER_DAY;
}

/** The part of the day of an hour (TIME-001.d). */
export function partOfDay(minutes: number): PartOfDay {
  const m = wrap(minutes);
  if (m >= PARTS_OF_DAY.night || m < PARTS_OF_DAY.dawn) return 'night';
  if (m < PARTS_OF_DAY.day) return 'dawn';
  if (m < PARTS_OF_DAY.dusk) return 'day';
  return 'dusk';
}

function wrap(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
