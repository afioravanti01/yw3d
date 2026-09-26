import * as THREE from 'three';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { generateTerrain } from '../core/gen/terrain';
import { ChunkRenderer } from '../render/chunkRenderer';
import { createPalette } from '../render/meshing/palette';
import { configureRenderer, createWorldScene } from '../render/scene';

const canvas = document.querySelector<HTMLCanvasElement>('#world');
if (!canvas) {
  throw new Error('Missing #world canvas');
}

const registry = createDefaultRegistry();
const world = generateTerrain(1);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
configureRenderer(renderer);
const { scene, update: updateScene } = createWorldScene(world.size);

const chunks = new ChunkRenderer(
  world,
  createPalette(registry),
  new THREE.MeshLambertMaterial({ vertexColors: true }),
);
chunks.buildAll();
scene.add(chunks.group);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(world.size.x / 2, 110, world.size.z + 60);
camera.lookAt(world.size.x / 2, 30, world.size.z / 2);

// Temporary debug viewpoint until the fly camera (T1.11): ?cam=x,y,z,lookX,lookY,lookZ
const cam = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
if (cam?.length === 6) {
  camera.position.set(cam[0]!, cam[1]!, cam[2]!);
  camera.lookAt(cam[3]!, cam[4]!, cam[5]!);
}

renderer.setAnimationLoop(() => {
  if (chunks.update() > 0) {
    renderer.shadowMap.needsUpdate = true;
  }
  updateScene(camera);
  renderer.render(scene, camera);
});
Object.assign(window, { world });
