import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractTestRefs, parsePlan, parseSpec, trace } from './sdd-trace';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

const spec = fixture('spec.md');
const plan = fixture('plan.md');
const testSource = fixture('sample-tests.txt');

describe('sdd-trace', () => {
  it('SDD-001.a: parses requirements and criteria from the spec', () => {
    const requirements = parseSpec(spec);
    expect(requirements.map((r) => r.id)).toEqual(['WORLD-101', 'RENDER-101']);
    expect(requirements[0]!.title).toBe('Blocks');
    expect(requirements[0]!.criteria).toEqual([
      { letter: 'a', verification: 'unit' },
      { letter: 'b', verification: 'manuale' },
    ]);
    expect(requirements[1]!.criteria).toEqual([{ letter: 'a', verification: 'e2e' }]);
  });

  it('SDD-001.a: parses tasks and their requirements from the plan', () => {
    expect(parsePlan(plan)).toEqual([
      { id: 'T9.01', title: 'First task', requirements: ['WORLD-101'] },
      { id: 'T9.02+', title: 'Discovered task', requirements: ['RENDER-101', 'WORLD-999'] },
    ]);
  });

  it('SDD-001.a: extracts cited criteria from test titles', () => {
    expect(extractTestRefs(testSource, 'a.test.ts').map((r) => r.criteria)).toEqual([
      ['WORLD-101.a'],
      ['RENDER-101.a', 'WORLD-101.a'],
      ['WORLD-101.z'],
    ]);
  });

  it('SDD-001.a: builds the requirement → task → test matrix', () => {
    const requirements = parseSpec(spec);
    const tests = extractTestRefs(testSource, 'a.test.ts').slice(0, 2);
    const result = trace(requirements, [], parsePlan(plan).slice(0, 1), tests);
    expect(result.lines).toContain('  task: T9.01');
    expect(result.lines).toContain('  a [unit] ✓ a.test.ts');
    expect(result.lines).toContain('  b [manuale] verifica manuale');
  });

  it('SDD-001.b: fails on requirements without tasks and automated criteria without tests', () => {
    const requirements = parseSpec(spec);
    const result = trace(requirements, [], [], []);
    expect(result.errors).toEqual([
      'WORLD-101 non è citato da nessun task',
      'WORLD-101.a [unit] non è citato da nessun test',
      'RENDER-101 non è citato da nessun task',
      'RENDER-101.a [e2e] non è citato da nessun test',
    ]);
  });

  it('SDD-001.b: manual criteria do not need tests', () => {
    const requirements = parseSpec(spec);
    const tests = extractTestRefs(testSource, 'a.test.ts').slice(0, 2);
    const result = trace(requirements, [], parsePlan(plan).slice(0, 2), tests);
    expect(result.errors.filter((e) => e.includes('WORLD-101.b'))).toEqual([]);
  });

  it('SDD-001.c: reports unknown IDs cited by tasks and tests', () => {
    const requirements = parseSpec(spec);
    const tests = extractTestRefs(testSource, 'a.test.ts');
    const result = trace(requirements, [], parsePlan(plan), tests);
    expect(result.errors).toEqual([
      'T9.02+ cita WORLD-999, che non esiste nella spec',
      'a.test.ts: il test "WORLD-101.z: unknown letter" cita WORLD-101.z, che non esiste',
    ]);
  });

  it('SDD-001.c: IDs defined in the living specs are known', () => {
    const living = parseSpec('### WORLD-999 — Old\n- **a** `[unit]` Old criterion.\n');
    const result = trace(parseSpec(spec), living, parsePlan(plan), []);
    expect(result.errors.some((e) => e.includes('WORLD-999'))).toBe(false);
  });

  it('SDD-001.c: unchanged criteria of a modified requirement stay known', () => {
    const living = parseSpec(
      '### CAM-001 — Camera\n- **a** `[manuale]` A.\n- **b** `[manuale]` B.\n- **d** `[unit]` D.\n',
    );
    // The phase modifies only criterion b.
    const phase = parseSpec('### CAM-001 — Camera\n- **Dopo:**\n- **b** `[manuale]` New B.\n');
    const tasks = parsePlan('- [ ] **T2.01** Camera\n  - Req: CAM-001 · Dip: —\n');
    const tests = [{ file: 'camera.test.ts', title: 'CAM-001.d: clamp', criteria: ['CAM-001.d'] }];
    const result = trace(phase, living, tasks, tests);
    expect(result.errors).toEqual([]);
    const unknown = [{ file: 'camera.test.ts', title: 'CAM-001.z: nope', criteria: ['CAM-001.z'] }];
    expect(trace(phase, living, tasks, unknown).errors).toHaveLength(1);
  });
});
