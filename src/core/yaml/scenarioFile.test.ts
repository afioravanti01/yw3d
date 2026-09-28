import { describe, expect, it } from 'vitest';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createTestRegistry } from '../structures/testing';
import { DEFAULT_MAX_STEPS, loadScenarioFile } from './scenarioFile';
import { loadWorldFile } from './worldFile';

const HEADER = `version: 2
name: Test
terrain: { seed: 3, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
places:
  - { id: fontana, name: Fontana, at: [30, 30] }
  - { id: prato, name: Prato, area: { circle: { center: [20, 20], radius: 5 } } }
characters:
  - { id: marta, name: Marta, at: [10, 10], agent: { mode: fake } }
  - { id: anselmo, name: Anselmo, at: [12, 10], agent: { mode: fake } }
  - { id: tobia, name: Tobia, at: [14, 10] }
`;

const SCENARIO = `id: commissione
name: La commissione
agent: marta
task: Vai alla fontana e poi torna qui.
time_limit: 300
`;

const indent = (text: string) =>
  text
    .trimEnd()
    .split('\n')
    .map((line, i) => (i === 0 ? `  - ${line}` : `    ${line}`))
    .join('\n');

const world = (scenarios: string) => `${HEADER}scenarios:\n${scenarios}\n`;

const compose = (text: string, files: Record<string, string> = {}, host = true) =>
  composeWorld(text, 'world.yaml', {
    registry: createTestRegistry(),
    ...(host
      ? {
          readScenario: (path: string) =>
            files[path] === undefined ? undefined : { text: files[path]!, file: path },
        }
      : {}),
  });

const problems = (result: ReturnType<typeof compose>) =>
  result.diagnostics.map((d) => `${d.file}:${d.line} ${d.path} ${d.message}`);

describe('scenarios in the world file', () => {
  it('LAB-001.a: a scenario declares agent, task, time limit, steps and perturbations', () => {
    const { world: decl, diagnostics } = loadWorldFile(
      world(
        indent(`${SCENARIO}description: Una prova.
max_steps: 20
perturbations:
  - { at: 30, say: { by: tobia, text: "Il ponte è crollato!", to: marta } }
  - { at: 60, move_place: { place: fontana, to: [40, 40] } }
  - { at: 90, blocks: { from: [20, 30, 20], to: [22, 33, 20], block: cobblestone } }
  - { at: 120, goals: { agent: marta, goals: [riposare] } }`),
      ),
      'world.yaml',
    );
    expect(diagnostics).toEqual([]);
    const entry = decl!.scenarios![0]!;
    expect(entry.kind).toBe('inline');
    expect(entry.kind === 'inline' && entry.scenario).toMatchObject({
      id: 'commissione',
      agent: 'marta',
      task: 'Vai alla fontana e poi torna qui.',
      time_limit: 300,
      max_steps: 20,
      perturbations: [
        { at: 30, kind: 'say', by: 'tobia', text: 'Il ponte è crollato!', to: 'marta' },
        { at: 60, kind: 'move_place', place: 'fontana', to: [40, 40] },
        { at: 90, kind: 'blocks', from: [20, 30, 20], to: [22, 33, 20], block: 'cobblestone' },
        { at: 120, kind: 'goals', agent: 'marta', goals: ['riposare'] },
      ],
    });
  });

  it(`LAB-001.a: steps default to ${DEFAULT_MAX_STEPS}; a scenario can be a file of the folder`, () => {
    const result = compose(world(`${indent(SCENARIO)}\n  - scenarios/esplora.yaml`), {
      'scenarios/esplora.yaml': SCENARIO.replace('commissione', 'esplora').replace(
        'marta',
        'anselmo',
      ),
    });
    expect(problems(result)).toEqual([]);
    expect(result.scenarios.map((s) => [s.id, s.agent, s.max_steps, s.file])).toEqual([
      ['commissione', 'marta', DEFAULT_MAX_STEPS, 'world.yaml'],
      ['esplora', 'anselmo', DEFAULT_MAX_STEPS, 'scenarios/esplora.yaml'],
    ]);
  });

  it('LAB-001.a: errors name their file and line, also in an imported file', () => {
    expect(problems(compose(world('  - ../fuori.yaml')))).toEqual([
      'world.yaml:12 scenarios[0] the scenario file "../fuori.yaml" must be a YAML file inside the world folder',
    ]);
    expect(
      problems(
        compose(world('  - scenarios/manca.yaml\n  - scenarios/rotto.yaml'), {
          'scenarios/rotto.yaml': `${SCENARIO.replace('time_limit: 300\n', '')}time_limit: 0\nmood: calm\n`,
        }),
      ),
    ).toEqual([
      'world.yaml:12 scenarios[0] cannot read the scenario file "scenarios/manca.yaml"',
      'scenarios/rotto.yaml:5 time_limit 0 is out of range: expected a number between 1 and 86400',
      'scenarios/rotto.yaml:6 mood unknown field',
    ]);
    const perturbation = loadScenarioFile(
      `${SCENARIO}perturbations:\n  - { at: 5, say: { by: tobia, text: ciao }, goals: { agent: marta, goals: [x] } }\n`,
      's.yaml',
    );
    expect(perturbation.diagnostics.map((d) => `${d.line} ${d.path} ${d.message}`)).toEqual([
      '7 perturbations[0] a perturbation has "at" and exactly one of say, move_place, blocks, goals',
    ]);
  });

  it('LAB-001.b: the agent exists and has an agent, one scenario per agent; perturbations name the world', () => {
    const second = SCENARIO.replace('commissione', 'bis');
    expect(
      problems(
        compose(
          world(
            [
              indent(SCENARIO.replace('agent: marta', 'agent: nessuno')),
              indent(
                SCENARIO.replace('agent: marta', 'agent: tobia').replace('commissione', 'tre'),
              ),
              indent(`${SCENARIO}perturbations:
  - { at: 1, say: { by: nessuno, text: ciao } }
  - { at: 2, move_place: { place: prato, to: [1, 1] } }
  - { at: 3, goals: { agent: tobia, goals: [x] } }
  - { at: 4, blocks: { from: [0, 0, 0], to: [63, 95, 63], block: marmo } }
  - { at: 5, blocks: { from: [0, 0, 0], to: [64, 1, 1], block: stone } }`),
              indent(second),
            ].join('\n'),
          ),
        ),
      ),
    ).toEqual([
      'world.yaml:14 scenarios[0].agent there is no character "nessuno"',
      'world.yaml:19 scenarios[1].agent the character "tobia" has no agent: give it "agent:" first',
      'world.yaml:22 scenarios[2].id another scenario has the id "commissione"',
      'world.yaml:28 scenarios[2].perturbations[0].say.by there is no character "nessuno"',
      'world.yaml:29 scenarios[2].perturbations[1].move_place.place the place "prato" is an area: only a place with "at" can move',
      'world.yaml:30 scenarios[2].perturbations[2].goals.agent "tobia" is not a character with an agent',
      expect.stringMatching(
        /^world\.yaml:31 scenarios\[2\]\.perturbations\[3\]\.blocks\.block unknown block "marmo": one of air, grass/,
      ),
      'world.yaml:31 scenarios[2].perturbations[3].blocks.to 393216 blocks: a perturbation changes at most 4096',
      'world.yaml:32 scenarios[2].perturbations[4].blocks.to the point is outside the world (64 × 96 × 64)',
      'world.yaml:35 scenarios[3].agent the agent of "marta" already has the scenario "commissione": one scenario per agent',
    ]);
  });

  it('LAB-001.c: scenarios do not change the world; without the host imported ones are skipped', () => {
    const plain = compose(HEADER);
    const withScenarios = compose(
      world(`${indent(SCENARIO)}\n  - scenarios/esplora.yaml`),
      {},
      false,
    );
    expect(problems(withScenarios)).toEqual([]);
    expect(withScenarios.world!.hash()).toBe(plain.world!.hash());
    expect(withScenarios.scenarios.map((s) => s.id)).toEqual(['commissione']);
  });
});
