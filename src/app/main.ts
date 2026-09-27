import * as THREE from 'three';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { composeWorld, type ComposeResult } from '../core/compose/composeWorld';
import { PhysicsWorld } from '../core/physics/physicsWorld';
import { PLAYER_SIZE } from '../core/player/player';
import { createDefaultStructures } from '../core/structures/builtin';
import type { StructureType } from '../core/structures/registry';
import type { World } from '../core/world/world';
import { formatDiagnostic, type Diagnostic } from '../core/yaml/report';
import type { CharacterSnapshot, WorldMessage } from '../protocol/messages';
import { CharacterViews } from './characterViews';
import { SpeechBubbles, type Labelled } from './speechBubbles';
import { blocksToMeters } from '../core/world/units';
import { ChunkRenderer } from '../render/chunkRenderer';
import { FlyCamera } from '../render/flyCamera';
import { createPalette } from '../render/meshing/palette';
import { configureRenderer, createWorldScene, type WorldScene } from '../render/scene';
import { DebugOverlay, FpsMeter } from './debugOverlay';
import { DiagnosticsPanel, type PanelMessage } from './diagnosticsPanel';
import { HostConnection, hostConfig } from './hostConnection';
import { PlayerControls } from './input';
import { parseStartParams } from './params';
import { describeLine } from '../core/dialogue/lines';
import { Chat } from './chat';
import { LocalSimulation } from './localSimulation';
import { PlayerView, RemotePlayer, type PlayerSource } from './playerView';
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

const toMessages = (diagnostics: readonly Diagnostic[]): PanelMessage[] =>
  diagnostics.map((d) => ({ severity: d.severity, text: formatDiagnostic(d) }));

/**
 * Structures of the author, loaded from the URLs sent by the host (STRUCT-008.c), in the same
 * order as the host registers them. The timestamp makes a reload read the new code.
 */
async function authorStructures(urls: readonly string[]): Promise<StructureType[]> {
  const stamp = Date.now();
  const types: StructureType[] = [];
  for (const url of urls) {
    const module = (await import(/* @vite-ignore */ `${url}?t=${stamp}`)) as { default: unknown };
    const exported = module.default;
    types.push(...((Array.isArray(exported) ? exported : [exported]) as StructureType[]));
  }
  return types;
}

async function main(): Promise<void> {
  const canvas = required<HTMLCanvasElement>('#world');
  const loading = required<HTMLElement>('#loading');
  const panel = new DiagnosticsPanel(required<HTMLElement>('#notice'));
  const params = parseStartParams(location.search);
  const host = hostConfig();
  await nextPaint();

  const registry = createDefaultRegistry();
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
  let connection: HostConnection | undefined;
  const playerControls = new PlayerControls(canvas, (code) => {
    // Enter opens the box to speak (DIALOG-001.a); while it is open, keys are for the text.
    if (chat.isOpen) return;
    if (code === 'Enter' || code === 'NumpadEnter') chat.open();
    if (code === 'KeyV') playerView?.toggleThirdPerson();
    if (code === 'KeyC') playerView?.toggleFree(camera);
    // E: the nearest character within 3 m reacts through its controller (PROTO-002.c).
    if (code === 'KeyE' && playerView?.mode !== 'free') {
      if (connection) connection.interact();
      else local?.interact();
    }
  });
  /** Says a sentence of the player, from this page or through the host (DIALOG-001.b). */
  const speak = (text: string) => {
    if (connection) return connection.say(text);
    const said = local?.say(text);
    if (said && !said.ok) chat.add(said.error, 'error');
  };
  const chat = new Chat(required<HTMLElement>('#chat'), {
    send: speak,
    toggled: (open) => {
      playerControls.enabled = !open;
      playerControls.keys.clear();
    },
  });
  const characterViews = new CharacterViews();
  const bubbles = new SpeechBubbles(required<HTMLElement>('#bubbles'));
  /** The simulation of the browser-only mode (APP-003.a, BEHAV-001.f). */
  let local: LocalSimulation | undefined;
  let reloadMs = 0;
  let worldName = params.world;

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
    connection: null,
    worldHash: () => current?.world.hash() ?? 0,
    getBlock: (x, y, z) => current?.world.getBlock(x, y, z) ?? 0,
    setBlock: (x, y, z, id) => current?.world.setBlock(x, y, z, id) ?? false,
    stats: () => ({
      meshedChunks: current?.chunks.stats.meshedChunks ?? 0,
      triangles: current?.chunks.stats.triangles ?? 0,
      rebuiltChunks: current?.chunks.stats.rebuiltChunks ?? 0,
    }),
    player: () => playerView?.source.state() ?? null,
    characters: () => shownCharacters(),
    chatLines: () => chat.lines(),
    chatOpen: () => chat.isOpen,
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

  const showMessages = (messages: PanelMessage[], status: 'ready' | 'error') => {
    panel.show(messages);
    hook.messages = messages.map((m) => m.text);
    hook.status = status;
    if (status === 'error' && !current) {
      loading.hidden = true;
      hook.ready = true;
    }
  };

  /**
   * Shows a composed world: regions, scene, player. The player keeps its place across reloads
   * (YAML-007.a, HOST-003.a); `source` builds the player the first time.
   */
  const show = (
    result: ComposeResult & { world: World },
    composeMs: number,
    source: () => PlayerSource,
  ): void => {
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
        source(),
        playerControls,
        controls,
        result.playerAppearance!,
      );
    } else {
      playerView.replaceWorld(result.world);
    }
    scene.scene.add(playerView.animated.group);
    characterViews.reset(result.characters, scene.scene);
    renderer.shadowMap.needsUpdate = true;
    // The title of the page is the name of the world (YAML-009.c).
    document.title = result.name ?? 'yw3d';
    hook.seed = result.seed ?? 0;
    hook.structureCounts = result.structureCounts;
  };

  // Replaced by the hot update of the world files in browser-only mode (YAML-007).
  let worlds: typeof bundledWorlds = bundledWorlds;
  if (host) {
    connectToHost();
  } else {
    loadBundled(false);
    if (import.meta.hot) {
      import.meta.hot.accept('./worlds', (updated) => {
        if (updated) {
          worlds = updated as unknown as typeof bundledWorlds;
          loadBundled(true);
        }
      });
    }
  }

  /** Browser-only mode (APP-003.a): a world of the project, chosen with `?world=`. */
  function loadBundled(reload: boolean): void {
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
      registry: createDefaultStructures(),
      seedOverride: params.seedOverride,
      now: () => performance.now(),
      readFile: (relative) => worlds.readWorldFile(file.path, relative),
    });
    if (params.seedOverride !== undefined && result.world) {
      messages.push({
        severity: 'warning',
        text: `The seed ${params.seedOverride} from the URL replaces the seed of ${file.path}.`,
      });
    }
    messages.push(...toMessages(result.diagnostics));
    if (!result.world) {
      showMessages(messages, 'error');
      return;
    }
    const composed = result as ComposeResult & { world: World };
    // A reload keeps the player where it is; characters and behaviors start over (BEHAV-001.g).
    local?.recompose(composed);
    show(composed, performance.now() - start, () => {
      local = new LocalSimulation(
        composed,
        () => performance.now(),
        // In this page the reader is always the player (A6.2).
        (line) => chat.add(describeLine(line, true)),
      );
      playerControls.yaw = local.startYaw;
      return local;
    });
    if (reload) reloadMs = performance.now() - start;
    showMessages(messages, 'ready');
  }

  /**
   * Host mode (HOST-002): the world comes from the host, composed here from the same YAML and
   * structures and checked by hash; the player is simulated by the host.
   */
  function connectToHost(): void {
    const receiveWorld = async (world: WorldMessage, diagnostics: readonly Diagnostic[]) => {
      const start = performance.now();
      worldName = world.file;
      hook.world = world.file;
      const messages = toMessages(diagnostics);
      let structures;
      try {
        structures = createDefaultStructures();
        for (const type of await authorStructures(world.structures)) structures.register(type);
      } catch (error) {
        messages.push({
          severity: 'error',
          text: `Cannot load the structures of the author: ${(error as Error).message}`,
        });
        showMessages(messages, 'error');
        return;
      }
      const result = composeWorld(world.text, world.file, {
        registry: structures,
        seedOverride: world.seedOverride,
        now: () => performance.now(),
        // The files the world names, as the host read them: the same world (plan F06 P14).
        readFile: (relative) => world.files[relative],
      });
      if (!result.world || result.world.hash() !== world.hash) {
        messages.push({
          severity: 'error',
          text: result.world
            ? `This view composed a different world from the host (hash ${result.world.hash()} instead of ${world.hash}).`
            : 'This view could not compose the world of the host.',
        });
        showMessages(messages, 'error');
        return;
      }
      const reload = current !== undefined;
      show(result as ComposeResult & { world: World }, performance.now() - start, () => {
        return new RemotePlayer(connection!, () => performance.now());
      });
      playerView!.setSpectator(connection!.role === 'spectator', camera);
      if (reload) reloadMs = performance.now() - start;
      showMessages(messages, 'ready');
    };

    connection = new HostConnection(
      host!,
      {
        hello: (message) => {
          hook.connection = { role: message.role };
          chat.canWrite = message.role === 'driver';
          if (message.player) playerControls.yaw = message.player.yaw;
          if (message.world) void receiveWorld(message.world, message.diagnostics);
          else showMessages(toMessages(message.diagnostics), 'error');
        },
        world: (world, diagnostics) => void receiveWorld(world, diagnostics),
        diagnostics: (diagnostics) =>
          showMessages(toMessages(diagnostics), current ? 'ready' : 'error'),
        line: (line) => chat.add(describeLine(line, connection!.role === 'driver')),
        sayError: (error) => chat.add(error, 'error'),
        role: (role) => {
          hook.connection = { role };
          chat.canWrite = role === 'driver';
          if (role !== 'driver') chat.close();
          playerView?.setSpectator(role === 'spectator', camera);
        },
        closed: () =>
          showMessages(
            [
              {
                severity: 'error',
                text: 'Connection to the yw3d host lost. Restart yw3d and reload the page.',
              },
            ],
            'error',
          ),
      },
      () => performance.now(),
    );
  }

  /** Characters as shown now: from the host, or from the simulation of this page. */
  const shownCharacters = (): CharacterSnapshot[] =>
    connection ? connection.interpolatedCharacters(performance.now()) : (local?.characters() ?? []);

  const overlay = new DebugOverlay();
  const fpsMeter = new FpsMeter();
  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    if (!current || !playerView) return;
    const dt = timer.getDelta();
    playerView.update(dt, camera);
    const characters = shownCharacters();
    characterViews.update(characters, dt);
    if (current.chunks.update() > 0) {
      renderer.shadowMap.needsUpdate = true;
    }
    current.scene.update(camera);
    renderer.render(current.scene.scene, camera);
    // Names over the figures (A6.4); the player's name and bubble where its figure shows:
    // third person, free camera, spectators.
    const names = new Map(current.result.characters.map((c) => [c.id, c.name]));
    const labelled: Labelled[] = characters.map((c) => ({ ...c, name: names.get(c.id) ?? c.id }));
    if (playerView.mode !== 'first') {
      const speech = connection
        ? (connection.latest()?.speech ?? null)
        : (local?.playerSpeech ?? null);
      const name = current.result.playerName ?? 'viandante';
      labelled.push({ id: 'player', name, ...playerView.source.render(), speech });
    }
    bubbles.update(labelled, camera);

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
    const view = playerView;
    overlay.update(now, () => ({
      fps,
      camera: camera.position,
      speedMps: controls!.speed,
      mode: view.mode,
      player: view.source.state(),
      stepMs: view.source.lastStepMs,
      connection: connection
        ? {
            address: connection.address,
            views: connection.views,
            role: connection.role,
            rttMs: connection.rttMs,
          }
        : null,
      characters: describeNearest(characters, view.source.state(), shown.result),
      seed: hook.seed,
      world: worldName,
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

/** The overlay line about the characters (DEBUG-001.a): how many, and the nearest one. */
function describeNearest(
  characters: readonly CharacterSnapshot[],
  player: { x: number; y: number; z: number },
  result: ComposeResult,
): { count: number; nearest: string | null } {
  let nearest: CharacterSnapshot | undefined;
  let best = Infinity;
  for (const c of characters) {
    const d = Math.hypot(c.x - player.x, c.y - player.y, c.z - player.z);
    if (d < best) {
      best = d;
      nearest = c;
    }
  }
  if (!nearest) return { count: 0, nearest: null };
  const start = result.characters.find((c) => c.id === nearest!.id);
  const command = start?.command;
  const driver = nearest.controlled
    ? `controller active${command ? ` (${command})` : ' (WebSocket)'}`
    : nearest.activity
      ? `behavior ${nearest.activity}`
      : command
        ? `controller not running (${command})`
        : 'no controller';
  return {
    count: characters.length,
    nearest: `${start?.name ?? nearest.id} (${nearest.id}) · ${blocksToMeters(best).toFixed(1)} m · ${driver} · ${nearest.action ?? 'no action'}`,
  };
}

void main();
