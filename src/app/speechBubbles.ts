import * as THREE from 'three';
import type { CharacterSnapshot } from '../protocol/messages';

/** Height of a bubble above the feet, blocks: just above the head. */
const ABOVE = 4.1;
/** Bubbles farther than this are not shown. */
const MAX_DISTANCE = 48;

/**
 * Speech bubbles over the characters (CHAR-002.c, plan F05 P14): HTML elements placed by
 * projecting the head on the screen. The text comes from controllers outside the page, so it
 * is always set as text, never as HTML.
 */
export class SpeechBubbles {
  private readonly bubbles = new Map<string, HTMLElement>();
  private readonly point = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {}

  update(
    characters: readonly Pick<CharacterSnapshot, 'id' | 'x' | 'y' | 'z' | 'speech'>[],
    camera: THREE.PerspectiveCamera,
  ): void {
    const seen = new Set<string>();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    for (const c of characters) {
      if (!c.speech) continue;
      this.point.set(c.x, c.y + ABOVE, c.z);
      const distance = this.point.distanceTo(camera.position);
      this.point.project(camera);
      if (this.point.z > 1 || distance > MAX_DISTANCE) continue;
      seen.add(c.id);
      let bubble = this.bubbles.get(c.id);
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'bubble';
        this.container.append(bubble);
        this.bubbles.set(c.id, bubble);
      }
      if (bubble.textContent !== c.speech) bubble.textContent = c.speech;
      const x = ((this.point.x + 1) / 2) * width;
      const y = ((1 - this.point.y) / 2) * height;
      bubble.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, bubble] of this.bubbles) {
      if (!seen.has(id)) {
        bubble.remove();
        this.bubbles.delete(id);
      }
    }
  }
}
