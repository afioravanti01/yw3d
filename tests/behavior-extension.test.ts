import { describe, expect, it } from 'vitest';
import { createDefaultBehaviors } from '../src/core/behaviors/builtin';
import { defineCondition, defineEvent, defineInstruction } from '../src/core/behaviors/registry';
import { behaviorHarness } from '../src/core/behaviors/testing';
import { composeWorld } from '../src/core/compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../src/core/gen/terrain';
import { createDefaultStructures } from '../src/core/structures/builtin';

/** A vocabulary extended from outside the core (BEHAV-004.f, P5). */
export function extendedBehaviors() {
  const registry = createDefaultBehaviors();
  // Says hello a number of times: an action built from the predefined ones.
  registry.registerInstruction(
    defineInstruction({
      name: 'greet',
      main: { kind: 'text', maxLength: 100 },
      options: { times: { kind: 'number', default: 1, min: 1, max: 5 } },
      instant: false,
      run: (args) => ({
        kind: 'action',
        action: {
          kind: 'say',
          text: Array(args.times as number)
            .fill(args.main)
            .join(' '),
        },
      }),
    }),
  );
  // Fires when the counter reaches a value.
  registry.registerEvent(
    defineEvent({
      name: 'reached',
      main: { kind: 'counter' },
      options: { value: { kind: 'number' } },
      check: (args, context) => context.counter(args.main as string) >= (args.value as number),
    }),
  );
  registry.registerCondition(
    defineCondition({
      name: 'even',
      main: { kind: 'counter' },
      test: (args, context) => context.counter(args.main as string) % 2 === 0,
    }),
  );
  return registry;
}

const world = (behavior: string) => `version: 2
name: Test
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
characters:
  - id: tobia
    name: Tobia
    at: [30, 30]
    behavior:
${behavior
  .trim()
  .split('\n')
  .map((l) => `      ${l}`)
  .join('\n')}
`;

const compose = (behavior: string) =>
  composeWorld(world(behavior), 'worlds/ext.yaml', {
    registry: createDefaultStructures(),
    behaviors: extendedBehaviors(),
  });

describe('behavior vocabulary extended from outside the core', () => {
  it('BEHAV-004.f: new instructions, events and conditions are checked at once in the world file', () => {
    const valid = compose(`
memory: { counters: [volte] }
routine:
  - greet: Ciao!
    times: 2
  - count: volte
  - if: { even: volte }
    then:
      - greet: Pari!
reactions:
  - on: { reached: volte, value: 3 }
    do:
      - greet: Tre!
`);
    expect(valid.diagnostics).toEqual([]);
    const program = valid.characters[0]!.behavior!;
    expect(program.states[0]!.routine[0]!.definition.name).toBe('greet');
    expect(program.states[0]!.reactions[0]!.event.definition.name).toBe('reached');

    // Their fields are checked like the predefined ones.
    expect(compose('routine:\n  - greet: Ciao!\n    times: 9').diagnostics[0]).toMatchObject({
      line: 11,
      path: 'characters[0].behavior.routine[0].times',
      message: '9 is out of range: between 1 and 5',
    });
    expect(compose('routine:\n  - gret: Ciao!').diagnostics[0]?.message).toContain(
      'unknown instruction (did you mean "greet"?)',
    );
    // Without the extension, the same file is an error.
    const plain = composeWorld(world('routine:\n  - greet: Ciao!'), 'worlds/ext.yaml', {
      registry: createDefaultStructures(),
    });
    expect(plain.world).toBeUndefined();
  });

  it('BEHAV-004.f: a name already used in the vocabulary is an error', () => {
    const registry = createDefaultBehaviors();
    expect(() =>
      registry.registerInstruction(
        defineInstruction({
          name: 'say',
          main: { kind: 'text' },
          instant: false,
          run: () => ({ kind: 'done' }),
        }),
      ),
    ).toThrow('The behavior instruction "say" is already registered');
  });

  it('BEHAV-004.f: the new vocabulary runs like the predefined one', () => {
    const h = behaviorHarness(
      `characters:
  - id: tobia
    name: Tobia
    at: [20, 20]
    behavior:
      memory: { counters: [volte] }
      routine:
        - greet: Ciao!
          times: 2
        - count: volte
        - if: { even: volte }
          then: [{ say: pari }]
          else: [{ say: dispari }]
      reactions:
        - on: { reached: volte, value: 3 }
          do: [{ say: tre volte }]
`,
      { behaviors: extendedBehaviors() },
    );
    h.run(20);
    // The counter reaches 3 during a step; the event is seen at the next one, and interrupts
    // «dispari», which starts again after the reaction.
    expect(h.said('tobia').slice(0, 8)).toEqual([
      'Ciao! Ciao!',
      'dispari',
      'Ciao! Ciao!',
      'pari',
      'Ciao! Ciao!',
      'dispari',
      'tre volte',
      'dispari',
    ]);
  });
});
