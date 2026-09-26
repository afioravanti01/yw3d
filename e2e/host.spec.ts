import { expect, test, type Page } from '@playwright/test';
import WebSocket from 'ws';
import type { CharacterSnapshot, HostMessage, PlayerSnapshot } from '../src/protocol/messages';

const HOST_PORT = 5199;

/** The subset of the app test hook used here. */
interface Hook {
  ready: boolean;
  status: string;
  world: string;
  seed: number;
  structureCounts: Record<string, number>;
  connection: { role: 'driver' | 'spectator' } | null;
  worldHash(): number;
  player(): { x: number; y: number; z: number } | null;
  characters(): { id: string; x: number; y: number; z: number }[];
}
type HookGlobal = { __yw3d: Hook };

async function open(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`);
  await page.waitForFunction(
    () => (globalThis as unknown as Partial<HookGlobal>).__yw3d?.ready === true,
    undefined,
    { timeout: 60_000 },
  );
}

const hook = <K extends keyof Hook>(page: Page, key: K) =>
  page.evaluate((k) => {
    const value = (globalThis as unknown as HookGlobal).__yw3d[k];
    return typeof value === 'function' ? (value as () => unknown)() : value;
  }, key) as Promise<Hook[K] extends () => infer R ? R : Hook[K]>;

/**
 * What the host itself says: connects to its WebSocket as an extra (spectator) view, reads
 * the greeting and the next state, and leaves.
 */
async function askHost(): Promise<{
  hash: number;
  player: PlayerSnapshot;
  characters: CharacterSnapshot[];
  views: number;
}> {
  const socket = new WebSocket(`ws://localhost:${HOST_PORT}/host`);
  const messages: HostMessage[] = [];
  await new Promise<void>((resolve, reject) => {
    socket.on('message', (data) => {
      messages.push(JSON.parse(String(data)) as HostMessage);
      if (messages.some((m) => m.type === 'hello') && messages.some((m) => m.type === 'state')) {
        resolve();
      }
    });
    socket.on('error', reject);
  });
  socket.close();
  const hello = messages.find((m) => m.type === 'hello');
  const state = [...messages].reverse().find((m) => m.type === 'state');
  if (hello?.type !== 'hello' || state?.type !== 'state')
    throw new Error('no answer from the host');
  return {
    hash: hello.world!.hash,
    player: state.player,
    characters: [...state.characters],
    views: state.views,
  };
}

test('HOST-002.a, STRUCT-008.c: the view composes the same world as the host, author structures included', async ({
  page,
}) => {
  await open(page);
  expect(await hook(page, 'status')).toBe('ready');
  expect((await hook(page, 'structureCounts'))['tower']).toBe(1);
  expect(await hook(page, 'worldHash')).toBe((await askHost()).hash);
});

test('HOST-002.b: the player moves in the host; the view shows the position of the host', async ({
  page,
}) => {
  await open(page);
  expect(await hook(page, 'connection')).toEqual({ role: 'driver' });
  const before = (await askHost()).player;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  const host = (await askHost()).player;
  expect(Math.hypot(host.x - before.x, host.z - before.z)).toBeGreaterThan(3);
  const shown = (await hook(page, 'player'))!;
  expect(shown.x).toBeCloseTo(host.x, 1);
  expect(shown.z).toBeCloseTo(host.z, 1);
});

test('HOST-002.c: closing and reopening the browser finds the player where it was', async ({
  browser,
}) => {
  const first = await browser.newPage();
  await open(first);
  await first.keyboard.down('KeyD');
  await first.waitForTimeout(600);
  await first.keyboard.up('KeyD');
  await first.waitForTimeout(600);
  const left = (await hook(first, 'player'))!;
  await first.close();
  const again = await browser.newPage();
  await open(again);
  await again.waitForTimeout(300);
  const found = (await hook(again, 'player'))!;
  expect(found.x).toBeCloseTo(left.x, 1);
  expect(found.z).toBeCloseTo(left.z, 1);
  await again.close();
});

test('HOST-002.d: several views see the same world; one drives, the others watch', async ({
  browser,
}) => {
  const driver = await browser.newPage();
  await open(driver);
  const spectator = await browser.newPage();
  await open(spectator);
  expect(await hook(driver, 'connection')).toEqual({ role: 'driver' });
  expect(await hook(spectator, 'connection')).toEqual({ role: 'spectator' });
  expect(await hook(spectator, 'worldHash')).toBe(await hook(driver, 'worldHash'));
  // Keys pressed in the spectator do not move the player.
  const before = (await askHost()).player;
  await spectator.keyboard.down('KeyW');
  await spectator.waitForTimeout(600);
  await spectator.keyboard.up('KeyW');
  const after = (await askHost()).player;
  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.z).toBeCloseTo(before.z, 3);
  // When the driver leaves, the spectator drives.
  await driver.close();
  await expect.poll(() => hook(spectator, 'connection')).toEqual({ role: 'driver' });
  await spectator.close();
});

test('APP-003.b: from the host the app ignores ?world= and ?seed=', async ({ page }) => {
  await open(page, '?world=default&seed=42');
  expect(await hook(page, 'world')).toBe('host/world.yaml');
  expect(await hook(page, 'seed')).toBe(7);
});

test('CHAR-001.d: the view shows the characters where the host simulates them', async ({
  page,
}) => {
  await open(page);
  // Pino walks, driven by its controller: compare the view with the host at the same moment.
  await expect
    .poll(async () => (await askHost()).characters.find((c) => c.id === 'pino')?.speed ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  const host = (await askHost()).characters.find((c) => c.id === 'pino')!;
  const shown = (await hook(page, 'characters')).find((c) => c.id === 'pino')!;
  expect(Math.hypot(shown.x - host.x, shown.z - host.z)).toBeLessThan(1);
});
