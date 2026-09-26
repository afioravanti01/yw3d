import * as THREE from 'three';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { generateTerrain } from '../core/gen/terrain';
import { ChunkRenderer } from '../render/chunkRenderer';
import { createPalette } from '../render/meshing/palette';

const canvas = document.querySelector<HTMLCanvasElement>('#world');
if (!canvas) {
  throw new Error('Missing #world canvas');
}

const registry = createDefaultRegistry();
const world = generateTerrain(1);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce8ec);
scene.add(new THREE.HemisphereLight(0xbfd8ea, 0x8a7a5a, 1.5));
const sun = new THREE.DirectionalLight(0xffe8c4, 2);
sun.position.set(-1, 1.2, 0.6);
scene.add(sun);

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

renderer.setAnimationLoop(() => {
  chunks.update();
  renderer.render(scene, camera);
});
Object.assign(window, { world });
