import * as THREE from 'three';
import { metersToBlocks } from '../core/world/units';
import type { WorldSize } from '../core/world/world';
import type { Daylight } from './daylight';

/** Warm natural palette (spec Q4), sRGB. */
export const SKY_HORIZON = 0xdce8ec;
export const SKY_ZENITH = 0x86b4dc;
export const SUN_COLOR = 0xffe8c4;
const HEMI_SKY = 0xc6ddef;
const HEMI_GROUND = 0x7a6a50;

/** Late-afternoon sun from the west-south-west, about 33° above the horizon. */
const SUN_DIRECTION = new THREE.Vector3(-0.66, 0.55, 0.5).normalize();

/** Fog distances (RENDER-004.b, RENDER-006.b): the world border, 128 m from the center, is hazy. */
const FOG_NEAR_M = 45;
const FOG_FAR_M = 250;

const SKY_RADIUS = 1500;

export interface WorldScene {
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  /** Keeps the sky centered on the camera. Call once per frame. */
  update(camera: THREE.Camera): void;
  /** The light of the moment (RENDER-003, RENDER-004, plan F09 P4–P6). */
  setDaylight(light: Daylight): void;
}

/** Renderer settings the scene relies on: static shadows (plan P7). */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Shadows are redrawn on demand (needsUpdate): after chunk rebuilds and while the hour flows.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

export function createWorldScene(size: WorldSize): WorldScene {
  const scene = new THREE.Scene();
  const horizon = new THREE.Color(SKY_HORIZON);
  scene.background = horizon;
  scene.fog = new THREE.Fog(horizon, metersToBlocks(FOG_NEAR_M), metersToBlocks(FOG_FAR_M));

  const ambient = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, 1.6);
  scene.add(ambient);

  const center = new THREE.Vector3(size.x / 2, size.y / 3, size.z / 2);
  const sun = new THREE.DirectionalLight(SUN_COLOR, 2.0);
  const reach = Math.hypot(size.x, size.z) / 2 + 32;
  sun.position.copy(center).addScaledVector(SUN_DIRECTION, reach * 2);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -reach;
  shadowCamera.right = reach;
  shadowCamera.top = reach;
  shadowCamera.bottom = -reach;
  shadowCamera.near = 1;
  shadowCamera.far = reach * 4;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const sky = createSky();
  scene.add(sky);
  const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
  const fog = scene.fog as THREE.Fog;

  return {
    scene,
    sun,
    update(camera) {
      sky.position.copy(camera.position);
    },
    setDaylight(light) {
      const srgb = (target: THREE.Color, [r, g, b]: readonly [number, number, number]) =>
        target.setRGB(r, g, b, THREE.SRGBColorSpace);
      srgb(horizon, light.horizon);
      fog.color.copy(horizon);
      srgb(uniforms.horizon!.value as THREE.Color, light.horizon);
      srgb(uniforms.zenith!.value as THREE.Color, light.zenith);
      (uniforms.sunDirection!.value as THREE.Vector3).set(...light.sun);
      (uniforms.moonDirection!.value as THREE.Vector3).set(...light.moon);
      uniforms.stars!.value = light.stars;
      srgb(ambient.color, light.ambient.sky);
      srgb(ambient.groundColor, light.ambient.ground);
      ambient.intensity = light.ambient.intensity;
      srgb(sun.color, light.light.color);
      sun.intensity = light.light.intensity;
      sun.position
        .copy(center)
        .addScaledVector(new THREE.Vector3(...light.light.towards), reach * 2);
    },
  };
}

/** Sky dome with a vertical gradient from the horizon to the zenith (RENDER-004.a). */
function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      horizon: { value: new THREE.Color(SKY_HORIZON) },
      zenith: { value: new THREE.Color(SKY_ZENITH) },
      sunDirection: { value: new THREE.Vector3(-0.66, 0.55, 0.5).normalize() },
      moonDirection: { value: new THREE.Vector3(0, -1, 0) },
      stars: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // on the far plane, behind everything
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform vec3 sunDirection;
      uniform vec3 moonDirection;
      uniform float stars;
      varying vec3 vDirection;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        vec3 d = normalize(vDirection);
        float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
        vec3 color = mix(horizon, zenith, t);
        // Stars: fixed points on the sky, only above the horizon and at night.
        vec3 cell = floor(d * 420.0);
        float star = step(0.9975, hash(cell)) * smoothstep(0.0, 0.15, d.y) * stars;
        color += vec3(star * 0.9);
        // The sun: a disc with a warm glow; the moon: a pale disc.
        float toSun = dot(d, normalize(sunDirection));
        color += vec3(1.0, 0.85, 0.6) * (smoothstep(0.9990, 0.9994, toSun) * 1.5 + pow(max(toSun, 0.0), 64.0) * 0.35);
        float toMoon = dot(d, normalize(moonDirection));
        color += vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.9996, toMoon) * 0.9;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
