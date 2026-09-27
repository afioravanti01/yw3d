import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyWind } from './wind';

describe('the wind', () => {
  it('RENDER-009.a: the terrain shader moves the vertices with the sway attribute, over time', () => {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const wind = applyWind(material);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain('attribute float sway;');
    expect(shader.vertexShader).toMatch(/transformed\.x \+= sway \*/);
    wind.update(12.5);
    expect(shader.uniforms.windTime!.value).toBe(12.5);
  });
});
