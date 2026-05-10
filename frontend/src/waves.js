import * as THREE from 'three';

export class WaveManager {
  constructor(maxWaves = 32) {
    this.maxWaves = maxWaves;
    this.waves = new Array(maxWaves).fill(null);
    this.next = 0;

    // Pre-allocate flat arrays for uniform upload
    this.dataA = new Array(maxWaves).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0));
    this.dataB = new Array(maxWaves).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0));
  }

  spawn(x, y, time, params) {
    let slot = this.waves.findIndex(w => !w || !w.active);
    if (slot === -1) {
      slot = this.next;
      this.next = (this.next + 1) % this.maxWaves;
    }
    this.waves[slot] = {
      origin: [x, y],
      birthTime: time,
      amplitude: params.amplitude,
      wavelength: params.wavelength,
      decay: params.decay,
      phase: 0,
      active: true,
    };
  }

  uploadToUniforms(material, time) {
    const uniforms = material.uniforms;
    for (let i = 0; i < this.maxWaves; i++) {
      const w = this.waves[i];
      if (w && w.active) {
        const tau = time - w.birthTime;
        // Auto-deactivate if decayed enough
        if (tau > 0 && Math.exp(-w.decay * tau) < 0.001) {
          w.active = false;
        }
      }

      if (w && w.active) {
        this.dataA[i].set(w.origin[0], w.origin[1], w.birthTime, w.amplitude);
        this.dataB[i].set(w.wavelength, w.decay, w.phase, 1.0);
      } else {
        this.dataA[i].set(0, 0, 0, 0);
        this.dataB[i].set(1, 1, 0, 0);
      }
    }
    uniforms.uWaveA.value = this.dataA;
    uniforms.uWaveB.value = this.dataB;
  }
}
