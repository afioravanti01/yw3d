import * as THREE from 'three';
import type { FigureState } from './figure';
import { advancePhase, pose } from './pose';

/** Colors of the monkey: brown fur, a light face and hands, dark eyes (CHAR-003.b). */
const FUR = 0x7a4a2a;
const DARK_FUR = 0x5e3820;
const FACE = 0xe2bc92;
const EYES = 0x20140c;

/** Short legs make many steps: the walking cycle goes this much faster than a person's. */
const STEP_FACTOR = 2.6;

/**
 * The figure of a monkey (CHAR-003.b, plan F09 P12): about 1.4 blocks tall (0.7 m), a leaning
 * body, a big head with a light muzzle and round ears, long arms and a long curled tail that
 * sways. It moves with the same poses as a person (`pose`), on its own proportions, facing -z.
 */
export class MonkeyFigure {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly tailTip = new THREE.Group();
  private phase = 0;
  private speed = 0;
  private last: FigureState | undefined;

  constructor(name = 'monkey') {
    this.group.name = name;
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
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color }),
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    };
    // Joints: hips at 0.42, shoulders at 0.9, neck at 0.95 (blocks above the feet).
    this.group.add(this.body);
    for (const [leg, x] of [
      [this.leftLeg, -0.13],
      [this.rightLeg, 0.13],
    ] as const) {
      leg.position.set(x, 0.42, 0);
      box(leg, DARK_FUR, 0.16, 0.42, 0.18, 0, -0.21);
      box(leg, FACE, 0.17, 0.06, 0.24, 0, -0.39, -0.03);
      this.body.add(leg);
    }
    box(this.body, FUR, 0.46, 0.55, 0.34, 0, 0.68);
    box(this.body, FACE, 0.3, 0.36, 0.02, 0, 0.66, -0.17);
    for (const [arm, x] of [
      [this.leftArm, -0.3],
      [this.rightArm, 0.3],
    ] as const) {
      arm.position.set(x, 0.9, 0);
      box(arm, FUR, 0.13, 0.52, 0.14, 0, -0.26);
      box(arm, FACE, 0.14, 0.1, 0.15, 0, -0.56);
      this.body.add(arm);
    }
    this.head.position.set(0, 0.95, 0);
    box(this.head, FUR, 0.46, 0.42, 0.42, 0, 0.21);
    // The muzzle and the face, lighter, on the front; eyes above the muzzle.
    box(this.head, FACE, 0.34, 0.26, 0.04, 0, 0.2, -0.22);
    box(this.head, FACE, 0.22, 0.13, 0.12, 0, 0.12, -0.27);
    for (const x of [-0.08, 0.08]) box(this.head, EYES, 0.06, 0.06, 0.02, x, 0.26, -0.245);
    // Round ears on the sides.
    for (const x of [-0.26, 0.26]) box(this.head, FACE, 0.07, 0.14, 0.12, x, 0.24, 0);
    this.body.add(this.head);
    // The tail: two segments from the back, curling up at the tip.
    this.tail.position.set(0, 0.46, 0.17);
    box(this.tail, FUR, 0.07, 0.07, 0.36, 0, 0, 0.18);
    this.tailTip.name = 'tail tip';
    this.tailTip.position.set(0, 0, 0.36);
    box(this.tailTip, FUR, 0.07, 0.34, 0.07, 0, 0.17, 0);
    this.tail.add(this.tailTip);
    this.body.add(this.tail);
  }

  /** Places and poses the figure for a frame of `dt` seconds at time `time`. */
  update(state: FigureState, yaw: number, speaking: boolean, dt: number, time: number): void {
    const moved = this.last ? Math.hypot(state.x - this.last.x, state.z - this.last.z) : 0;
    this.last = state;
    const distance = moved < 3 ? moved : 0;
    this.phase = advancePhase(this.phase, distance * STEP_FACTOR);
    const measured = dt > 0 ? distance / dt : 0;
    this.speed += (measured - this.speed) * Math.min(1, dt * 10);
    const p = pose({
      speed: this.speed * STEP_FACTOR,
      onGround: state.onGround,
      submerged: state.submerged,
      speaking,
      time,
      phase: this.phase,
    });
    this.group.position.set(state.x, state.y, state.z);
    this.group.rotation.set(0, yaw, 0);
    this.body.position.y = p.bob * 0.4;
    // A monkey always leans a little forward, more when it runs.
    this.body.rotation.x = -(0.18 + p.lean);
    this.leftLeg.rotation.x = -p.leftLeg;
    this.rightLeg.rotation.x = -p.rightLeg;
    this.leftArm.rotation.x = -p.leftArm * 1.2;
    this.rightArm.rotation.x = -p.rightArm * 1.2;
    this.head.rotation.x = -p.head + 0.12;
    // The tail sways all the time, faster when it moves.
    const sway = Math.sin(time * (2 + this.speed)) * 0.35;
    this.tail.rotation.set(0.5, sway, 0);
    this.tailTip.rotation.set(-0.4 + Math.sin(time * 1.7) * 0.2, 0, 0);
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
