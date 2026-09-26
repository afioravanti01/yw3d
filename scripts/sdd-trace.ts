/**
 * SDD traceability check (SDD-001).
 *
 * Usage: npm run sdd:trace -- F01
 *
 * Reads the phase spec (requirements and acceptance criteria), the phase plan (tasks and the
 * requirements they cover) and the test sources (criteria cited in test titles), prints a
 * requirement → task → test matrix and exits with a non-zero code when coverage is incomplete.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Verification = 'unit' | 'e2e' | 'manuale';

export interface Criterion {
  letter: string;
  verification: Verification;
}

export interface Requirement {
  id: string;
  title: string;
  criteria: Criterion[];
}

export interface Task {
  id: string;
  title: string;
  requirements: string[];
}

export interface TestRef {
  file: string;
  title: string;
  criteria: string[];
}

export interface TraceResult {
  lines: string[];
  errors: string[];
}

const REQUIREMENT_HEADING = /^###\s+([A-Z]+-\d{3})\b\s*[—–-]?\s*(.*)$/;
const CRITERION_LINE = /^-\s+\*\*([a-z])\*\*\s+`\[(unit|e2e|manuale)\]`/;
const TASK_LINE = /^-\s+\[[ xX]\]\s+\*\*(T\d+\.\d+\+?)\*\*\s*(.*)$/;
const REQ_LINE = /^\s+-\s+Req:\s*(.*)$/;
const REQUIREMENT_ID = /\b[A-Z]+-\d{3}\b/g;
const CRITERION_ID = /\b([A-Z]+-\d{3})\.([a-z])\b/g;
const TEST_CALL = /\b(?:it|test)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

export function parseSpec(markdown: string): Requirement[] {
  const requirements: Requirement[] = [];
  let current: Requirement | undefined;
  for (const line of markdown.split('\n')) {
    const heading = REQUIREMENT_HEADING.exec(line);
    if (heading) {
      current = { id: heading[1]!, title: heading[2]!.trim(), criteria: [] };
      requirements.push(current);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      current = undefined;
      continue;
    }
    const criterion = CRITERION_LINE.exec(line);
    if (criterion && current) {
      current.criteria.push({
        letter: criterion[1]!,
        verification: criterion[2] as Verification,
      });
    }
  }
  return requirements;
}

export function parsePlan(markdown: string): Task[] {
  const tasks: Task[] = [];
  let current: Task | undefined;
  for (const line of markdown.split('\n')) {
    const task = TASK_LINE.exec(line);
    if (task) {
      current = { id: task[1]!, title: task[2]!.trim(), requirements: [] };
      tasks.push(current);
      continue;
    }
    if (/^\S/.test(line)) {
      current = undefined;
      continue;
    }
    const req = REQ_LINE.exec(line);
    if (req && current) {
      // Only the part before the dependency marker lists requirements.
      const reqPart = req[1]!.split('·')[0]!;
      current.requirements.push(...(reqPart.match(REQUIREMENT_ID) ?? []));
    }
  }
  return tasks;
}

export function extractTestRefs(source: string, file: string): TestRef[] {
  const refs: TestRef[] = [];
  for (const match of source.matchAll(TEST_CALL)) {
    const title = match[2]!;
    const criteria = [...title.matchAll(CRITERION_ID)].map((m) => `${m[1]}.${m[2]}`);
    if (criteria.length > 0) {
      refs.push({ file, title, criteria });
    }
  }
  return refs;
}

/**
 * Builds the matrix for the phase requirements. `knownRequirements` also contains the living
 * specs, so that tests of earlier phases are not reported as unknown.
 */
export function trace(
  phase: Requirement[],
  knownRequirements: Requirement[],
  tasks: Task[],
  tests: TestRef[],
): TraceResult {
  const lines: string[] = [];
  const errors: string[] = [];
  // A requirement MODIFIED by the phase lists only its new or changed criteria: the unchanged
  // ones still come from the living spec, so the criteria are merged, phase letters winning.
  const known = new Map<string, Requirement>();
  for (const r of [...knownRequirements, ...phase]) {
    const previous = known.get(r.id);
    const letters = new Set(r.criteria.map((c) => c.letter));
    const kept = previous?.criteria.filter((c) => !letters.has(c.letter)) ?? [];
    known.set(r.id, { ...r, criteria: [...kept, ...r.criteria] });
  }

  for (const task of tasks) {
    for (const id of task.requirements) {
      if (!known.has(id)) {
        errors.push(`${task.id} cita ${id}, che non esiste nella spec`);
      }
    }
  }
  for (const test of tests) {
    for (const criterionId of test.criteria) {
      const [reqId, letter] = criterionId.split('.') as [string, string];
      const req = known.get(reqId);
      if (!req || !req.criteria.some((c) => c.letter === letter)) {
        errors.push(`${test.file}: il test "${test.title}" cita ${criterionId}, che non esiste`);
      }
    }
  }

  for (const req of phase) {
    const coveringTasks = tasks.filter((t) => t.requirements.includes(req.id)).map((t) => t.id);
    lines.push(`${req.id}  ${req.title}`);
    lines.push(`  task: ${coveringTasks.length > 0 ? coveringTasks.join(', ') : '—'}`);
    if (coveringTasks.length === 0) {
      errors.push(`${req.id} non è citato da nessun task`);
    }
    for (const criterion of req.criteria) {
      const id = `${req.id}.${criterion.letter}`;
      const label = `  ${criterion.letter} [${criterion.verification}]`;
      if (criterion.verification === 'manuale') {
        lines.push(`${label} verifica manuale`);
        continue;
      }
      const files = [...new Set(tests.filter((t) => t.criteria.includes(id)).map((t) => t.file))];
      if (files.length === 0) {
        lines.push(`${label} ✗ nessun test`);
        errors.push(`${id} [${criterion.verification}] non è citato da nessun test`);
      } else {
        lines.push(`${label} ✓ ${files.join(', ')}`);
      }
    }
  }
  return { lines, errors };
}

function listFiles(dir: string, predicate: (file: string) => boolean): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) {
      return [];
    }
    if (statSync(full).isDirectory()) {
      return listFiles(full, predicate);
    }
    return predicate(full) ? [full] : [];
  });
}

function main(argv: string[]): number {
  const phaseId = argv[0];
  if (!phaseId || !/^F\d{2}$/.test(phaseId)) {
    console.error('Uso: npm run sdd:trace -- F01');
    return 2;
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const phasesDir = path.join(root, 'sdd/phases');
  const phaseDir = readdirSync(phasesDir).find((d) => d.startsWith(`${phaseId}-`));
  if (!phaseDir) {
    console.error(`Fase ${phaseId} non trovata in sdd/phases`);
    return 2;
  }
  const phase = parseSpec(readFileSync(path.join(phasesDir, phaseDir, 'spec.md'), 'utf8'));
  const tasks = parsePlan(readFileSync(path.join(phasesDir, phaseDir, 'plan.md'), 'utf8'));
  const living = listFiles(path.join(root, 'sdd/specs'), (f) => f.endsWith('.md')).flatMap((f) =>
    parseSpec(readFileSync(f, 'utf8')),
  );
  const testFiles = ['src', 'tests', 'scripts', 'e2e'].flatMap((dir) =>
    listFiles(path.join(root, dir), (f) => /\.(test|spec)\.ts$/.test(f)),
  );
  const tests = testFiles.flatMap((f) =>
    extractTestRefs(readFileSync(f, 'utf8'), path.relative(root, f)),
  );

  const result = trace(phase, living, tasks, tests);
  console.log(`Tracciabilità ${phaseId}: ${phase.length} requisiti, ${tasks.length} task\n`);
  console.log(result.lines.join('\n'));
  if (result.errors.length > 0) {
    console.log(`\n${result.errors.length} problemi:`);
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
    return 1;
  }
  console.log('\nCopertura completa.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
