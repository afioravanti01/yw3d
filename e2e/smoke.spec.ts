import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { AIR } from '../src/core/blocks/builtin';
import { generateTerrain } from '../src/core/gen/terrain';

/** The subset of the app test hook (src/app/testHook.ts) used here. */
interface Hook {
  ready: boolean;
  seed: number;
  warning: string | null;
  worldHash(): number;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  stats(): { meshedChunks: number; triangles: number; rebuiltChunks: number };
  nextFrame(): Promise<void>;
  setView(x: number, y: number, z: number, yaw: number, pitch: number): void;
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

test('APP-001.a: the seed comes from the URL, with 1 as the default', async ({ page }) => {
  await open(page, '?seed=42');
  expect(await page.evaluate(() => (globalThis as unknown as HookGlobal).__yw3d.seed)).toBe(42);
  await open(page);
  expect(await page.evaluate(() => (globalThis as unknown as HookGlobal).__yw3d.seed)).toBe(1);
});

test('APP-001.b: an invalid seed shows a visible notice and uses the default', async ({ page }) => {
  await open(page, '?seed=abc');
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#notice')).toContainText('abc');
  expect(await page.evaluate(() => (globalThis as unknown as HookGlobal).__yw3d.seed)).toBe(1);
});

test('WORLD-005.d: the browser world has the same hash as the Node world', async ({ page }) => {
  for (const seed of [1, 7]) {
    await open(page, `?seed=${seed}`);
    const browserHash = await page.evaluate(() =>
      (globalThis as unknown as HookGlobal).__yw3d.worldHash(),
    );
    expect(browserHash).toBe(generateTerrain(seed).hash());
  }
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
