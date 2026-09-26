import * as THREE from 'three';

/** Colors of the placeholder figure, in the warm palette of the world. */
const SKIN = 0xd9b08c;
const HAIR = 0x4b3626;
const SHIRT = 0xa55f3a;
const TROUSERS = 0x4a5562;

/**
 * A simple static figure made of boxes (PLAYER-003.c, plan F03 P10), 1.2 blocks wide and
 * 3.5 tall, standing on its origin and facing -z. Replaced by animated characters in F04.
 */
export function createPlayerFigure(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'player';
  const part = (color: number, w: number, h: number, d: number, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(TROUSERS, 0.45, 1.55, 0.5, -0.25, 0);
  part(TROUSERS, 0.45, 1.55, 0.5, 0.25, 0);
  part(SHIRT, 1.0, 1.25, 0.55, 0, 1.55);
  part(SHIRT, 0.3, 1.15, 0.4, -0.66, 1.65);
  part(SHIRT, 0.3, 1.15, 0.4, 0.66, 1.65);
  part(SKIN, 0.7, 0.7, 0.7, 0, 2.8);
  // The hair wraps the top of the head and sticks out a little everywhere: no face of the hair
  // lies on a face of the head, which would flicker (z-fighting).
  part(HAIR, 0.76, 0.16, 0.76, 0, 3.38);
  // A band at the back of the head shows which way the figure faces.
  part(HAIR, 0.76, 0.6, 0.12, 0, 2.9, 0.33);
  return group;
}
