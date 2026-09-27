import * as THREE from 'three';
import type { LightRect } from '../core/structures/registry';

/** The warm light of a lit window (RENDER-008.b). */
const WARM = new THREE.Color(0xffc46e);

/**
 * The lit windows of the world (RENDER-008.b, plan F09 P8): one mesh of flat quads, one per lit
 * rectangle, without real lights. They glow through the fog, so they are seen from afar, and
 * they are hidden by day.
 */
export class WindowLights {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(lights: readonly LightRect[]) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const { from, to } of lights) {
      const [x0, y0, z0] = from;
      const [x1, y1, z1] = to;
      const base = positions.length / 3;
      // A vertical rectangle: along x (z fixed) or along z (x fixed).
      positions.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({
      color: WARM.clone(),
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'windows';
    this.mesh.visible = false;
  }

  /** How bright the windows are: 0 by day (hidden), 1 at night. */
  setBrightness(value: number): void {
    this.mesh.visible = value > 0.02 && this.mesh.geometry.index!.count > 0;
    this.mesh.material.color.copy(WARM).multiplyScalar(Math.min(1, Math.max(0, value)));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
