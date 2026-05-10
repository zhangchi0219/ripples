import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createParticleSystem } from './particles.js';
import { WaveManager } from './waves.js';
import { canvasToWorld } from './picker.js';
import { createUI } from './ui.js';
import './style.css';

// --- Params ---
const params = {
  particleResolution: 200,
  fieldSize: 20,
  waveSpeed: 5,
  defaultWavelength: 3,
  defaultAmplitude: 1.5,
  defaultDecay: 0.8,
  pointSize: 4 * window.devicePixelRatio,
  colorLow: '#1a3a6a',
  colorHigh: '#44bbff',
  paused: false,
};

// --- Renderer ---
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e0e1a');

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, -12, 18);
camera.lookAt(0, 0, 0);

// --- Camera Controls ---
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = {
  LEFT: null,                        // left-click reserved for spawning waves
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 5;
controls.maxDistance = 80;
controls.target.set(0, 0, 0);

// --- Wave Manager ---
const waveManager = new WaveManager(32);

// --- Particles ---
let { points, geometry, material } = createParticleSystem(params.particleResolution, params);
scene.add(points);

function rebuildParticles() {
  scene.remove(points);
  geometry.dispose();
  material.dispose();
  ({ points, geometry, material } = createParticleSystem(params.particleResolution, params));
  scene.add(points);
}

// --- UI ---
const panelEl = document.getElementById('panel');
createUI(panelEl, params, {
  onResolutionChange: rebuildParticles,
});

// --- Mouse ---
canvas.addEventListener('pointerdown', (e) => {
  const world = canvasToWorld(e, canvas, camera);
  if (world) {
    waveManager.spawn(world.x, world.y, clock.getElapsedTime(), {
      amplitude: params.defaultAmplitude,
      wavelength: params.defaultWavelength,
      decay: params.defaultDecay,
    });
  }
});

// --- Resize ---
const canvasWrap = document.getElementById('canvas-wrap');
function resize() {
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Clock & demo wave ---
const clock = new THREE.Clock();
clock.start();
waveManager.spawn(0, 0, 0, {
  amplitude: params.defaultAmplitude,
  wavelength: params.defaultWavelength,
  decay: params.defaultDecay,
});

// --- Animate ---
function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  material.uniforms.uTime.value = params.paused ? material.uniforms.uTime.value : elapsed;
  material.uniforms.uWaveSpeed.value = params.waveSpeed;
  material.uniforms.uFieldSize.value = params.fieldSize;
  material.uniforms.uPointSize.value = params.pointSize;
  material.uniforms.uColorLow.value.set(params.colorLow);
  material.uniforms.uColorHigh.value.set(params.colorHigh);

  waveManager.uploadToUniforms(material, material.uniforms.uTime.value);

  controls.update();
  renderer.render(scene, camera);
}

animate();
