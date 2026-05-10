import * as THREE from 'three';
import vertexShader from './shaders/wave.vert';
import fragmentShader from './shaders/wave.frag';

export function createParticleSystem(resolution, params) {
  const count = resolution * resolution;
  const positions = new Float32Array(count * 3);

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = (j * resolution + i) * 3;
      positions[idx]     = i / (resolution - 1);  // u
      positions[idx + 1] = j / (resolution - 1);  // v
      positions[idx + 2] = 0;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const MAX_WAVES = 32;
  const waveA = Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, 0, 0));
  const waveB = Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(1, 1, 0, 0));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uWaveA:     { value: waveA },
      uWaveB:     { value: waveB },
      uTime:      { value: 0 },
      uWaveSpeed: { value: params.waveSpeed },
      uFieldSize: { value: params.fieldSize },
      uPointSize: { value: params.pointSize },
      uColorLow:  { value: new THREE.Color(params.colorLow) },
      uColorHigh: { value: new THREE.Color(params.colorHigh) },
    },
    transparent: false,
    depthWrite: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;  // no position attribute, skip bounding sphere check
  return { points, geometry, material };
}
