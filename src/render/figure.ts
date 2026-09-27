import * as THREE from 'three';
import type { Appearance } from '../core/characters/appearance';
import { advancePhase, pose } from './pose';

/** The state a figure needs from its character, per frame. */
export interface FigureState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly onGround: boolean;
  readonly submerged: number;
}

/**
 * A soft dark disc on the ground under a figure (plan F09, deviation of T9.05): the shadow map
 * is drawn again only when the terrain or the step of the light changes, so moving figures do
 * not cast into it; this disc keeps them on the ground.
 */
export class GroundShadow {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor(radius: number) {
    this.mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.mesh.name = 'ground shadow';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.01;
    this.mesh.renderOrder = 1;
  }

  /** Shown under the feet while the figure stands on the ground. */
  update(state: FigureState): void {
    this.mesh.visible = state.onGround && state.submerged === 0;
  }
}

/**
 * An articulated figure of blocks (CHAR-002): head, body, arms and legs hung on joints, in the
 * colors of its appearance, 1.2 blocks wide and 3.5 tall, standing on its origin and facing -z.
 * The pose comes from `pose` (plan F05 P13); the step cycle from the distance walked.
 */
export class AnimatedFigure {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly shadow = new GroundShadow(0.7);
  private phase = 0;
  private speed = 0;
  private last: FigureState | undefined;

  constructor(appearance: Appearance, name = 'figure') {
    this.group.name = name;
    this.group.add(this.shadow.mesh);
    const material = (color: number) => new THREE.MeshLambertMaterial({ color });
    const box = (
      parent: THREE.Object3D,
      color: number,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z = 0,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      parent.add(mesh);
    };
    // Joints: hips at 1.55, shoulders at 2.75, neck at 2.8 (blocks above the feet).
    this.group.add(this.body);
    for (const [leg, x] of [
      [this.leftLeg, -0.25],
      [this.rightLeg, 0.25],
    ] as const) {
      leg.position.set(x, 1.55, 0);
      box(leg, appearance.trousers, 0.45, 1.55, 0.5, 0, -0.775);
      this.body.add(leg);
    }
    box(this.body, appearance.shirt, 1.0, 1.25, 0.55, 0, 2.175);
    for (const [arm, x] of [
      [this.leftArm, -0.66],
      [this.rightArm, 0.66],
    ] as const) {
      arm.position.set(x, 2.75, 0);
      box(arm, appearance.shirt, 0.3, 0.85, 0.4, 0, -0.35);
      box(arm, appearance.skin, 0.28, 0.3, 0.38, 0, -0.93);
      this.body.add(arm);
    }
    this.head.position.set(0, 2.8, 0);
    box(this.head, appearance.skin, 0.7, 0.7, 0.7, 0, 0.35);
    // The hair wraps the top and the back of the head: no face lies on a face of the head.
    box(this.head, appearance.hair, 0.76, 0.16, 0.76, 0, 0.66);
    box(this.head, appearance.hair, 0.76, 0.6, 0.12, 0, 0.4, 0.33);
    this.body.add(this.head);
  }

  /** Places and poses the figure for a frame of `dt` seconds at time `time`. */
  update(state: FigureState, yaw: number, speaking: boolean, dt: number, time: number): void {
    const moved = this.last ? Math.hypot(state.x - this.last.x, state.z - this.last.z) : 0;
    this.last = state;
    // A teleport (reload, respawn) does not count as walking.
    const distance = moved < 3 ? moved : 0;
    this.phase = advancePhase(this.phase, distance);
    const measured = dt > 0 ? distance / dt : 0;
    this.speed += (measured - this.speed) * Math.min(1, dt * 10);

    const p = pose({
      speed: this.speed,
      onGround: state.onGround,
      submerged: state.submerged,
      speaking,
      time,
      phase: this.phase,
    });
    this.group.position.set(state.x, state.y, state.z);
    this.group.rotation.set(0, yaw, 0);
    this.shadow.update(state);
    this.body.position.y = p.bob;
    this.body.rotation.x = -p.lean;
    this.leftLeg.rotation.x = -p.leftLeg;
    this.rightLeg.rotation.x = -p.rightLeg;
    this.leftArm.rotation.x = -p.leftArm;
    this.rightArm.rotation.x = -p.rightArm;
    this.head.rotation.x = -p.head;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }
}
