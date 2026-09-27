import { suggest } from '../core/dialogue/address';
import { isCommand, runCommand, type CommandContext } from '../core/dialogue/commands';
import type { Nameable } from '../core/dialogue/understand';
import { words } from '../core/dialogue/understand';

/** Messages kept in the page; older ones leave the list (plan F07 P14). */
export const MAX_LINES = 500;
/** Where the page remembers whether the console is reduced to its button (DIALOG-005.g). */
const COLLAPSED_KEY = 'yw3d.console.collapsed';

export type LineKind = 'line' | 'error' | 'info';

/**
 * The message console (DIALOG-005, plan F07 P14): every message of the world on the right of
 * the view, a box to write in the view that drives the player, `@` suggestions completed with
 * Tab, `/` commands answered here. Only the list and the box take the mouse, so the scene
 * keeps it everywhere else. Lines are set as text, never as HTML: they come from world files
 * and from programs.
 */
export class MessageConsole {
  /** The characters of the world, for the suggestions after `@`. */
  characters: readonly Nameable[] = [];
  /** The world now running, for commands such as `/world` (A7.2). */
  context: () => CommandContext | undefined = () => undefined;
  private readonly list: HTMLOListElement;
  private readonly input: HTMLInputElement;
  private readonly suggestions: HTMLUListElement;
  private readonly reopen: HTMLButtonElement;
  private shown: Nameable[] = [];
  private selected = 0;
  private unread = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: {
      /** A message to say in the world. */
      send(text: string): void;
      /** The box opened or closed: the game keys are off while it is open. */
      toggled(open: boolean): void;
    },
  ) {
    this.list = root.querySelector('ol')!;
    this.input = root.querySelector('input')!;
    this.suggestions = root.querySelector('ul')!;
    this.reopen = root.querySelector<HTMLButtonElement>('button.reopen')!;
    const reduce = root.querySelector<HTMLButtonElement>('button.reduce')!;
    reduce.addEventListener('click', () => {
      reduce.blur();
      this.collapse(true);
    });
    this.reopen.addEventListener('click', () => {
      this.reopen.blur();
      this.collapse(false);
    });
    this.collapse(remembered());
    this.input.addEventListener('keydown', (e) => this.key(e));
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('input', () => this.suggest());
    // The box is always there (A7.1): writing starts when it takes the focus, by Enter or a
    // click, and ends when it loses it.
    this.input.addEventListener('focus', () => {
      if (document.pointerLockElement) document.exitPointerLock();
      this.root.classList.add('open');
      this.callbacks.toggled(true);
    });
    this.input.addEventListener('blur', () => {
      this.hideSuggestions();
      this.root.classList.remove('open');
      this.callbacks.toggled(false);
    });
    this.suggestions.addEventListener('mousedown', (e) => {
      // A click on a suggestion completes it; the box keeps the focus.
      e.preventDefault();
      const item = (e.target as HTMLElement).closest('li');
      if (!item) return;
      this.selected = [...this.suggestions.children].indexOf(item);
      this.complete();
    });
  }

  /** Whether this view may write: the one that drives the player (DIALOG-001.a). */
  get canWrite(): boolean {
    return !this.input.disabled;
  }

  set canWrite(value: boolean) {
    this.input.disabled = !value;
    this.input.placeholder = value
      ? 'Enter to write… (@name to someone, /help)'
      : 'Only the view that drives the player writes here';
    if (!value) this.input.blur();
  }

  /** Whether the player is writing in the box. */
  get isOpen(): boolean {
    return document.activeElement === this.input;
  }

  get isCollapsed(): boolean {
    return this.root.classList.contains('collapsed');
  }

  /** Enter in the scene: to the box, opening the console if it was reduced (DIALOG-005.c). */
  open(): void {
    if (!this.canWrite || this.isOpen) return;
    if (this.isCollapsed) this.collapse(false);
    this.input.focus();
  }

  /** Back to the game; what was written stays in the box. */
  close(): void {
    if (this.isOpen) this.input.blur();
  }

  /** A line of the console: a message, an error of this view, or the answer to a command. */
  add(text: string, kind: LineKind = 'line'): void {
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 8;
    const item = document.createElement('li');
    item.textContent = text;
    if (kind !== 'line') item.className = kind;
    this.list.append(item);
    while (this.list.children.length > MAX_LINES) this.list.firstElementChild!.remove();
    // Follow the new messages, unless the reader scrolled up to read older ones.
    if (atBottom) this.list.scrollTop = this.list.scrollHeight;
    if (this.isCollapsed && kind === 'line') {
      this.unread++;
      this.showUnread();
    }
  }

  /** The lines shown now, for the tests. */
  lines(): string[] {
    return [...this.list.children].map((li) => li.textContent ?? '');
  }

  /** The suggestions shown now, for the tests. */
  suggested(): string[] {
    return this.shown.map((c) => c.id);
  }

  private key(e: KeyboardEvent): void {
    // Keys typed in the box never reach the game (DIALOG-005.c).
    e.stopPropagation();
    const suggesting = this.shown.length > 0;
    if (e.key === 'Enter') {
      const text = this.input.value.trim();
      this.input.value = '';
      this.close();
      if (text === '') return;
      if (isCommand(text)) {
        const result = runCommand(text, this.context());
        if (result.ok) for (const line of result.lines) this.add(line, 'info');
        else this.add(result.error, 'error');
      } else {
        this.callbacks.send(text);
      }
    } else if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (suggesting) this.complete();
    } else if (suggesting && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const n = this.shown.length;
      this.selected = (this.selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.renderSuggestions();
    }
  }

  /** The characters matching what follows `@`, while the addressee is being written. */
  private suggest(): void {
    const value = this.input.value;
    if (!value.startsWith('@')) return this.hideSuggestions();
    const written = value.slice(1);
    const found = suggest(written, this.characters);
    const typed = words(written).join(' ');
    const done =
      found.length === 1 &&
      /\s$/.test(written) &&
      [found[0]!.id, found[0]!.name].some((t) => words(t).join(' ') === typed);
    if (found.length === 0 || done) return this.hideSuggestions();
    this.shown = found;
    this.selected = 0;
    this.renderSuggestions();
  }

  private complete(): void {
    const chosen = this.shown[this.selected];
    if (!chosen) return;
    this.input.value = `@${chosen.name} `;
    this.hideSuggestions();
  }

  private renderSuggestions(): void {
    this.suggestions.replaceChildren(
      ...this.shown.map((c, i) => {
        const item = document.createElement('li');
        item.textContent = c.name === c.id ? c.name : `${c.name} (${c.id})`;
        if (i === this.selected) item.className = 'selected';
        return item;
      }),
    );
    this.suggestions.hidden = false;
  }

  private hideSuggestions(): void {
    this.shown = [];
    this.suggestions.hidden = true;
    this.suggestions.replaceChildren();
  }

  private collapse(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
    if (!collapsed) {
      this.unread = 0;
      this.list.scrollTop = this.list.scrollHeight;
    }
    this.showUnread();
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Storage may be unavailable (private windows): the choice lasts until the page closes.
    }
  }

  private showUnread(): void {
    this.reopen.textContent = this.unread > 0 ? `Messages · ${this.unread}` : 'Messages';
  }
}

function remembered(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
