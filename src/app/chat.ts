/** Lines kept in the log, and how long a line stays before it fades (plan F06 P17). */
export const LOG_LINES = 8;
export const FADE_MS = 15_000;

/**
 * The text box and the conversation log (DIALOG-001.a, DIALOG-002, plan F06 P17): Enter opens
 * the box and says the sentence, Esc cancels. Lines are set as text, never as HTML: they come
 * from world files and from other programs.
 */
export class Chat {
  /** Whether this view may speak: the one that drives the player (DIALOG-001.a). */
  canWrite = true;
  private readonly log: HTMLOListElement;
  private readonly input: HTMLInputElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: {
      /** A sentence to say. */
      send(text: string): void;
      /** The box opened or closed: the game keys are off while it is open. */
      toggled(open: boolean): void;
    },
  ) {
    this.log = root.querySelector('ol')!;
    this.input = root.querySelector('input')!;
    this.input.addEventListener('keydown', (e) => {
      // Keys typed in the box never reach the game (DIALOG-001.a).
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        this.close();
        if (text !== '') this.callbacks.send(text);
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return !this.input.hidden;
  }

  open(): void {
    if (!this.canWrite || this.isOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.hidden = false;
    this.input.value = '';
    this.root.classList.add('open');
    this.input.focus();
    this.callbacks.toggled(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.input.hidden = true;
    this.input.blur();
    this.root.classList.remove('open');
    this.callbacks.toggled(false);
  }

  /** A line of the log: a sentence, or an error of this view in its own style. */
  add(text: string, kind: 'line' | 'error' = 'line'): void {
    const item = document.createElement('li');
    item.textContent = text;
    if (kind === 'error') item.className = 'error';
    this.log.append(item);
    while (this.log.children.length > LOG_LINES) this.log.firstElementChild!.remove();
    setTimeout(() => item.classList.add('faded'), FADE_MS);
  }

  /** The lines shown now, for the tests. */
  lines(): string[] {
    return [...this.log.children].map((li) => li.textContent ?? '');
  }
}
