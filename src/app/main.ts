import * as THREE from 'three';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { generateTerrain } from '../core/gen/terrain';
import { ChunkRenderer } from '../render/chunkRenderer';
import { FlyCamera, initialCameraPose } from '../render/flyCamera';
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
configureRenderer(renderer);
const { scene, update: updateScene } = createWorldScene(world.size);

const chunks = new ChunkRenderer(
  world,
  createPalette(registry),
  new THREE.MeshLambertMaterial({ vertexColors: true }),
);
chunks.buildAll();
scene.add(chunks.group);

const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
const controls = new FlyCamera(camera, canvas, world.size);
controls.setPose(initialCameraPose(world));

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // Clamp long frames (tab switches) so the camera does not jump.
  controls.update(Math.min(timer.getDelta(), 0.1));
  if (chunks.update() > 0) {
    renderer.shadowMap.needsUpdate = true;
  }
  updateScene(camera);
  renderer.render(scene, camera);
});
Object.assign(window, { world });
