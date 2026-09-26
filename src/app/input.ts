import { IDLE, type Intent } from '../core/physics/entity';
import { movementDirection } from '../render/flyCamera';

const MOUSE_SENSITIVITY = 0.0022;
const MAX_PITCH = (89 * Math.PI) / 180;
/** Keys whose default browser action (scrolling, menus) would get in the way. */
const CAPTURED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F4']);

/**
 * Intents of the player for the pressed keys (PLAYER-002.b, plan F03 P11): WASD or arrows move
 * on the horizontal plane relative to the view, Shift runs, Space jumps; in water Space or Z
 * swim up and X swims down. Keys are physical positions (KeyboardEvent.code).
 */
export function intentFromKeys(keys: ReadonlySet<string>, yaw: number): Intent {
  const { x, z } = movementDirection(keys, yaw);
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
    window.addEventListener('blur', () => this.keys.clear(), { signal });
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

  /** Current intents, or none while the player mode is not active. */
  intent(): Intent {
    return this.enabled ? intentFromKeys(this.keys, this.yaw) : IDLE;
  }

  dispose(): void {
    this.abort.abort();
  }
}
