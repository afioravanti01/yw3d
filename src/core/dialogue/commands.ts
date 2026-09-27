import type { MapEntry, MapShape, WorldMap } from '../map/worldMap';
import { formatClock, parseClock, partOfDay } from '../time/clock';
import { address } from './address';

/**
 * Commands of the message console (DIALOG-005.f, plan F07 P5, A7.2): a line that starts with
 * `/` is for the console, not said in the world. F07 has `/help` and `/world`; the programming
 * commands of later phases go here. The answer of a command is one block of Markdown (A7.4).
 * `/describe` comes with F08 (A8.2).
 */
export type CommandResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/** What drives a character, for `/describe` (A8.3): the world is a simulation to inspect. */
export type Driver =
  | {
      readonly kind: 'agent';
      readonly mode: string;
      readonly brain: string;
      readonly model: string | null;
      readonly effort: string | null;
      readonly answers: string;
      readonly initiative: string;
      readonly every: number | null;
      readonly state: string | null;
      readonly lastMs: number | null;
    }
  | { readonly kind: 'program'; readonly file: string; readonly state: string | null }
  | { readonly kind: 'controller'; readonly command: string | null; readonly active: boolean }
  | { readonly kind: 'none' };

/** The technical data of a character (A8.3). */
export interface CharacterDetails {
  readonly driver: Driver;
  /** The action it is doing now, e.g. `walk_to`. */
  readonly action: string | null;
  readonly persona?: string;
  readonly goals?: readonly string[];
}

/** What the commands may read of the world now running. */
export interface CommandContext {
  readonly map: WorldMap;
  /** Where a character or the player is now, in blocks; undefined when unknown. */
  position(id: string): { readonly x: number; readonly z: number } | undefined;
  /** What drives a character and what it is doing; undefined when unknown. */
  details?(id: string): CharacterDetails | undefined;
  /** The hour of the world, minutes after midnight (TIME-001). */
  clock?(): number | undefined;
  /** Brings the world to an hour; absent where the time cannot be set (TIME-002.a). */
  setClock?(minutes: number): void;
}

export const HELP = [
  '**The console**',
  '- Write a message and press Enter: the characters within 16 blocks of you hear it.',
  '- Shift+Enter starts a new line of the same message; Markdown works (`**bold**`, `*italics*`, lists).',
  '- `@name message`: to one character within 16 blocks of you (id or name; Tab completes it).',
  '- Esc goes back to the game; the × at the top of the console reduces it.',
  '- `/world`: the characters and the player where they are now, the places and the structures.',
  '- `/time`: the hour of the world; `/time HH:MM` brings the world to that hour.',
  '- `/describe @name`: the description of a character and its technical data: what drives it, model or program, state, action, position.',
  '- `/help`: this help.',
].join('\n');

export function isCommand(text: string): boolean {
  return text.trimStart().startsWith('/');
}

export function runCommand(text: string, context?: CommandContext): CommandResult {
  const [name = ''] = text.trim().slice(1).split(/\s+/, 1);
  if (name === 'help') return { ok: true, text: HELP };
  if (name === 'world') {
    if (!context) return { ok: false, error: 'there is no world yet' };
    return { ok: true, text: describeWorld(context) };
  }
  if (name === 'time') {
    if (!context?.clock || context.clock() === undefined) {
      return { ok: false, error: 'there is no world yet' };
    }
    return time(text.trim().slice('/time'.length).trim(), context);
  }
  if (name === 'describe') {
    if (!context) return { ok: false, error: 'there is no world yet' };
    return describeCharacter(text.trim().slice('/describe'.length).trim(), context);
  }
  return { ok: false, error: `unknown command "/${name}": write /help` };
}

/**
 * `/describe @name`: who a character is, as the world file describes it (A8.2), and its
 * technical data: what drives it, with which model or program, its state, action and position
 * (A8.3).
 */
function describeCharacter(written: string, context: CommandContext): CommandResult {
  if (written === '') return { ok: false, error: 'write /describe @name' };
  const characters = context.map.entries.filter((e) => e.kind === 'character');
  const addressed = address(written.startsWith('@') ? written : `@${written}`, characters);
  if (!addressed.ok) return addressed;
  const who = characters.find((c) => c.id === addressed.to)!;
  const lines = [`**${who.name}** (\`${who.id}\`)`, '', who.description ?? '*No description.*', ''];
  const at = context.position(who.id);
  if (at) lines.push(`- **Position:** ${round(at.x)}, ${round(at.z)} blocks`);
  const details = context.details?.(who.id);
  if (details) {
    lines.push(...driverLines(details.driver));
    lines.push(`- **Action:** ${details.action ? `\`${details.action}\`` : 'none'}`);
    if (details.persona) lines.push(`- **Persona:** ${details.persona}`);
    if (details.goals?.length) lines.push(`- **Goals:** ${details.goals.join('; ')}`);
  }
  return { ok: true, text: lines.join('\n').trimEnd() };
}

function driverLines(driver: Driver): string[] {
  switch (driver.kind) {
    case 'agent': {
      const settings = [
        driver.model ? `model \`${driver.model}\`` : 'default model',
        driver.effort ? `effort ${driver.effort}` : 'default effort',
        `${driver.answers} answers`,
      ];
      const state = driver.state
        ? `${driver.state}${driver.lastMs !== null ? ` · last request ${(driver.lastMs / 1000).toFixed(1)} s` : ''}`
        : 'unknown';
      return [
        `- **Driven by:** LLM agent, ${driver.mode} (\`${driver.brain}\`)`,
        `- **Settings:** ${settings.join(' · ')}`,
        `- **Initiative:** ${driver.initiative}${driver.every !== null ? `, every ${driver.every} s` : ''}`,
        `- **State:** ${state}`,
      ];
    }
    case 'program':
      return [
        `- **Driven by:** Python program \`${driver.file}\``,
        `- **State:** ${driver.state ?? 'unknown'}`,
      ];
    case 'controller':
      return [
        `- **Driven by:** ${driver.command ? `controller \`${driver.command}\`` : 'a client on the WebSocket'}`,
        `- **State:** ${driver.active ? 'active' : 'not running'}`,
      ];
    case 'none':
      return ['- **Driven by:** nothing: it stands still'];
  }
}

const round = (v: number) => String(Math.round(v));

/** `/time` shows the hour of the world; `/time HH:MM` brings it there (TIME-002.a). */
function time(written: string, context: CommandContext): CommandResult {
  const now = (minutes: number) => `**${formatClock(minutes)}**, ${partOfDay(minutes)}`;
  if (written === '') return { ok: true, text: `It is ${now(context.clock!()!)}.` };
  const minutes = parseClock(written);
  if (minutes === undefined) return { ok: false, error: 'write /time HH:MM, e.g. /time 21:30' };
  if (!context.setClock) {
    return { ok: false, error: 'only the view that drives the player can set the time' };
  }
  context.setClock(minutes);
  return { ok: true, text: `The world is now at ${now(minutes)}.` };
}

/** Where an element is, in blocks: a point, a rectangle of columns, a circle. */
function where(shape: MapShape): string {
  switch (shape.kind) {
    case 'point':
      return `${round(shape.x)}, ${round(shape.z)}`;
    case 'rect':
      return `${shape.from[0]}–${shape.to[0] - 1}, ${shape.from[1]}–${shape.to[1] - 1}`;
    case 'circle':
      return `${shape.center[0]}, ${shape.center[1]} (radius ${shape.radius})`;
  }
}

/** Every element of the map, grouped by kind, as one block; who moves is where it is now. */
function describeWorld(context: CommandContext): string {
  const { map, position } = context;
  const of = (kind: MapEntry['kind']) => map.entries.filter((e) => e.kind === kind);
  const title = (e: MapEntry) => (e.name === e.id ? `\`${e.id}\`` : `${e.name} (\`${e.id}\`)`);
  const now = (e: MapEntry) => {
    const p = position(e.id);
    return p ? `${round(p.x)}, ${round(p.z)}` : where(e.shape);
  };
  const minutes = context.clock?.();
  const hour = minutes === undefined ? '' : ` · ${formatClock(minutes)} (${partOfDay(minutes)})`;
  const lines = [
    `**${map.name}**${hour} · ${map.size[0]} × ${map.size[2]} blocks · positions x, z in blocks`,
  ];
  const section = (label: string, entries: readonly MapEntry[], line: (e: MapEntry) => string) => {
    if (entries.length === 0) return;
    lines.push('', `**${label}**`);
    for (const e of entries) lines.push(`- ${line(e)}`);
  };
  section('Player', of('player'), (e) => `${e.name} · ${now(e)}`);
  section('Characters', of('character'), (e) => `${title(e)} · ${now(e)}`);
  section('Places', of('place'), (e) => `${title(e)} · ${where(e.shape)}`);
  section('Structures', of('structure'), (e) => `${title(e)} · ${e.type} · ${where(e.shape)}`);
  section(
    'Groups of structures',
    of('scatter'),
    (e) => `${title(e)} · ${(e.types ?? []).join(', ')} · ${where(e.shape)}`,
  );
  return lines.join('\n');
}
