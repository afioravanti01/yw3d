import * as THREE from 'three';
import type { BlockRegistry } from '../core/blocks/registry';
import type { EntityState } from '../core/physics/entity';
import { FixedStepper } from '../core/physics/fixedStep';
import { PhysicsWorld, type EntityHandle } from '../core/physics/physicsWorld';
import { EYE_HEIGHT, PLAYER_SIZE, spawnAtStart, thirdPersonCamera } from '../core/player/player';
import type { World } from '../core/world/world';
import type { FlyCamera } from '../render/flyCamera';
import { createPlayerFigure } from '../render/playerFigure';
import type { PlayerControls } from './input';

/** View modes (PLAYER-003.a, CAM-001.f). */
export type ViewMode = 'first' | 'third' | 'free';

/** How fast the eyes catch up after climbing a step, per second (PHYS-005.c). */
const EYE_SMOOTHING = 14;

/**
 * The player in the app: fixed-step simulation, interpolation between steps, first- and
 * third-person views and the switch to the free camera.
 */
export class PlayerView {
  mode: ViewMode = 'first';
  physics: PhysicsWorld;
  player: EntityHandle;
  /** Duration of the last simulation step, in ms (PERF-003.a). */
  lastStepMs = 0;
  readonly figure = createPlayerFigure();

  private readonly stepper = new FixedStepper();
  private previous: EntityState;
  private eyeY: number;

  constructor(
    world: World,
    private readonly registry: BlockRegistry,
    start: { readonly x: number; readonly z: number; readonly yaw: number } | undefined,
    private readonly controls: PlayerControls,
    private readonly freeCamera: FlyCamera,
    private readonly now: () => number,
  ) {
    this.physics = new PhysicsWorld(world, registry);
    const spawned = spawnAtStart(this.physics, start);
    this.player = spawned.player;
    controls.yaw = spawned.yaw;
    this.previous = this.player.state;
    this.eyeY = this.player.state.y + EYE_HEIGHT;
    this.setMode('first');
  }

  /** A new world after a hot reload: the player keeps its place (YAML-007.a). */
  replaceWorld(world: World): void {
    const { x, y, z } = this.player.state;
    this.physics = new PhysicsWorld(world, this.registry);
    this.player = this.physics.spawn(PLAYER_SIZE, x, y, z);
    this.previous = this.player.state;
  }

  toggleThirdPerson(): void {
    if (this.mode !== 'free') this.setMode(this.mode === 'first' ? 'third' : 'first');
  }

  /** C: free camera from the current view, and back to the player (CAM-001.e–f). */
  toggleFree(camera: THREE.PerspectiveCamera): void {
    if (this.mode === 'free') {
      this.setMode(this.lastPlayerMode);
      return;
    }
    this.lastPlayerMode = this.mode;
    this.freeCamera.setPose({
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      yaw: this.controls.yaw,
      pitch: this.controls.pitch,
    });
    this.setMode('free');
  }

  /** Advances the simulation by a frame and places the camera and the figure. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.mode !== 'free') this.controls.turn(dt);
    const steps = this.stepper.advance(dt);
    for (let i = 0; i < steps; i++) {
      this.previous = this.player.state;
      this.player.intent = this.controls.intent();
      const start = this.now();
      this.physics.step();
      this.lastStepMs = this.now() - start;
    }
    if (this.mode === 'free') {
      this.freeCamera.update(dt);
      this.placeFigure(this.player.state);
      return;
    }

    // Interpolate between the last two steps (plan F03 P6).
    const alpha = this.stepper.alpha;
    const current = this.player.state;
    const x = this.previous.x + (current.x - this.previous.x) * alpha;
    const y = this.previous.y + (current.y - this.previous.y) * alpha;
    const z = this.previous.z + (current.z - this.previous.z) * alpha;
    // The eyes rise smoothly on steps and follow at once when going down.
    const targetEye = y + EYE_HEIGHT;
    this.eyeY =
      targetEye < this.eyeY || targetEye - this.eyeY > 3
        ? targetEye
        : this.eyeY + (targetEye - this.eyeY) * (1 - Math.exp(-EYE_SMOOTHING * dt));

    const { yaw, pitch } = this.controls;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (this.mode === 'first') {
      camera.position.set(x, this.eyeY, z);
    } else {
      const eye: [number, number, number] = [x, this.eyeY, z];
      const [cx, cy, cz] = thirdPersonCamera(eye, yaw, pitch, this.blocksView);
      camera.position.set(cx, cy, cz);
    }
    this.placeFigure({ ...current, x, y, z });
  }

  private lastPlayerMode: 'first' | 'third' = 'first';

  /** Solid or opaque blocks stop the third-person camera (leaves too). */
  private readonly blocksView = (x: number, y: number, z: number) =>
    this.physics.isSolid(x, y, z) ||
    this.registry.opaque[this.physics.world.getBlock(x, y, z)] === 1;

  private setMode(mode: ViewMode): void {
    this.mode = mode;
    this.controls.enabled = mode !== 'free';
    this.freeCamera.enabled = mode === 'free';
    // Visible only in third person: hidden in first person and in the free camera (A3.3).
    this.figure.visible = mode === 'third';
  }

  private placeFigure(state: Pick<EntityState, 'x' | 'y' | 'z'>): void {
    this.figure.position.set(state.x, state.y, state.z);
    this.figure.rotation.set(0, this.controls.yaw, 0);
  }
}
