import * as THREE from 'three';
import { parseMarkdown } from '../core/dialogue/markdown';
import { blocksToDom } from './markdownDom';

/** Height of the labels above the feet, blocks: just above the head. */
const ABOVE = 4.1;
/** Labels farther than this are not shown: 24 m, for names and bubbles (A6.4). */
export const LABEL_DISTANCE = 48;

/** A figure that may carry a label: its name, and what it is saying. */
export interface Labelled {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly speech: string | null;
}

/**
 * Names and speech bubbles over the figures (CHAR-002.c–d, plan F05 P14): HTML elements placed
 * by projecting the head on the screen, the bubble above the name. Texts come from world
 * files and from programs outside the page: bubbles show their Markdown as nodes built from
 * the parsed tree, never as HTML (A7.8).
 */
export class SpeechBubbles {
  private readonly labels = new Map<
    string,
    { root: HTMLElement; bubble: HTMLElement; name: HTMLElement; speech: string | null }
  >();
  private readonly point = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {}

  update(figures: readonly Labelled[], camera: THREE.PerspectiveCamera): void {
    const seen = new Set<string>();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    for (const f of figures) {
      this.point.set(f.x, f.y + ABOVE, f.z);
      const distance = this.point.distanceTo(camera.position);
      this.point.project(camera);
      if (this.point.z > 1 || distance > LABEL_DISTANCE) continue;
      seen.add(f.id);
      let label = this.labels.get(f.id);
      if (!label) {
        const root = document.createElement('div');
        root.className = 'label';
        root.dataset.id = f.id;
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        const name = document.createElement('div');
        name.className = 'name';
        root.append(bubble, name);
        this.container.append(root);
        label = { root, bubble, name, speech: null };
        this.labels.set(f.id, label);
      }
      if (label.name.textContent !== f.name) label.name.textContent = f.name;
      label.bubble.hidden = f.speech === null;
      if (f.speech !== null && label.speech !== f.speech) {
        // The same Markdown as the console, built as nodes, never as HTML (A7.8).
        label.speech = f.speech;
        label.bubble.replaceChildren(...blocksToDom(parseMarkdown(f.speech)));
      }
      const x = ((this.point.x + 1) / 2) * width;
      const y = ((1 - this.point.y) / 2) * height;
      // translate3d keeps the label on the GPU layer; whole pixels avoid blurry text.
      label.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
    }
    for (const [id, label] of this.labels) {
      if (!seen.has(id)) {
        label.root.remove();
        this.labels.delete(id);
      }
    }
  }
}
