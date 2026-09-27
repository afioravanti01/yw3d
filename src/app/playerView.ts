import * as THREE from 'three';
import type { BlockRegistry } from '../core/blocks/registry';
import type { EntityState, Intent } from '../core/physics/entity';
import { EYE_HEIGHT, thirdPersonCamera } from '../core/player/player';
import type { World } from '../core/world/world';
import type { FlyCamera } from '../render/flyCamera';
import type { Appearance } from '../core/characters/appearance';
import { AnimatedFigure } from '../render/figure';
import type { HostConnection } from './hostConnection';
import type { PlayerControls } from './input';

/** View modes (PLAYER-003.a, CAM-001.f). */
export type ViewMode = 'first' | 'third' | 'free';

/** How fast the eyes catch up after climbing a step, per second (PHYS-005.c). */
const EYE_SMOOTHING = 14;

type Position = { x: number; y: number; z: number };
export type PlayerState = Pick<
  EntityState,
  'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'onGround' | 'submerged'
>;

/**
 * Where the player comes from: simulated in the page (browser only) or by the host (F04).
 * Either way the view reads a position to draw and a state for the overlay.
 */
export interface PlayerSource {
  /** Advances by a frame of `dt` seconds with the intent of this view. */
  advance(dt: number, intent: Intent, yaw: number, pitch: number): void;
  /** Position to draw now, interpolated between simulation steps. */
  render(): Position;
  state(): PlayerState;
  /** Direction the figure faces, when this view does not drive the player. */
  figureYaw(): number | undefined;
  /** Duration of the last simulation step in this page, 0 when the host simulates. */
  readonly lastStepMs: number;
  replaceWorld(world: World): void;
}

/** The player simulated by the host (HOST-002.b): intents go out, states come in. */
export class RemotePlayer implements PlayerSource {
  readonly lastStepMs = 0;

  constructor(
    private readonly connection: HostConnection,
    private readonly now: () => number,
  ) {}

  advance(_dt: number, intent: Intent, yaw: number, pitch: number): void {
    if (this.connection.role === 'driver')
      this.connection.sendIntent(intent, yaw, pitch, this.now());
  }

  render(): Position {
    return this.connection.interpolated(this.now()) ?? { x: 0, y: 0, z: 0 };
  }

  state(): PlayerState {
    return (
      this.connection.latest() ?? {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        onGround: false,
        submerged: 0,
      }
    );
  }

  figureYaw(): number | undefined {
    return this.connection.role === 'driver' ? undefined : this.connection.latest()?.yaw;
  }

  replaceWorld(): void {
    // The host keeps the player: nothing to do here.
  }
}

/**
 * The player on screen: first- and third-person views, the free camera, and the figure. A
 * spectator view (F04 Q3) watches with the free camera and sees the figure of the player.
 */
export class PlayerView {
  mode: ViewMode = 'first';
  /** The player as others see it: the animated figure of the characters, in its colors (F05 Q7). */
  readonly animated: AnimatedFigure;
  private time = 0;
  private spectator = false;
  private world: World;
  private eyeY: number | undefined;
  private lastPlayerMode: 'first' | 'third' = 'first';

  constructor(
    world: World,
    private readonly registry: BlockRegistry,
    public source: PlayerSource,
    private readonly controls: PlayerControls,
    private readonly freeCamera: FlyCamera,
    appearance: Appearance,
  ) {
    this.world = world;
    this.animated = new AnimatedFigure(appearance, 'player');
    this.setMode('first');
  }

  get isSpectator(): boolean {
    return this.spectator;
  }

  replaceWorld(world: World): void {
    this.world = world;
    this.source.replaceWorld(world);
  }

  /** A spectator only watches, with the free camera; a driver plays in first person. */
  setSpectator(spectator: boolean, camera: THREE.PerspectiveCamera): void {
    if (spectator === this.spectator) return;
    this.spectator = spectator;
    if (spectator) {
      if (this.mode !== 'free') this.toggleFree(camera);
      // Start behind and above the player, looking at it.
      const { x, y, z } = this.source.render();
      const back = 16;
      const up = 10;
      this.freeCamera.setPose({
        position: { x, y: y + EYE_HEIGHT + up, z: z + back },
        yaw: 0,
        pitch: -Math.atan2(up, back),
      });
    } else {
      this.setMode('first');
    }
  }

  toggleThirdPerson(): void {
    if (this.mode !== 'free') this.setMode(this.mode === 'first' ? 'third' : 'first');
  }

  /** C: free camera from the current view, and back to the player (CAM-001.e–f). */
  toggleFree(camera: THREE.PerspectiveCamera): void {
    if (this.mode === 'free') {
      if (!this.spectator) this.setMode(this.lastPlayerMode);
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

  /** Advances the player by a frame and places the camera and the figure. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.mode !== 'free') this.controls.turn(dt);
    this.source.advance(dt, this.controls.intent(), this.controls.yaw, this.controls.pitch);
    const { x, y, z } = this.source.render();
    this.time += dt;
    const state = this.source.state();
    this.animated.update(
      { x, y, z, onGround: state.onGround, submerged: state.submerged },
      this.source.figureYaw() ?? this.controls.yaw,
      false,
      dt,
      this.time,
    );
    if (this.mode === 'free') {
      this.freeCamera.update(dt);
      return;
    }

    // The eyes rise smoothly on steps and follow at once when going down.
    const targetEye = y + EYE_HEIGHT;
    this.eyeY =
      this.eyeY === undefined || targetEye < this.eyeY || targetEye - this.eyeY > 3
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
  }

  /** Solid or opaque blocks stop the third-person camera (leaves too). */
  private readonly blocksView = (x: number, y: number, z: number) => {
    const block = this.world.getBlock(x, y, z);
    return (
      !this.world.isInside(x, y, z) ||
      this.registry.solid[block] === 1 ||
      this.registry.opaque[block] === 1
    );
  };

  private setMode(mode: ViewMode): void {
    this.mode = mode;
    this.controls.enabled = mode !== 'free';
    this.freeCamera.enabled = mode === 'free';
    // Visible in third person; hidden in first person and in the free camera (A3.3), except
    // for spectators, who watch the player.
    this.animated.group.visible = mode === 'third' || (mode === 'free' && this.spectator);
  }
}
