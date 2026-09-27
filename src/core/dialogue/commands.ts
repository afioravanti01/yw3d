import type { MapEntry, MapShape, WorldMap } from '../map/worldMap';

/**
 * Commands of the message console (DIALOG-005.f, plan F07 P5, A7.2): a line that starts with
 * `/` is for the console, not said in the world. F07 has `/help` and `/world`; the programming
 * commands of later phases go here.
 */
export type CommandResult =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** What the commands may read of the world now running. */
export interface CommandContext {
  readonly map: WorldMap;
  /** Where a character or the player is now, in blocks; undefined when unknown. */
  position(id: string): { readonly x: number; readonly z: number } | undefined;
}

export const HELP_LINES: readonly string[] = [
  'Write a message and press Enter: the characters within 16 blocks of you hear it.',
  '@name message: to one character, wherever it is (id or name; Tab completes it).',
  'Esc goes back to the game; the × at the top of the console reduces it.',
  '/world: the characters and the player where they are now, the places and the structures.',
  '/help: this help.',
];

export function isCommand(text: string): boolean {
  return text.trimStart().startsWith('/');
}

export function runCommand(text: string, context?: CommandContext): CommandResult {
  const [name = ''] = text.trim().slice(1).split(/\s+/, 1);
  if (name === 'help') return { ok: true, lines: HELP_LINES };
  if (name === 'world') {
    if (!context) return { ok: false, error: 'there is no world yet' };
    return { ok: true, lines: describeWorld(context) };
  }
  return { ok: false, error: `unknown command "/${name}": write /help` };
}

const round = (v: number) => String(Math.round(v));

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

/** Every element of the map, grouped by kind; who moves is where it is now (A7.2). */
function describeWorld({ map, position }: CommandContext): string[] {
  const of = (kind: MapEntry['kind']) => map.entries.filter((e) => e.kind === kind);
  const title = (e: MapEntry) => (e.name === e.id ? e.name : `${e.name} (${e.id})`);
  const now = (e: MapEntry) => {
    const p = position(e.id);
    return p ? `${round(p.x)}, ${round(p.z)}` : where(e.shape);
  };
  const lines = [`${map.name} · ${map.size[0]} × ${map.size[2]} blocks · positions x, z in blocks`];
  const section = (label: string, entries: readonly MapEntry[], line: (e: MapEntry) => string) => {
    if (entries.length === 0) return;
    lines.push(`${label}:`);
    for (const e of entries) lines.push(`  ${line(e)}`);
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
  return lines;
}
