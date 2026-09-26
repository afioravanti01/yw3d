import { IDLE, type Intent } from '../core/physics/entity';

const MOUSE_SENSITIVITY = 0.0022;
import { TURN_SPEED } from '../render/flyCamera';

export { TURN_SPEED };
const MAX_PITCH = (89 * Math.PI) / 180;
/** Keys whose default browser action (scrolling, menus) would get in the way. */
const CAPTURED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const pressed = (keys: ReadonlySet<string>, ...codes: string[]) =>
  codes.some((code) => keys.has(code)) ? 1 : 0;

/**
 * Intents of the player for the pressed keys (PLAYER-002.b, plan F03 P11): WASD move on the
 * horizontal plane relative to the view, ↑/↓ go forward and back (the ←/→ arrows turn, see
 * `turnFromKeys`), Shift runs, Space jumps; in water Space or Z swim up and X swims down.
 * Keys are physical positions (KeyboardEvent.code).
 */
export function intentFromKeys(keys: ReadonlySet<string>, yaw: number): Intent {
  const forward = pressed(keys, 'KeyW', 'ArrowUp') - pressed(keys, 'KeyS', 'ArrowDown');
  const right = pressed(keys, 'KeyD') - pressed(keys, 'KeyA');
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  let x = -sin * forward + cos * right;
  let z = -cos * forward - sin * right;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  const up = keys.has('Space') || keys.has('KeyZ');
  const down = keys.has('KeyX');
  return {
    ...IDLE,
    // `+ 0` turns -0 into 0, so that idle intents compare equal.
    moveX: x + 0,
    moveZ: z + 0,
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    jump: keys.has('Space'),
    swim: up && !down ? 1 : down && !up ? -1 : 0,
  };
}

/** Change of the view direction in `seconds` for the ←/→ arrows: left turns left (A3.1). */
export function turnFromKeys(keys: ReadonlySet<string>, seconds: number): number {
  return (pressed(keys, 'ArrowLeft') - pressed(keys, 'ArrowRight')) * TURN_SPEED * seconds;
}

/** Keyboard and mouse state of the player mode: pressed keys and view direction. */
export class PlayerControls {
  enabled = true;
  yaw = 0;
  pitch = 0;
  readonly keys = new Set<string>();
  private readonly abort = new AbortController();

  constructor(
    private readonly element: HTMLElement,
    /** Called on key presses that are not movement, e.g. to switch view modes. */
    onKey: (code: string) => void,
  ) {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (e) => {
        if (CAPTURED.has(e.code)) e.preventDefault();
        if (!e.repeat) onKey(e.code);
        this.keys.add(e.code);
      },
      { signal },
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), { signal });
    // Keys released while the page does not get the events (Esc that frees the mouse, another
    // window, a hidden tab) would stay pressed forever: forget them all at those moments.
    const releaseAll = () => this.keys.clear();
    window.addEventListener('blur', releaseAll, { signal });
    document.addEventListener('pointerlockchange', releaseAll, { signal });
    document.addEventListener('visibilitychange', releaseAll, { signal });
    document.addEventListener(
      'mousemove',
      (e) => {
        if (!this.enabled || document.pointerLockElement !== this.element) return;
        this.yaw -= e.movementX * MOUSE_SENSITIVITY;
        this.pitch = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, this.pitch - e.movementY * MOUSE_SENSITIVITY),
        );
      },
      { signal },
    );
  }

  /** Turns the view with the arrow keys for a frame of `seconds`. */
  turn(seconds: number): void {
    if (this.enabled) this.yaw += turnFromKeys(this.keys, seconds);
  }

  /** Current intents, or none while the player mode is not active. */
  intent(): Intent {
    return this.enabled ? intentFromKeys(this.keys, this.yaw) : IDLE;
  }

  dispose(): void {
    this.abort.abort();
  }
}
