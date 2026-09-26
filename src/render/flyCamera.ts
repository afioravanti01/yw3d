import * as THREE from 'three';
import { AIR } from '../core/blocks/builtin';
import { metersToBlocks } from '../core/world/units';
import type { World, WorldSize } from '../core/world/world';

export const MIN_SPEED_MPS = 2;
export const MAX_SPEED_MPS = 40;
export const DEFAULT_SPEED_MPS = 8;
/** The camera may leave the world by this much on every side and above (CAM-001.d). */
export const CAMERA_MARGIN_M = 16;
const MAX_PITCH = THREE.MathUtils.degToRad(89);
const MOUSE_SENSITIVITY = 0.0022;
const WHEEL_STEP = 1.15;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vec3;
  /** Rotation around the vertical axis, radians; 0 looks towards -z (north). */
  yaw: number;
  /** Rotation above/below the horizon, radians. */
  pitch: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Keeps a position inside the world extended by 16 m, and not below y = 0 (CAM-001.d). */
export function clampCamera(p: Vec3, size: WorldSize): Vec3 {
  const m = metersToBlocks(CAMERA_MARGIN_M);
  return {
    x: clamp(p.x, -m, size.x + m),
    y: clamp(p.y, 0, size.y + m),
    z: clamp(p.z, -m, size.z + m),
  };
}

export function clampSpeed(mps: number): number {
  return clamp(mps, MIN_SPEED_MPS, MAX_SPEED_MPS);
}

/** Keys for each horizontal direction: WASD, and the arrows as an alternative (A1.1). */
const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  // Z and X as an alternative to Space and Shift (A2.2).
  up: ['Space', 'KeyZ'],
  down: ['ShiftLeft', 'ShiftRight', 'KeyX'],
} as const;
const ARROW_KEYS = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const anyPressed = (keys: ReadonlySet<string>, codes: readonly string[]) =>
  codes.some((code) => keys.has(code)) ? 1 : 0;

/**
 * Movement direction for the pressed keys (KeyboardEvent.code, plan P13): WASD or arrows on the
 * horizontal plane relative to the yaw, Space or Z up, Shift or X down. Horizontal length is at
 * most 1.
 */
export function movementDirection(keys: ReadonlySet<string>, yaw: number): Vec3 {
  const forward = anyPressed(keys, MOVE_KEYS.forward) - anyPressed(keys, MOVE_KEYS.back);
  const right = anyPressed(keys, MOVE_KEYS.right) - anyPressed(keys, MOVE_KEYS.left);
  const up = anyPressed(keys, MOVE_KEYS.up) - anyPressed(keys, MOVE_KEYS.down);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  let x = -sin * forward + cos * right;
  let z = -cos * forward - sin * right;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return { x, y: up, z };
}

/** Above the center of the world, higher than the terrain around it, looking north-east (CAM-001.e). */
export function initialCameraPose(world: World): CameraPose {
  const cx = Math.floor(world.size.x / 2);
  const cz = Math.floor(world.size.z / 2);
  const column = new Uint8Array(world.size.y);
  let top = 0;
  for (let dz = -32; dz <= 32; dz += 8) {
    for (let dx = -32; dx <= 32; dx += 8) {
      world.readColumn(cx + dx, cz + dz, column);
      let y = column.length - 1;
      while (y > 0 && column[y] === AIR) y--;
      top = Math.max(top, y);
    }
  }
  return {
    position: { x: cx, y: top + metersToBlocks(14), z: cz },
    yaw: -Math.PI / 4,
    pitch: -0.3,
  };
}

/** Free-flying camera without collisions (CAM-001). */
export class FlyCamera {
  speed = DEFAULT_SPEED_MPS;
  yaw = 0;
  pitch = 0;

  private readonly keys = new Set<string>();
  private readonly abort = new AbortController();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly element: HTMLElement,
    private readonly size: WorldSize,
  ) {
    const signal = this.abort.signal;
    element.addEventListener('click', () => void element.requestPointerLock(), { signal });
    document.addEventListener('mousemove', (e) => this.onMouseMove(e), { signal });
    window.addEventListener('keydown', (e) => this.onKey(e, true), { signal });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
    element.addEventListener('wheel', (e) => this.onWheel(e), { signal, passive: false });
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  setPose(pose: CameraPose): void {
    const p = clampCamera(pose.position, this.size);
    this.camera.position.set(p.x, p.y, p.z);
    this.yaw = pose.yaw;
    this.pitch = clamp(pose.pitch, -MAX_PITCH, MAX_PITCH);
    this.applyRotation();
  }

  /** Moves the camera for a frame of `dt` seconds. */
  update(dt: number): void {
    const direction = movementDirection(this.keys, this.yaw);
    const distance = metersToBlocks(this.speed) * dt;
    const p = clampCamera(
      {
        x: this.camera.position.x + direction.x * distance,
        y: this.camera.position.y + direction.y * distance,
        z: this.camera.position.z + direction.z * distance,
      },
      this.size,
    );
    this.camera.position.set(p.x, p.y, p.z);
    this.applyRotation();
  }

  dispose(): void {
    this.abort.abort();
  }

  private applyRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked) return;
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch = clamp(this.pitch - e.movementY * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.code === 'Space' || ARROW_KEYS.has(e.code)) e.preventDefault();
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.speed = clampSpeed(this.speed * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP));
  }
}
