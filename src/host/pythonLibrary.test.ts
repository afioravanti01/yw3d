import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import type { ModuleLoader } from './moduleLoader';
import { defaultPython, LIBRARY_PATH } from './python';
import { HostSession } from './session';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

/**
 * The Python library (PY-001, PY-002): its own rules run as `unittest` cases with a host played
 * by the tests (python/tests), and whole programs run against a real session.
 */

const python = defaultPython();

/** Runs some `unittest` cases of python/tests; fails with their output. */
function unittest(...cases: string[]): void {
  const result = spawnSync(python, ['-m', 'unittest', ...cases.map((c) => `test_character.${c}`)], {
    cwd: LIBRARY_PATH,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPATH: [LIBRARY_PATH, path.join(LIBRARY_PATH, 'tests')].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: '1',
    },
    timeout: 60_000,
  });
  if (result.error) throw new Error(`cannot run ${python}: ${result.error.message}`);
  expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
}

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 30], name: Ada }
places:
  - { id: pozzo, name: Pozzo vecchio, at: [44, 30] }
characters:
  - { id: tobia, name: Tobia, at: [30, 34], program: tobia.py }
`;

/** A character written as the guide will teach it: no JSON, only the library (PY-001.c). */
const TOBIA = `from yw3d import ActionFailed, Character, run


class Tobia(Character):
    async def routine(self):
        try:
            await self.walk_to((5000, 5000))
        except ActionFailed as error:
            self.log("cannot go:", error.reason)
        await self.walk_to("pozzo")
        print("at the well", round(self.position.x), [e.id for e in self.nearby])
        await self.say("Sono al pozzo")
        await self.walk_to((30, 34))
        await self.wait(1000)

    async def on_message(self, message):
        await self.say(f"Ciao {message.sender_name}")


run(Tobia)
`;

const sessions: HostSession[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.close();
});

async function world(program: string, places = '') {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-library-'));
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, WORLD_FILE),
    WORLD.replace('places:\n', places ? `${places}` : 'places:\n'),
  );
  writeFileSync(path.join(root, 'tobia.py'), program);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const said: string[] = [];
  const s = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    { consent: async () => true },
  );
  sessions.push(s);
  s.listen((line) => said.push(`${line.from}: ${line.text}`));
  await s.load();
  return { s, lines, said };
}

async function until(s: HostSession, done: () => boolean, seconds = 30): Promise<void> {
  const end = Date.now() + seconds * 1000;
  while (!done()) {
    if (Date.now() > end) throw new Error('timed out');
    for (let i = 0; i < 3; i++) s.advance(1 / 60);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('the Python library', () => {
  it('PY-001.b: only the standard library, and nothing newer than Python 3.10', () => {
    const check = `
import ast, pathlib, sys
problems = []
for file in sorted(pathlib.Path("yw3d").glob("*.py")):
    tree = ast.parse(file.read_text(), str(file), feature_version=(3, 10))
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            names = [node.module or ""]
        for name in names:
            if name.split(".")[0] not in sys.stdlib_module_names:
                problems.append(f"{file}: imports {name}")
        # Newer than 3.10: TaskGroup, asyncio.timeout, typing.Self.
        if isinstance(node, ast.Attribute) and node.attr in ("TaskGroup", "timeout", "Self"):
            problems.append(f"{file}:{node.lineno}: uses {node.attr}")
print("\\n".join(problems))
sys.exit(1 if problems else 0)
`;
    const result = spawnSync(python, ['-c', check], { cwd: LIBRARY_PATH, encoding: 'utf8' });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });

  it('PY-002.a, PY-002.b, PY-002.d: a class with a routine; awaited actions; a failure raises with its cause; state and map without asking', () => {
    unittest(
      'TestActions.test_actions_are_awaited_one_after_the_other',
      'TestActions.test_a_failed_action_raises_with_its_cause_and_a_replaced_one_does_not',
      'TestState.test_position_nearby_and_map_are_read_without_asking',
    );
  });

  it('PY-002.c: a message interrupts the routine, which then goes on from the interrupted action', () => {
    unittest(
      'TestInterruptions.test_a_message_interrupts_the_routine_which_goes_on_from_the_interrupted_action',
      'TestInterruptions.test_a_wait_goes_on_with_the_time_left',
      'TestInterruptions.test_the_routine_waits_while_a_handler_runs',
      'TestInterruptions.test_handlers_run_one_after_the_other',
      'TestInterruptions.test_without_on_message_the_routine_is_not_interrupted',
    );
  });

  it('PY-002.e: a question to the player or to a character waits for its answer, or for the time limit', () => {
    unittest(
      'TestQuestions.test_a_question_to_the_player_or_to_a_character_waits_for_its_answer',
      'TestQuestions.test_a_character_answers_a_question_aloud_or_to_the_asker',
    );
  });

  it('PY-002.a, PY-002.c, PROTO-004.a: on_near, on_far and on_interact interrupt the routine; a client driving the character pauses the program', () => {
    unittest(
      'TestOtherHandlers.test_on_near_on_far_and_on_interact_interrupt_the_routine',
      'TestPause.test_while_a_client_drives_the_actions_wait_and_then_go_on',
    );
  });

  it('PY-003.c: an uncaught error shows first the file, the line and the message, then the traceback', async () => {
    const { s, lines } = await world(`from yw3d import Character, run


class Tobia(Character):
    async def routine(self):
        await self.walk_to("pozzo")
        await self.walk_to("fontana")


run(Tobia)
`);
    await until(s, () => lines.some((l) => l.includes('program ended')));
    expect(s.programOf('tobia')?.state).toBe('error');
    expect(lines).toContain(
      'yw3d  [tobia] tobia.py:7: ActionFailed: walk_to failed: there is no "fontana" in the map',
    );
    expect(lines).toContain('yw3d  [tobia] Traceback (most recent call last):');
    expect(lines).toContain('yw3d  [tobia] program ended (exit code 1): the character stops');
    expect(lines.filter((l) => l.includes('Exception in thread'))).toEqual([]);
  });

  it('PY-005.a, PY-005.b: the template of the guide runs as it is, in less than 40 lines', async () => {
    const guide = readFileSync(path.join(LIBRARY_PATH, '..', 'docs', 'python.md'), 'utf8');
    const template = /```python\n([\s\S]*?)```/.exec(guide)![1]!;
    expect(template.trimEnd().split('\n').length).toBeLessThan(40);
    const places = `places:
  - { id: piazza, name: Piazza, at: [34, 34] }
  - { id: orti, name: Orti, at: [40, 30] }
  - { id: laghetto1, name: Laghetto, at: [36, 40] }
`;
    const { s, said } = await world(template, places);
    // The player is within 8 blocks: Tobia greets; then goes where it is told.
    await until(s, () => said.includes('tobia: Buongiorno, Ada!'));
    expect(s.playerSays('@tobia vai agli orti').ok).toBe(true);
    await until(s, () => said.includes('tobia: Vado a Orti!'));
    await until(s, () => {
      const t = s.agents!.stateOf('tobia')!;
      return Math.hypot(t.x - 40.5, t.z - 30.5) <= 1.8;
    });
  });

  it('PY-001.c, PY-002.a–d: a program written with the library drives its character through a real host', async () => {
    const { s, lines, said } = await world(TOBIA);
    // stderr and stdout are two pipes: wait for both lines.
    await until(
      s,
      () => said.includes('tobia: Sono al pozzo') && lines.some((l) => l.includes('at the well')),
    );
    expect(lines).toContainEqual(expect.stringMatching(/^yw3d {2}\[tobia\] cannot go: /));
    // print() goes to the terminal, not to the protocol.
    // The position is the one of the last perception, at most a quarter of a second old.
    expect(lines).toContainEqual(
      expect.stringMatching(/^yw3d {2}\[tobia\] at the well 4\d \['player'\]$/),
    );
    const tobia = s.agents!.stateOf('tobia')!;
    expect(Math.hypot(tobia.x - 44.5, tobia.z - 30.5)).toBeLessThanOrEqual(1.8);
    // On the way back, a message: the handler answers, then the walk goes on.
    await until(s, () => Math.hypot(s.agents!.stateOf('tobia')!.x - 44.5, 0) > 3);
    s.playerSays('@tobia ciao!');
    await until(s, () => said.includes('tobia: Ciao Ada'));
    await until(s, () => {
      const t = s.agents!.stateOf('tobia')!;
      return Math.hypot(t.x - 30.5, t.z - 34.5) <= 1.8;
    });
    expect(lines.filter((l) => l.includes('error'))).toEqual([]);
  });
});
