import * as THREE from 'three';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { composeWorld, type ComposeResult } from '../core/compose/composeWorld';
import { createDefaultStructures } from '../core/structures/builtin';
import { formatDiagnostic } from '../core/yaml/report';
import type { World } from '../core/world/world';
import { ChunkRenderer } from '../render/chunkRenderer';
import { PhysicsWorld } from '../core/physics/physicsWorld';
import { PLAYER_SIZE } from '../core/player/player';
import { FlyCamera } from '../render/flyCamera';
import { createPalette } from '../render/meshing/palette';
import { configureRenderer, createWorldScene, type WorldScene } from '../render/scene';
import { DebugOverlay, FpsMeter } from './debugOverlay';
import { DiagnosticsPanel, type PanelMessage } from './diagnosticsPanel';
import { PlayerControls } from './input';
import { PlayerView } from './playerView';
import { parseStartParams } from './params';
import { installTestHook, type TestHook } from './testHook';
import * as bundledWorlds from './worlds';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

/** Waits until the browser has painted, so that the loading message is visible. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** What is currently shown: the world and everything built from it. */
interface Loaded {
  readonly world: World;
  readonly scene: WorldScene;
  readonly chunks: ChunkRenderer;
  readonly result: ComposeResult;
  readonly composeMs: number;
  readonly meshingMs: number;
}

async function main(): Promise<void> {
  const canvas = required<HTMLCanvasElement>('#world');
  const loading = required<HTMLElement>('#loading');
  const panel = new DiagnosticsPanel(required<HTMLElement>('#notice'));
  const params = parseStartParams(location.search);
  await nextPaint();

  const registry = createDefaultRegistry();
  const structures = createDefaultStructures();
  const palette = createPalette(registry);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Water (RENDER-007): see-through near the shore, drawn after the opaque terrain.
  const waterMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  configureRenderer(renderer);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
  let controls: FlyCamera | undefined;
  let playerView: PlayerView | undefined;
  let current: Loaded | undefined;
  const playerControls = new PlayerControls(canvas, (code) => {
    if (code === 'KeyV') playerView?.toggleThirdPerson();
    if (code === 'F4') playerView?.toggleFree(camera);
  });
  let reloadMs = 0;
  // Replaced by the hot update of the world files (YAML-007).
  let worlds: typeof bundledWorlds = bundledWorlds;

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const hook: TestHook = {
    ready: false,
    status: 'loading',
    world: params.world,
    seed: 0,
    warning: params.warning ?? null,
    messages: [],
    structureCounts: {},
    loadTimeMs: 0,
    frames: 0,
    worldHash: () => current?.world.hash() ?? 0,
    getBlock: (x, y, z) => current?.world.getBlock(x, y, z) ?? 0,
    setBlock: (x, y, z, id) => current?.world.setBlock(x, y, z, id) ?? false,
    stats: () => ({
      meshedChunks: current?.chunks.stats.meshedChunks ?? 0,
      triangles: current?.chunks.stats.triangles ?? 0,
      rebuiltChunks: current?.chunks.stats.rebuiltChunks ?? 0,
    }),
    nextFrame: () => new Promise((resolve) => frameWaiters.push(resolve)),
    setView: (x, y, z, yaw, pitch) => {
      if (playerView && playerView.mode !== 'free') playerView.toggleFree(camera);
      controls?.setPose({ position: { x, y, z }, yaw, pitch });
    },
    simulate: (start, intents) => {
      // A test entity in the loaded world, stepped with the given intents (plan F03 P9).
      const physics = new PhysicsWorld(current!.world, registry);
      const entity = physics.spawn(PLAYER_SIZE, start.x, start.y, start.z);
      for (const intent of intents) {
        entity.intent = intent;
        physics.step();
      }
      return entity.state;
    },
  };
  let frameWaiters: (() => void)[] = [];
  installTestHook(hook);

  /**
   * Composes the world of the file and shows it. With errors, keeps what is shown (nothing on
   * the first load) and lists the errors (YAML-002.d, YAML-007.b).
   */
  const load = (reload: boolean): void => {
    const start = performance.now();
    const messages: PanelMessage[] = params.warning
      ? [{ severity: 'warning', text: params.warning }]
      : [];
    const file = worlds.worldFile(params.world);
    if (!file) {
      messages.push({
        severity: 'error',
        text: `Unknown world "${params.world}". Available worlds: ${worlds.worldNames().join(', ')}.`,
      });
      showMessages(messages, 'error');
      return;
    }
    const result = composeWorld(file.text, file.path, {
      registry: structures,
      seedOverride: params.seedOverride,
      now: () => performance.now(),
    });
    const composeMs = performance.now() - start;
    if (params.seedOverride !== undefined && result.world) {
      messages.push({
        severity: 'warning',
        text: `The seed ${params.seedOverride} from the URL replaces the seed of ${file.path}.`,
      });
    }
    for (const d of result.diagnostics) {
      messages.push({ severity: d.severity, text: formatDiagnostic(d) });
    }
    if (!result.world) {
      showMessages(messages, 'error');
      return;
    }

    const meshingStart = performance.now();
    const chunks = new ChunkRenderer(result.world, palette, material, waterMaterial);
    chunks.buildAll();
    const meshingMs = performance.now() - meshingStart;
    const scene = createWorldScene(result.world.size);
    scene.scene.add(chunks.group);

    current?.chunks.dispose();
    current = { world: result.world, scene, chunks, result, composeMs, meshingMs };
    if (!controls || !playerView) {
      controls = new FlyCamera(camera, canvas, result.world.size);
      playerView = new PlayerView(
        result.world,
        registry,
        result.player,
        playerControls,
        controls,
        () => performance.now(),
      );
    } else {
      // Keep the player and the view across reloads (YAML-007.a).
      playerView.replaceWorld(result.world);
    }
    scene.scene.add(playerView.figure);
    renderer.shadowMap.needsUpdate = true;
    hook.seed = result.seed ?? 0;
    hook.structureCounts = result.structureCounts;
    if (reload) reloadMs = performance.now() - start;
    showMessages(messages, 'ready');
  };

  const showMessages = (messages: PanelMessage[], status: 'ready' | 'error') => {
    panel.show(messages);
    hook.messages = messages.map((m) => m.text);
    hook.status = status;
    if (status === 'error' && !current) {
      loading.hidden = true;
      hook.ready = true;
    }
  };

  load(false);

  if (import.meta.hot) {
    import.meta.hot.accept('./worlds', (updated) => {
      if (!updated) return;
      worlds = updated as unknown as typeof bundledWorlds;
      load(true);
    });
  }

  const overlay = new DebugOverlay();
  const fpsMeter = new FpsMeter();
  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    if (!current || !playerView) return;
    playerView.update(timer.getDelta(), camera);
    if (current.chunks.update() > 0) {
      renderer.shadowMap.needsUpdate = true;
    }
    current.scene.update(camera);
    renderer.render(current.scene.scene, camera);

    hook.frames++;
    if (!hook.ready) {
      // PERF-001.a: from navigation start to the first complete frame.
      hook.loadTimeMs = performance.now();
      hook.ready = true;
      loading.hidden = true;
    }
    const waiters = frameWaiters;
    frameWaiters = [];
    for (const resolve of waiters) resolve();

    const now = performance.now();
    const fps = fpsMeter.tick(now);
    const shown = current;
    overlay.update(now, () => ({
      fps,
      camera: camera.position,
      speedMps: controls!.speed,
      mode: playerView!.mode,
      player: playerView!.player.state,
      stepMs: playerView!.lastStepMs,
      seed: hook.seed,
      world: params.world,
      structureCounts: shown.result.structureCounts,
      warnings: shown.result.diagnostics.filter((d) => d.severity === 'warning').length,
      meshedChunks: shown.chunks.stats.meshedChunks,
      totalChunks: shown.chunks.stats.totalChunks,
      triangles: shown.chunks.stats.triangles,
      loadTimeMs: hook.loadTimeMs,
      generationMs: shown.composeMs,
      meshingMs: shown.meshingMs,
      reloadMs,
      lastChunkRebuildMs: shown.chunks.stats.lastChunkRebuildMs,
    }));
  });
}

void main();
