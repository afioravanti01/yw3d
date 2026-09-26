import * as THREE from 'three';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { generateTerrain } from '../core/gen/terrain';
import { ChunkRenderer } from '../render/chunkRenderer';
import { FlyCamera, initialCameraPose } from '../render/flyCamera';
import { createPalette } from '../render/meshing/palette';
import { configureRenderer, createWorldScene } from '../render/scene';
import { DebugOverlay, FpsMeter } from './debugOverlay';
import { parseStartParams } from './params';
import { installTestHook, type TestHook } from './testHook';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

/** Waits until the browser has painted, so that the loading message is visible. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

async function main(): Promise<void> {
  const canvas = required<HTMLCanvasElement>('#world');
  const loading = required<HTMLElement>('#loading');
  const params = parseStartParams(location.search);
  if (params.warning) {
    const notice = required<HTMLElement>('#notice');
    notice.textContent = params.warning;
    notice.hidden = false;
  }
  await nextPaint();

  const registry = createDefaultRegistry();
  const generationStart = performance.now();
  const world = generateTerrain(params.seed);
  const generationMs = performance.now() - generationStart;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  configureRenderer(renderer);
  const { scene, update: updateScene } = createWorldScene(world.size);

  const chunks = new ChunkRenderer(
    world,
    createPalette(registry),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    // Water (RENDER-007): see-through near the shore, drawn after the opaque terrain.
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  const meshingStart = performance.now();
  chunks.buildAll();
  const meshingMs = performance.now() - meshingStart;
  scene.add(chunks.group);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
  const controls = new FlyCamera(camera, canvas, world.size);
  controls.setPose(initialCameraPose(world));

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const overlay = new DebugOverlay();
  const fpsMeter = new FpsMeter();
  let frameWaiters: (() => void)[] = [];

  const hook: TestHook = {
    ready: false,
    seed: params.seed,
    warning: params.warning ?? null,
    loadTimeMs: 0,
    frames: 0,
    worldHash: () => world.hash(),
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
    stats: () => ({
      meshedChunks: chunks.stats.meshedChunks,
      triangles: chunks.stats.triangles,
      rebuiltChunks: chunks.stats.rebuiltChunks,
    }),
    nextFrame: () => new Promise((resolve) => frameWaiters.push(resolve)),
    setView: (x, y, z, yaw, pitch) => controls.setPose({ position: { x, y, z }, yaw, pitch }),
  };
  installTestHook(hook);

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    // Clamp long frames (tab switches) so the camera does not jump.
    controls.update(Math.min(timer.getDelta(), 0.1));
    if (chunks.update() > 0) {
      renderer.shadowMap.needsUpdate = true;
    }
    updateScene(camera);
    renderer.render(scene, camera);

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
    overlay.update(now, () => ({
      fps,
      camera: camera.position,
      speedMps: controls.speed,
      seed: params.seed,
      meshedChunks: chunks.stats.meshedChunks,
      totalChunks: chunks.stats.totalChunks,
      triangles: chunks.stats.triangles,
      loadTimeMs: hook.loadTimeMs,
      generationMs,
      meshingMs,
      lastChunkRebuildMs: chunks.stats.lastChunkRebuildMs,
    }));
  });
}

void main();
