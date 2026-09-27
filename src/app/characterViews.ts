import type * as THREE from 'three';
import type { CharacterStart } from '../core/compose/composeWorld';
import type { CharacterSnapshot } from '../protocol/messages';
import { AnimatedFigure } from '../render/figure';
import { MonkeyFigure } from '../render/monkey';

/** The figures of the characters in the scene (CHAR-001.d, CHAR-002). */
export class CharacterViews {
  private figures = new Map<string, AnimatedFigure | MonkeyFigure>();
  private time = 0;

  /** A new world: one figure per declared character, in its colors. */
  reset(starts: readonly CharacterStart[], scene: THREE.Scene): void {
    for (const figure of this.figures.values()) figure.dispose();
    this.figures = new Map(
      starts.map((start) => [
        start.id,
        // A person, or an animal (CHAR-003.b).
        start.body === 'monkey'
          ? new MonkeyFigure(`character ${start.id}`)
          : new AnimatedFigure(start.appearance, `character ${start.id}`),
      ]),
    );
    for (const figure of this.figures.values()) scene.add(figure.group);
  }

  update(characters: readonly CharacterSnapshot[], dt: number): void {
    this.time += dt;
    for (const c of characters) {
      this.figures.get(c.id)?.update(c, c.yaw, c.speech !== null, dt, this.time);
    }
  }
}
