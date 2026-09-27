/**
 * The light of the moment (RENDER-003, RENDER-004, RENDER-008, plan F09 P4–P5): from the hour of
 * the world, where the sun and the moon are, the colors of the light, of the sky and of the fog,
 * how many stars, how bright the windows. Pure functions, set by eye at the trial of use.
 */

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

/** The sun rises in the east at 06:00 and sets in the west at 19:00 (P4). */
export const SUNRISE = 6 * 60;
export const SUNSET = 19 * 60;
/**
 * The direction of the light changes in steps, a tenth of the day each (amendment A9.2): shadows
 * that move all the time make the scene restless. Within a step the light comes from where its
 * body is at the middle of the step.
 */
export const LIGHT_STEPS = 10;
const SUN_HIGHEST = (60 * Math.PI) / 180;
const MOON_HIGHEST = (45 * Math.PI) / 180;

export interface Daylight {
  /** Unit vectors towards the sun and the moon; x east, y up, z south. */
  readonly sun: Vec3;
  readonly moon: Vec3;
  /** The one directional light: towards it, its color and intensity (the sun, or the moon). */
  readonly light: { readonly towards: Vec3; readonly color: Rgb; readonly intensity: number };
  /** The sky/ground ambient light (RENDER-003.b). */
  readonly ambient: { readonly sky: Rgb; readonly ground: Rgb; readonly intensity: number };
  readonly horizon: Rgb;
  readonly zenith: Rgb;
  /** 0 by day, 1 at night. */
  readonly stars: number;
  /** How bright the windows are: 0 by day, 1 at night (RENDER-008.b). */
  readonly windows: number;
}

/** A point of a body moving over the sky from east to west through the south. */
function arc(t: number, highest: number): Vec3 {
  const along = Math.PI * t;
  const elevation = Math.sin(along) * highest;
  // Below the horizon before rising and after setting, by the same amount.
  const e = t < 0 || t > 1 ? -Math.abs(Math.sin(along)) * 0.3 : elevation;
  const horizontal = Math.cos(e);
  return [Math.cos(along) * horizontal, Math.sin(e), Math.sin(along) * horizontal];
}

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

const sunPath = (minutes: number) => (wrap(minutes) - SUNRISE) / (SUNSET - SUNRISE);
const moonPath = (minutes: number) => wrap(minutes - SUNSET) / (1440 - (SUNSET - SUNRISE));

export function sunDirection(minutes: number): Vec3 {
  return arc(sunPath(minutes), SUN_HIGHEST);
}

export function moonDirection(minutes: number): Vec3 {
  return arc(moonPath(minutes), MOON_HIGHEST);
}

/** The middle of the step of the day that holds `minutes` (A9.2). */
export function lightStep(minutes: number): number {
  const step = 1440 / LIGHT_STEPS;
  return Math.floor(wrap(minutes) / step) * step + step / 2;
}

const hex = (value: number): Rgb => [
  ((value >> 16) & 0xff) / 255,
  ((value >> 8) & 0xff) / 255,
  (value & 0xff) / 255,
];

interface Key {
  readonly at: number;
  readonly horizon: number;
  readonly zenith: number;
  readonly sky: number;
  readonly ground: number;
  readonly ambient: number;
  readonly stars: number;
  readonly windows: number;
}

/** The colors of the day at its key hours (P5); between two keys they blend. */
const KEYS: readonly Key[] = [
  {
    at: 0,
    horizon: 0x1f2a44,
    zenith: 0x0a1024,
    sky: 0x40557f,
    ground: 0x1c2230,
    ambient: 1.0,
    stars: 1,
    windows: 1,
  },
  {
    at: 330,
    horizon: 0x1f2a44,
    zenith: 0x0a1024,
    sky: 0x40557f,
    ground: 0x1c2230,
    ambient: 1.0,
    stars: 1,
    windows: 1,
  },
  {
    at: 385,
    horizon: 0xeaa27a,
    zenith: 0x4b6a9e,
    sky: 0xc9a58c,
    ground: 0x5a4a3a,
    ambient: 1.25,
    stars: 0.2,
    windows: 0.4,
  },
  {
    at: 450,
    horizon: 0xdce8ec,
    zenith: 0x86b4dc,
    sky: 0xc6ddef,
    ground: 0x7a6a50,
    ambient: 1.6,
    stars: 0,
    windows: 0,
  },
  {
    at: 720,
    horizon: 0xe2eef2,
    zenith: 0x6fa6dc,
    sky: 0xcae1f2,
    ground: 0x7d6c52,
    ambient: 1.7,
    stars: 0,
    windows: 0,
  },
  {
    at: 1050,
    horizon: 0xdce8ec,
    zenith: 0x86b4dc,
    sky: 0xc6ddef,
    ground: 0x7a6a50,
    ambient: 1.6,
    stars: 0,
    windows: 0,
  },
  {
    at: 1125,
    horizon: 0xf0a070,
    zenith: 0x5a70a8,
    sky: 0xd8a888,
    ground: 0x604838,
    ambient: 1.25,
    stars: 0.1,
    windows: 0.5,
  },
  {
    at: 1200,
    horizon: 0x1f2a44,
    zenith: 0x0a1024,
    sky: 0x40557f,
    ground: 0x1c2230,
    ambient: 1.0,
    stars: 1,
    windows: 1,
  },
  {
    at: 1440,
    horizon: 0x1f2a44,
    zenith: 0x0a1024,
    sky: 0x40557f,
    ground: 0x1c2230,
    ambient: 1.0,
    stars: 1,
    windows: 1,
  },
];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const SUN_COLOR = hex(0xffe8c4);
const LOW_SUN_COLOR = hex(0xffb070);
const MOON_COLOR = hex(0x9fb4e0);

export function daylight(minutes: number): Daylight {
  const m = wrap(minutes);
  const i = KEYS.findIndex((k) => k.at > m);
  const next = KEYS[i]!;
  const previous = KEYS[i - 1]!;
  const t = (m - previous.at) / (next.at - previous.at);
  const blend = (key: 'horizon' | 'zenith' | 'sky' | 'ground') =>
    mix(hex(previous[key]), hex(next[key]), t);
  const number = (key: 'ambient' | 'stars' | 'windows') =>
    previous[key] + (next[key] - previous[key]) * t;

  const sun = sunDirection(m);
  const moon = moonDirection(m);
  // The sun lights while it is above the horizon; the moon takes over when it sets (P4).
  const sunStrength = smoothstep(-0.04, 0.14, sun[1]);
  const moonStrength = smoothstep(-0.04, 0.14, moon[1]) * (1 - sunStrength);
  const bySun = sunStrength >= moonStrength;
  // The direction of the step (A9.2), kept on the body's path over the sky.
  const clamp = (t: number) => Math.min(1, Math.max(0, t));
  const step = lightStep(m);
  const body = bySun
    ? arc(clamp(sunPath(step)), SUN_HIGHEST)
    : arc(clamp(moonPath(step)), MOON_HIGHEST);
  // Shadows from a body near the horizon would be endless: the light never goes below 8°.
  const lowest = Math.sin((8 * Math.PI) / 180);
  const up = Math.max(body[1], lowest);
  const flat = Math.hypot(body[0], body[2]) || 1;
  const scale = Math.sqrt(1 - up * up) / flat;
  const towards: Vec3 = [body[0] * scale, up, body[2] * scale];
  const light = bySun
    ? {
        towards,
        color: mix(LOW_SUN_COLOR, SUN_COLOR, smoothstep(0.05, 0.4, sun[1])),
        intensity: 2.0 * sunStrength,
      }
    : { towards, color: MOON_COLOR, intensity: 0.45 * moonStrength };

  return {
    sun,
    moon,
    light,
    ambient: { sky: blend('sky'), ground: blend('ground'), intensity: number('ambient') },
    horizon: blend('horizon'),
    zenith: blend('zenith'),
    stars: number('stars'),
    windows: number('windows'),
  };
}
