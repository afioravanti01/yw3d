import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { AIR } from '../src/core/blocks/builtin';
import { composeWorld } from '../src/core/compose/composeWorld';
import type { EntityState, Intent } from '../src/core/physics/entity';
import { PhysicsWorld } from '../src/core/physics/physicsWorld';
import { PLAYER_SIZE } from '../src/core/player/player';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { createDefaultStructures } from '../src/core/structures/builtin';
import { generateTerrain } from '../src/core/gen/terrain';

/** The subset of the app test hook (src/app/testHook.ts) used here. */
interface Hook {
  ready: boolean;
  status: 'loading' | 'ready' | 'error';
  world: string;
  seed: number;
  warning: string | null;
  messages: string[];
  structureCounts: Record<string, number>;
  frames: number;
  worldHash(): number;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  stats(): { meshedChunks: number; triangles: number; rebuiltChunks: number };
  nextFrame(): Promise<void>;
  setView(x: number, y: number, z: number, yaw: number, pitch: number): void;
  simulate(start: { x: number; y: number; z: number }, intents: Intent[]): EntityState;
}

/**
 * Functions passed to page.evaluate run in the browser, so they cannot close over helpers of
 * this file: each one reads the hook through this global.
 */
type HookGlobal = { __yw3d: Hook };

async function open(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`);
  await page.waitForFunction(
    () => (globalThis as unknown as Partial<HookGlobal>).__yw3d?.ready === true,
    undefined,
    { timeout: 60_000 },
  );
}

/** Reads a plain value from the hook. */
function hookValue<K extends keyof Hook>(page: Page, key: K): Promise<Hook[K]> {
  return page.evaluate((k) => (globalThis as unknown as HookGlobal).__yw3d[k], key) as Promise<
    Hook[K]
  >;
}

const worldHash = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as HookGlobal).__yw3d.worldHash());

function nodeWorld(path: string, seedOverride?: number) {
  return composeWorld(readFileSync(path, 'utf8'), path, {
    registry: createDefaultStructures(),
    seedOverride,
  });
}

test('APP-001.a: the seed comes from the world file; ?seed= replaces it with a notice', async ({
  page,
}) => {
  await open(page);
  expect(await hookValue(page, 'seed')).toBe(1);
  await expect(page.locator('#notice')).toBeHidden();
  await open(page, '?seed=42');
  expect(await hookValue(page, 'seed')).toBe(42);
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#notice')).toContainText('seed 42 from the URL replaces');
  expect(await worldHash(page)).toBe(nodeWorld('worlds/default.yaml', 42).world!.hash());
});

test('APP-001.b: an invalid seed shows a visible notice and uses the seed of the file', async ({
  page,
}) => {
  await open(page, '?seed=abc');
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#notice')).toContainText('"abc"');
  expect(await hookValue(page, 'seed')).toBe(1);
});

test('YAML-001.d: the world of a file has the same hash in the browser and in Node', async ({
  page,
}) => {
  await open(page, '?world=test-valid');
  expect(await worldHash(page)).toBe(nodeWorld('e2e/worlds/test-valid.yaml').world!.hash());
  await open(page);
  expect(await worldHash(page)).toBe(nodeWorld('worlds/default.yaml').world!.hash());
});

test('WORLD-005.d: the bare terrain has the same hash in the browser and in Node', async ({
  page,
}) => {
  await open(page, '?world=test-terrain');
  expect(await worldHash(page)).toBe(generateTerrain(7).hash());
});

test('YAML-002.d: with an invalid file there is no world and the errors are shown', async ({
  page,
}) => {
  await open(page, '?world=test-invalid');
  expect(await hookValue(page, 'status')).toBe('error');
  expect(await hookValue(page, 'frames')).toBe(0);
  const notice = page.locator('#notice');
  await expect(notice).toBeVisible();
  await expect(notice.locator('.error')).toHaveCount(2);
  await expect(notice).toContainText('e2e/worlds/test-invalid.yaml:9  error  structures[0].type');
  await expect(notice).toContainText('e2e/worlds/test-invalid.yaml:10  error  structures[1].at');
});

test('YAML-003.c: a different generator version gives a visible warning', async ({ page }) => {
  await open(page, '?world=test-generator');
  expect(await hookValue(page, 'status')).toBe('ready');
  await expect(page.locator('#notice .warning')).toContainText(
    'written for terrain generator 99, the current one is 1',
  );
});

test('APP-003.a: without the host the app runs on its own with the worlds of the project', async ({
  page,
}) => {
  await open(page);
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { __yw3d: { connection: unknown } }).__yw3d.connection,
    ),
  ).toBeNull();
  expect(await hookValue(page, 'world')).toBe('default');
  expect(await hookValue(page, 'status')).toBe('ready');
});

type Talk = {
  consoleLines(): string[];
  consoleOpen(): boolean;
  consoleSuggestions(): string[];
  player(): { x: number; z: number };
};
const talk = <K extends keyof Talk>(page: Page, key: K) =>
  page.evaluate((k) => (globalThis as unknown as { __yw3d: Talk }).__yw3d[k](), key) as Promise<
    ReturnType<Talk[K]>
  >;

test('DIALOG-005.c, DIALOG-001.a: Enter moves to the box of the console; while writing keys do not move the player; Esc goes back to the game', async ({
  page,
}) => {
  await open(page, '?world=test-dialogue');
  await page.waitForTimeout(500);
  expect(await talk(page, 'consoleOpen')).toBe(false);
  await page.keyboard.press('Enter');
  expect(await talk(page, 'consoleOpen')).toBe(true);
  await expect(page.locator('#console textarea')).toBeFocused();
  const before = await talk(page, 'player');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  await page.keyboard.type('dddd ssss');
  const after = await talk(page, 'player');
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
  await expect(page.locator('#console textarea')).toHaveValue('wdddd ssss');
  await page.keyboard.press('Escape');
  expect(await talk(page, 'consoleOpen')).toBe(false);
  // Nothing was said; the keys move the player again.
  expect((await talk(page, 'consoleLines')).some((l) => l.startsWith('Tu'))).toBe(false);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  const moved = await talk(page, 'player');
  expect(Math.hypot(moved.x - after.x, moved.z - after.z)).toBeGreaterThan(0.5);
});

test('DIALOG-005.a, DIALOG-002.a: the console on the right shows every message, oldest first, with who speaks and to whom', async ({
  page,
}) => {
  await open(page, '?world=test-dialogue');
  await page.waitForTimeout(500);
  const say = async (text: string) => {
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  await say('@anna ciao!');
  await say('Buongiorno a tutti');
  await say('@nessuno ciao');
  await expect
    .poll(() => talk(page, 'consoleLines'))
    .toEqual([
      'Tu → Anna: ciao!',
      'Tu: Buongiorno a tutti',
      'no character is called "nessuno"; the characters are: Anna (anna), Bruno (bruno)',
    ]);
  // On the right half of the view, newest at the bottom.
  const box = (await page.locator('#console').boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThan(width / 2);
  const items = page.locator('#console ol li');
  const first = (await items.first().boundingBox())!;
  const last = (await items.last().boundingBox())!;
  expect(last.y).toBeGreaterThan(first.y);
});

test('DIALOG-005.a, DIALOG-005.b, DIALOG-005.c: the console is a block as high as the window; messages are free selectable text with Markdown; the scene keeps the mouse outside it', async ({
  page,
}) => {
  await open(page, '?world=test-dialogue');
  await page.waitForTimeout(500);
  const at = (x: number, y: number) =>
    page.evaluate(
      ([x, y]) => {
        type Element = { id: string; tagName: string };
        const page = globalThis as unknown as {
          document: { elementFromPoint(x: number, y: number): Element | null };
        };
        const element = page.document.elementFromPoint(x!, y!);
        return element?.id || element?.tagName;
      },
      [x, y],
    );
  // The block is always there, as high as the window, with its box at the bottom (A7.1, A7.4).
  const block = (await page.locator('#console').boundingBox())!;
  const box = (await page.locator('#console textarea').boundingBox())!;
  const { width, height } = page.viewportSize()!;
  await expect(page.locator('#console textarea')).toBeVisible();
  expect(block.y).toBeLessThanOrEqual(16);
  expect(block.y + block.height).toBeGreaterThanOrEqual(height - 16);
  expect(box.y + box.height).toBeGreaterThan(block.y + block.height - 20);
  expect(await at(box.x + box.width / 2, box.y + box.height / 2)).toBe('TEXTAREA');
  // Left of the block, the scene.
  expect(await at(block.x - 20, height / 2)).toBe('world');
  expect(block.x).toBeGreaterThan(width / 2);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Buongiorno a **tutti**');
  await page.keyboard.press('Enter');
  // The messages are at the top, free text that can be selected (A7.4).
  const line = page.locator('#console > ol > li').first();
  const bounds = (await line.boundingBox())!;
  expect(bounds.y).toBeLessThan(block.y + 60);
  await expect(line.locator('strong.who')).toHaveText('Tu');
  await expect(line.locator('p > strong:not(.who)')).toHaveText('tutti');
  const style = await line.evaluate((li) => {
    const css = (
      globalThis as unknown as { getComputedStyle(e: unknown): Record<string, string> }
    ).getComputedStyle(li);
    return { background: css['backgroundColor'], select: css['userSelect'] };
  });
  expect(style).toEqual({ background: 'rgba(0, 0, 0, 0)', select: 'text' });
});

test('DIALOG-005.d, DIALOG-005.f: after @ the console suggests the names and Tab completes; /help, /world and /describe answer in the console', async ({
  page,
}) => {
  await open(page, '?world=test-dialogue');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.keyboard.type('@');
  expect(await talk(page, 'consoleSuggestions')).toEqual(['anna', 'bruno']);
  await page.keyboard.type('b');
  expect(await talk(page, 'consoleSuggestions')).toEqual(['bruno']);
  await page.keyboard.press('Tab');
  await expect(page.locator('#console textarea')).toHaveValue('@Bruno ');
  // The box has two lines; Shift+Enter starts a new line of the same message.
  expect(await page.locator('#console textarea').getAttribute('rows')).toBe('2');
  await page.keyboard.type('prima riga');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('seconda riga');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => talk(page, 'consoleLines'))
    .toContain('Tu → Bruno: prima rigaseconda riga');
  await expect(page.locator('#console > ol > li').last().locator('br')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('@Bruno ');
  expect(await talk(page, 'consoleSuggestions')).toEqual([]);
  await page.keyboard.type('ciao');
  await page.keyboard.press('Enter');
  await expect.poll(() => talk(page, 'consoleLines')).toContain('Tu → Bruno: ciao');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/help');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => talk(page, 'consoleLines'))
    .toContainEqual(expect.stringContaining('/help: this help.'));
  await page.keyboard.press('Enter');
  await page.keyboard.type('/world');
  await page.keyboard.press('Enter');
  // One block, with the characters where they are.
  await expect
    .poll(() => talk(page, 'consoleLines'))
    .toContainEqual(expect.stringContaining('Anna (anna) · 61, 61'));
  const world = (await talk(page, 'consoleLines')).filter((l) => l.includes('Anna (anna)'));
  expect(world).toHaveLength(1);
  expect(world[0]).toContain('Bruno (bruno)');
  // A line closes the answer of a command.
  const answer = page.locator('#console > ol > li.info').last();
  expect(
    await answer.evaluate(
      (li) =>
        (
          globalThis as unknown as { getComputedStyle(e: unknown): Record<string, string> }
        ).getComputedStyle(li)['borderBottomStyle'],
    ),
  ).toBe('solid');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/describe @Anna');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => talk(page, 'consoleLines'))
    .toContainEqual(expect.stringContaining('Anna (anna)'));
  // Commands are not said in the world.
  expect((await talk(page, 'consoleLines')).some((l) => l.includes('Tu: /help'))).toBe(false);
});

test('CHAR-002.d, CHAR-002.c: names over the characters, the bubble above the name, with Markdown; the player named where its figure shows', async ({
  page,
}) => {
  await open(page, '?world=test-dialogue');
  const names = () => page.locator('#bubbles .label .name').allTextContents();
  // Third person: the characters in view and the player's figure, each with its name.
  await page.keyboard.press('KeyV');
  await expect.poll(names).toEqual(expect.arrayContaining(['Anna', 'Bruno', 'viandante']));
  await expect(page.locator('#bubbles .label[data-id="anna"] .name')).toHaveText('Anna');
  // When the player speaks, its bubble is in its label, above its name.
  await page.keyboard.press('Enter');
  await page.keyboard.type('@anna **ciao**!');
  await page.keyboard.press('Enter');
  const player = page.locator('#bubbles .label[data-id="player"]');
  await expect(player.locator('.bubble')).toBeVisible();
  // The bubble shows the Markdown, as the console does (A7.8).
  await expect(player.locator('.bubble strong')).toHaveText('ciao');
  await expect(player.locator('.bubble')).toHaveText('ciao!');
  const [bubble, name] = await Promise.all([
    player.locator('.bubble').boundingBox(),
    player.locator('.name').boundingBox(),
  ]);
  expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(name!.y + 1);
  // First person: no label over the player itself.
  await page.keyboard.press('KeyV');
  await expect.poll(names).not.toContain('viandante');
});

test('YAML-009.c: the title of the page is the name of the world', async ({ page }) => {
  await open(page, '?world=test-dialogue');
  await expect(page).toHaveTitle('Borgo dei test');
  await open(page);
  await expect(page).toHaveTitle('La valle');
});

test('CHAR-001.d: without the host the characters stand where they start', async ({ page }) => {
  await open(page, '?world=test-characters');
  await page.waitForTimeout(500);
  const characters = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __yw3d: { characters(): { id: string; x: number; z: number; speech: string | null }[] };
      }
    ).__yw3d.characters(),
  );
  expect(characters.map((c) => [c.id, c.x, c.z, c.speech])).toEqual([
    ['anna', 60.5, 60.5, null],
    ['bruno', 70.5, 64.5, null],
  ]);
});

test('YAML-006.a: the default world loads without parameters, another one with ?world=', async ({
  page,
}) => {
  await open(page);
  expect(await hookValue(page, 'world')).toBe('default');
  expect((await hookValue(page, 'structureCounts'))['stone_farmhouse']).toBeGreaterThan(0);
  await open(page, '?world=test-valid');
  expect(await hookValue(page, 'world')).toBe('test-valid');
  expect(await hookValue(page, 'structureCounts')).toEqual(
    nodeWorld('e2e/worlds/test-valid.yaml').structureCounts,
  );
});

test('YAML-006.b: an unknown world gives a visible error listing the available ones', async ({
  page,
}) => {
  await open(page, '?world=nowhere');
  expect(await hookValue(page, 'status')).toBe('error');
  await expect(page.locator('#notice .error')).toContainText('Unknown world "nowhere"');
  await expect(page.locator('#notice .error')).toContainText('default');
});

test('PHYS-002.d: a sequence of intents gives the same state in the browser and in Node', async ({
  page,
}) => {
  // Walk, run and jump around the village for 20 s, then into the pond south of it.
  const intents: Intent[] = [];
  for (let i = 0; i < 1200; i++) {
    const angle = i / 150;
    const length = Math.hypot(Math.sin(angle), Math.cos(angle));
    intents.push({
      moveX: Math.sin(angle) / length,
      moveZ: Math.cos(angle) / length,
      run: i % 400 < 200,
      jump: i % 45 === 0,
      swim: i % 300 < 100 ? 1 : 0,
    });
  }
  const start = { x: 158.5, y: 60, z: 66.5 };
  await open(page);
  const browser = await page.evaluate(
    ([s, list]) => (globalThis as unknown as HookGlobal).__yw3d.simulate(s, list),
    [start, intents] as const,
  );
  const { world } = nodeWorld('worlds/default.yaml');
  const physics = new PhysicsWorld(world!, createDefaultRegistry());
  const entity = physics.spawn(PLAYER_SIZE, start.x, start.y, start.z);
  for (const intent of intents) {
    entity.intent = intent;
    physics.step();
  }
  expect(browser).toEqual(entity.state);
  // The walk really moved the entity around.
  expect(Math.hypot(entity.state.x - start.x, entity.state.z - start.z)).toBeGreaterThan(5);
});

test('RENDER-005.b: a block changed through the core is rebuilt by the next frame', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async (air) => {
    const h = (globalThis as unknown as HookGlobal).__yw3d;
    // Remove the surface block at the center of the world.
    const x = 256;
    const z = 256;
    let y = 95;
    while (y > 0 && h.getBlock(x, y, z) === air) y--;
    await h.nextFrame();
    const before = h.stats().rebuiltChunks;
    const changed = h.setBlock(x, y, z, air);
    await h.nextFrame();
    return { changed, before, after: h.stats().rebuiltChunks, block: h.getBlock(x, y, z) };
  }, AIR);
  expect(result.changed).toBe(true);
  expect(result.block).toBe(AIR);
  expect(result.after).toBeGreaterThan(result.before);
});

test('screenshots from fixed viewpoints for visual review (plan P12)', async ({ page }) => {
  mkdirSync('e2e/screenshots', { recursive: true });
  await open(page);
  const views = [
    { name: 'overview', pose: [256, 110, 540, 0, -0.35] },
    { name: 'village', pose: [160, 62, 118, 0, -0.32] },
    { name: 'woods', pose: [430, 64, 150, -0.23, -0.18] },
    { name: 'pond', pose: [116, 52, 364, 0.64, -0.38] },
    { name: 'edge', pose: [-28, 30, 180, -Math.PI * 0.62, -0.05] },
  ] as const;
  for (const { name, pose } of views) {
    await page.evaluate(async (p) => {
      const h = (globalThis as unknown as HookGlobal).__yw3d;
      h.setView(p[0], p[1], p[2], p[3], p[4]);
      await h.nextFrame();
      await h.nextFrame();
    }, pose);
    await page.screenshot({ path: `e2e/screenshots/${name}.png` });
  }
});

test('screenshots of the player in first and third person (plan P12)', async ({ page }) => {
  mkdirSync('e2e/screenshots', { recursive: true });
  await open(page);
  const settle = () =>
    page.evaluate(async () => {
      const h = (globalThis as unknown as HookGlobal).__yw3d;
      for (let i = 0; i < 30; i++) await h.nextFrame();
    });
  await settle();
  await page.screenshot({ path: 'e2e/screenshots/player-first.png' });
  await page.keyboard.press('KeyV');
  await settle();
  await page.screenshot({ path: 'e2e/screenshots/player-third.png' });
});

type Clock = { clock(): number | null; skyColor(): string | null };
const clockHook = <K extends keyof Clock>(page: Page, key: K) =>
  page.evaluate((k) => (globalThis as unknown as { __yw3d: Clock }).__yw3d[k](), key) as Promise<
    ReturnType<Clock[K]>
  >;

test('TIME-001.c, TIME-002.a, RENDER-004.a: without the host the hour runs in the page; /time moves it and the sky follows', async ({
  page,
}) => {
  await open(page, '?world=test-dialogue');
  // The file sets no time: the world starts at 08:00, and 60 real minutes make a day.
  const first = (await clockHook(page, 'clock'))!;
  expect(first).toBeGreaterThanOrEqual(480);
  expect(first).toBeLessThan(485);
  await page.waitForTimeout(3000);
  const later = (await clockHook(page, 'clock'))!;
  expect(later - first).toBeGreaterThan(0.8);
  expect(later - first).toBeLessThan(3);
  const noon = await clockHook(page, 'skyColor');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/time 23:00');
  await page.keyboard.press('Enter');
  await expect.poll(() => clockHook(page, 'clock')).toBeGreaterThanOrEqual(23 * 60);
  await expect.poll(() => clockHook(page, 'skyColor')).not.toBe(noon);
  const night = (await clockHook(page, 'skyColor'))!;
  // Dark blue at night.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(night.slice(i, i + 2), 16));
  expect(Math.max(r!, g!, b!)).toBeLessThan(90);
  expect(b).toBeGreaterThan(r!);
  await expect(page.locator('#debug-overlay')).toContainText(/time\s+23:0\d · night/);
});
