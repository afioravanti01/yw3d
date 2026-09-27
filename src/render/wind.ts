import type * as THREE from 'three';

/** How far the leaves move at most, in blocks (RENDER-009.a, plan F09 P9). */
export const WIND_AMPLITUDE = 0.07;

/**
 * Two waves over time and space, and a strength that changes slowly (plan F09 P9): the vertices
 * with the `sway` attribute (leaves) move sideways, the others stay. Vertices in the same place
 * move together, so the leaves never open gaps between them.
 */
const WIND_GLSL = /* glsl */ `
  vec3 windAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float windStrength = ${WIND_AMPLITUDE.toFixed(3)} * (0.6 + 0.4 * sin(windTime * 0.13 + 1.7));
  transformed.x += sway * windStrength * (
    sin(windTime * 1.7 + windAt.x * 0.35 + windAt.y * 0.2) +
    0.5 * sin(windTime * 2.9 + windAt.z * 0.5));
  transformed.z += sway * windStrength * (
    sin(windTime * 1.3 + windAt.z * 0.3 + windAt.y * 0.25) +
    0.5 * sin(windTime * 3.3 + windAt.x * 0.45));
`;

export interface Wind {
  /** Moves the wind to `seconds` of real time. */
  update(seconds: number): void;
}

/** Adds the wind to a material of the terrain (RENDER-009.a). */
export function applyWind(material: THREE.Material): Wind {
  const windTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float sway;\nuniform float windTime;',
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_GLSL}`);
  };
  return {
    update(seconds) {
      windTime.value = seconds;
    },
  };
}
