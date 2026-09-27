import { describe, expect, it } from 'vitest';
import type { WorldMap } from '../map/worldMap';
import type { CharacterDetails } from './commands';
import { HELP, isCommand, runCommand } from './commands';

describe('commands of the console', () => {
  it('DIALOG-005.f: a line that starts with / is a command; /help describes the console', () => {
    expect(isCommand('/help')).toBe(true);
    expect(isCommand('  /help')).toBe(true);
    expect(isCommand('ciao /help')).toBe(false);
    expect(isCommand('@tobia /help')).toBe(false);
    expect(runCommand('/help')).toEqual({ ok: true, text: HELP });
    expect(HELP).toMatch(/@name/);
    expect(HELP).toMatch(/Tab/);
  });

  it('DIALOG-005.f: /help lists /time; /world opens with the hour of the world and the part of the day', () => {
    expect(HELP).toMatch(/`\/time`.*`\/time HH:MM`/);
    const map: WorldMap = { name: 'Borgo', description: null, size: [64, 64, 64], entries: [] };
    const world = (clock?: () => number | undefined) =>
      (runCommand('/world', { map, position: () => undefined, clock }) as { text: string }).text;
    expect(world(() => 19 * 60 + 5)).toMatch(/^\*\*Borgo\*\* · 19:05 \(dusk\) · /);
    expect(world()).toMatch(/^\*\*Borgo\*\* · /);
    expect(world()).not.toMatch(/\d\d:\d\d/);
  });

  it('DIALOG-005.f: an unknown command is an error that points to /help', () => {
    expect(runCommand('/vola alto')).toEqual({
      ok: false,
      error: 'unknown command "/vola": write /help',
    });
    expect(runCommand('/')).toEqual({ ok: false, error: 'unknown command "/": write /help' });
  });

  it('DIALOG-005.f: /world lists the player and the characters where they are now, the places and the structures (A7.2, A7.4)', () => {
    const map: WorldMap = {
      name: 'La valle',
      description: null,
      size: [512, 96, 512],
      entries: [
        {
          id: 'piazza',
          kind: 'place',
          name: 'Piazza',
          description: null,
          shape: { kind: 'point', x: 158, z: 66 },
        },
        {
          id: 'orti',
          kind: 'place',
          name: 'Orti',
          description: null,
          shape: { kind: 'rect', from: [112, 84], to: [128, 96] },
        },
        {
          id: 'casolare',
          kind: 'structure',
          type: 'stone_farmhouse',
          name: 'Casolare grande',
          description: null,
          shape: { kind: 'rect', from: [130, 35], to: [150, 49] },
        },
        {
          id: 'scatter#1',
          kind: 'scatter',
          types: ['oak', 'birch'],
          name: 'Bosco',
          description: null,
          shape: { kind: 'circle', center: [300, 200], radius: 40 },
        },
        {
          id: 'tobia',
          kind: 'character',
          name: 'Tobia',
          description: null,
          shape: { kind: 'point', x: 154.5, z: 70.5 },
        },
        {
          id: 'nina',
          kind: 'character',
          name: 'Nina',
          description: null,
          shape: { kind: 'point', x: 120.5, z: 88.5 },
        },
        {
          id: 'player',
          kind: 'player',
          name: 'viandante',
          description: null,
          shape: { kind: 'point', x: 158.5, z: 66.5 },
        },
      ],
    };
    const positions: Record<string, { x: number; z: number }> = {
      tobia: { x: 190.2, z: 110.7 },
      player: { x: 10.4, z: 20.6 },
    };
    // One block of Markdown (A7.4).
    expect(runCommand('/world', { map, position: (id) => positions[id] })).toEqual({
      ok: true,
      text: [
        '**La valle** · 512 × 512 blocks · positions x, z in blocks',
        '',
        '**Player**',
        '- viandante · 10, 21',
        '',
        '**Characters**',
        '- Tobia (`tobia`) · 190, 111',
        '- Nina (`nina`) · 121, 89',
        '',
        '**Places**',
        '- Piazza (`piazza`) · 158, 66',
        '- Orti (`orti`) · 112–127, 84–95',
        '',
        '**Structures**',
        '- Casolare grande (`casolare`) · stone_farmhouse · 130–149, 35–48',
        '',
        '**Groups of structures**',
        '- Bosco (`scatter#1`) · oak, birch · 300, 200 (radius 40)',
      ].join('\n'),
    });
    expect(runCommand('/world')).toEqual({ ok: false, error: 'there is no world yet' });
    expect(HELP).toMatch(/\/world/);
  });

  it('DIALOG-005.f: /describe @name gives the description of a character (A8.2)', () => {
    const map: WorldMap = {
      name: 'Valle',
      description: null,
      size: [64, 96, 64],
      entries: [
        {
          id: 'pescatrice',
          kind: 'character',
          name: 'Marta',
          description: 'La pescatrice del laghetto.',
          shape: { kind: 'point', x: 1, z: 1 },
        },
        {
          id: 'nina',
          kind: 'character',
          name: 'Nina',
          description: null,
          shape: { kind: 'point', x: 2, z: 2 },
        },
        {
          id: 'piazza',
          kind: 'place',
          name: 'Piazza',
          description: 'Il centro.',
          shape: { kind: 'point', x: 3, z: 3 },
        },
      ],
    };
    const context = { map, position: () => undefined };
    expect(runCommand('/describe @Marta', context)).toEqual({
      ok: true,
      text: '**Marta** (`pescatrice`)\n\nLa pescatrice del laghetto.',
    });
    expect(runCommand('/describe pescatrice', context)).toMatchObject({ ok: true });
    expect(runCommand('/describe @nina', context)).toEqual({
      ok: true,
      text: '**Nina** (`nina`)\n\n*No description.*',
    });
    expect(runCommand('/describe', context)).toEqual({ ok: false, error: 'write /describe @name' });
    expect(runCommand('/describe @piazza', context)).toEqual({
      ok: false,
      error: 'no character is called "piazza"; the characters are: Marta (pescatrice), Nina (nina)',
    });
    expect(HELP).toMatch(/\/describe @name/);
  });

  it('DIALOG-005.f: /describe also gives the technical data: what drives it, with which model or program, state, action, position (A8.3)', () => {
    const map: WorldMap = {
      name: 'Valle',
      description: null,
      size: [64, 96, 64],
      entries: ['marta', 'tobia', 'bruno', 'nina'].map((id) => ({
        id,
        kind: 'character' as const,
        name: id[0]!.toUpperCase() + id.slice(1),
        description: `Chi è ${id}.`,
        shape: { kind: 'point' as const, x: 1, z: 1 },
      })),
    };
    const details: Record<string, CharacterDetails> = {
      marta: {
        driver: {
          kind: 'agent',
          mode: 'headless',
          brain: 'claude',
          model: 'sonnet',
          effort: 'low',
          answers: 'long',
          initiative: 'reactive',
          every: null,
          state: 'idle',
          lastMs: 7103,
        },
        action: 'walk_to',
        persona: 'Biologa marina.',
        goals: ['pescare'],
      },
      tobia: {
        driver: { kind: 'program', file: 'characters/tobia.py', state: 'running' },
        action: null,
      },
      bruno: {
        driver: { kind: 'controller', command: 'node bruno.mjs', active: false },
        action: null,
      },
      nina: { driver: { kind: 'none' }, action: null },
    };
    const context = {
      map,
      position: (id: string) => (id === 'marta' ? { x: 182.4, z: 108.6 } : undefined),
      details: (id: string) => details[id],
    };
    const text = (name: string) =>
      (runCommand(`/describe ${name}`, context) as { text: string }).text;
    expect(text('marta')).toBe(
      [
        '**Marta** (`marta`)',
        '',
        'Chi è marta.',
        '',
        '- **Position:** 182, 109 blocks',
        '- **Driven by:** LLM agent, headless (`claude`)',
        '- **Settings:** model `sonnet` · effort low · long answers',
        '- **Initiative:** reactive',
        '- **State:** idle · last request 7.1 s',
        '- **Action:** `walk_to`',
        '- **Persona:** Biologa marina.',
        '- **Goals:** pescare',
      ].join('\n'),
    );
    expect(text('tobia')).toContain(
      '- **Driven by:** Python program `characters/tobia.py`\n- **State:** running',
    );
    expect(text('bruno')).toContain(
      '- **Driven by:** controller `node bruno.mjs`\n- **State:** not running',
    );
    expect(text('nina')).toContain('- **Driven by:** nothing: it stands still');
  });
});
