import { describe, expect, it } from 'vitest';
import { composeWorld } from '../../core/compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import { createDefaultStructures } from '../../core/structures/builtin';
import {
  buildContext,
  direction,
  INSTRUCTION_TEXT,
  INSTRUCTIONS_NAME,
  INSTRUCTIONS_VERSION,
  instructionsFingerprint,
  surroundings,
  whereIs,
  type SeenEntity,
} from './context';

const WORLD = `version: 2
name: Borgo
description: Un borgo con un laghetto.
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }
places:
  - { id: piazza, name: Piazza, at: [40, 40] }
  - { id: orti, name: Orti, description: Zucchine e pomodori., area: { rect: { from: [30, 30], to: [50, 50] } } }
  - { id: lontano, name: Posto lontano, at: [120, 120] }
structures:
  - { type: pond, id: laghetto1, name: Laghetto del borgo, at: [40, 70], params: { radius: 8 } }
characters:
  - { id: marta, name: Marta, description: La pescatrice., at: [40, 40] }
  - { id: tobia, name: Tobia, at: [44, 36] }
`;

const map = composeWorld(WORLD, 'w.yaml', { registry: createDefaultStructures() }).map!;
const self = { x: 40.5, y: 34, z: 40.5 };
const nearby: SeenEntity[] = [
  { id: 'player', name: 'viandante', kind: 'player', x: 40.5, y: 34, z: 30.5, distance: 10 },
  { id: 'tobia', name: 'Tobia', kind: 'character', x: 50.5, y: 34, z: 40.5, distance: 10 },
];

describe('what an agent knows of the world', () => {
  it('AGENT-002.b: the surroundings within 32 blocks, nearest first, with distance and direction', () => {
    expect(direction(self, { x: 40.5, z: 20 })).toBe('north');
    expect(direction(self, { x: 60, z: 40.5 })).toBe('east');
    expect(direction(self, { x: 50, z: 50 })).toBe('south-east');
    expect(direction(self, { x: 30, z: 30 })).toBe('north-west');
    const around = surroundings(map, self, nearby);
    expect(around.map((s) => [s.id, s.direction])).toEqual([
      ['orti', 'here'],
      ['piazza', 'here'],
      ['player', 'north'],
      ['tobia', 'east'],
      ['laghetto1', 'south'],
    ]);
    // Far away, not in the surroundings, but in the map of the context.
    expect(around.some((s) => s.id === 'lontano')).toBe(false);
    expect(whereIs(map, self).map((e) => e.id)).toEqual(['piazza', 'orti']);
  });

  it('AGENT-002.a: the request has who it is, where, the map with coordinates, the surroundings, the hour and the part of the day, the memory and what happened', () => {
    const text = buildContext({
      identity: {
        id: 'marta',
        name: 'Marta',
        description: 'La pescatrice.',
        persona: 'Burbera ma gentile.',
        goals: ['pescare una carpa'],
      },
      map,
      self,
      nearby,
      time: 125.4,
      timeOfDay: '21:30',
      partOfDay: 'night',
      memory: ['t=100s viandante → you: ciao'],
      triggers: [
        { kind: 'message', from: 'player', fromName: 'viandante', to: 'marta', text: 'Cosa vedi?' },
      ],
    });
    expect(text).toContain('You are Marta');
    expect(text).toContain('La pescatrice.');
    expect(text).toContain('Burbera ma gentile.');
    expect(text).toContain('Your goals: pescare una carpa.');
    expect(text).toContain(
      'When a question is not about this world, answer with your own knowledge',
    );
    expect(text).toContain('- viandante (player) says to marta: Cosa vedi?');
    const state = JSON.parse(text.split('WORLD STATE (JSON):\n')[1]!.split('\n')[0]!) as {
      you: { at: number[]; in: string[] };
      time: { of_day: string; part_of_day: string; seconds: number };
      surroundings: { id: string }[];
      world: { elements: { id: string; at: number[]; description?: string }[] };
      memory: string[];
    };
    expect(state.you).toMatchObject({ at: [40.5, 40.5], in: ['piazza', 'orti'] });
    expect(state.time).toEqual({ of_day: '21:30', part_of_day: 'night', seconds: 125 });
    expect(text).toContain('This world has its own clock');
    expect(state.surroundings[0]!.id).toBe('orti');
    expect(state.world.elements.find((e) => e.id === 'lontano')).toMatchObject({
      at: [120, 120],
    });
    expect(state.world.elements.find((e) => e.id === 'orti')).toMatchObject({
      description: 'Zucchine e pomodori.',
    });
    expect(state.memory).toEqual(['t=100s viandante → you: ciao']);
  });

  it('AGENT-002.a: an agent with long answers is told it may answer fully (A8.1)', () => {
    const input = { map, self, nearby, time: 0, memory: [], triggers: [] };
    const identity = { id: 'marta', name: 'Marta', description: null };
    expect(buildContext({ ...input, identity })).toContain('Keep what you say short');
    expect(buildContext({ ...input, identity: { ...identity, answers: 'long' } })).toContain(
      'answer fully and precisely, up to about 300 words',
    );
  });

  it('CHAR-003.c: the agent of an animal never speaks a human language, only makes sounds, and moves about', () => {
    const input = {
      map,
      self,
      nearby,
      time: 0,
      memory: [],
      triggers: [{ kind: 'autonomous' as const }],
    };
    const text = buildContext({
      ...input,
      identity: { id: 'bimba', name: 'Bimba', description: 'Una scimmietta.', body: 'monkey' },
    });
    expect(text).toContain('You are Bimba, an animal of yw3d, a world of blocks: a monkey.');
    expect(text).toContain('You never speak a human language');
    expect(text).toContain('Never stand still for long.');
    expect(text).not.toContain('Answer in the language of whoever speaks to you');
    expect(text).toContain('Nothing in particular: decide what to do now');
  });

  it('LAB-008.a: the instructions have a name and the fingerprint of their fixed text', () => {
    expect(INSTRUCTIONS_VERSION.name).toBe(INSTRUCTIONS_NAME);
    expect(INSTRUCTIONS_VERSION.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(instructionsFingerprint(INSTRUCTION_TEXT)).toBe(INSTRUCTIONS_VERSION.fingerprint);
    // Changing a word of the fixed text changes the fingerprint.
    const changed = {
      ...INSTRUCTION_TEXT,
      human: { ...INSTRUCTION_TEXT.human, short: 'Keep what you say very short.' },
    };
    expect(instructionsFingerprint(changed)).not.toBe(INSTRUCTIONS_VERSION.fingerprint);
    // What belongs to a character is not part of the version: the text is filled in per agent.
    const input = { map, self, nearby, time: 0, memory: [], triggers: [] };
    const text = buildContext({ ...input, identity: { id: 'x', name: 'Ugo', description: null } });
    expect(text).toContain('You are Ugo, a character of yw3d');
    expect(JSON.stringify(INSTRUCTION_TEXT)).not.toContain('Ugo');
  });
});
