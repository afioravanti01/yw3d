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
  await expect(notice).toContainText('e2e/worlds/test-invalid.yaml:8  error  structures[0].type');
  await expect(notice).toContainText('e2e/worlds/test-invalid.yaml:9  error  structures[1].at');
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
