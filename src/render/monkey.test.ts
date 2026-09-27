import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AnimatedFigure } from './figure';
import { MonkeyFigure } from './monkey';

describe('the figure of the monkey', () => {
  it('CHAR-003.b: a small figure, about 1.4 blocks tall, with a tail that sways', () => {
    const figure = new MonkeyFigure();
    const state = { x: 10, y: 5, z: 10, onGround: true, submerged: 0 };
    figure.update(state, 0, false, 0.016, 0);
    figure.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(figure.group);
    expect(box.min.y).toBeGreaterThanOrEqual(5 - 0.05);
    expect(box.max.y - 5).toBeGreaterThan(1.2);
    expect(box.max.y - 5).toBeLessThan(1.6);
    const tail = (time: number) => {
      figure.update(state, 0, false, 0.016, time);
      figure.group.updateMatrixWorld(true);
      return figure.group.getObjectByName('tail tip')!.getWorldPosition(new THREE.Vector3()).x;
    };
    expect(tail(0.3)).not.toBeCloseTo(tail(1.1), 3);
    figure.dispose();
  });

  it('CHAR-002.b: every figure has a shadow under its feet while on the ground, and casts none into the shadow map', () => {
    const appearance = { skin: 0xe0b090, hair: 0x302010, shirt: 0x4060a0, trousers: 0x303040 };
    for (const figure of [new AnimatedFigure(appearance), new MonkeyFigure()]) {
      const shadow = figure.group.getObjectByName('ground shadow')!;
      figure.update({ x: 3, y: 7, z: 3, onGround: true, submerged: 0 }, 0, false, 0.016, 0);
      expect(shadow.visible).toBe(true);
      expect(shadow.position.y).toBeLessThan(0.05);
      figure.update({ x: 3, y: 9, z: 3, onGround: false, submerged: 0 }, 0, false, 0.016, 0.1);
      expect(shadow.visible).toBe(false);
      figure.group.traverse((o) => expect(o.castShadow).toBe(false));
      figure.dispose();
    }
  });
});
