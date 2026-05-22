# CLAUDE.md

Guidance for AI assistants working in this repository.

---

## Project Overview

**Ripples** (internal name: `wave-interference`) is a browser-based interactive particle simulation. A 200×200 grid of GPU particles forms a "water surface"; clicking the canvas spawns circular ripples that expand outward and interfere with each other via linear superposition.

**Tech stack**: Three.js r170 · GLSL (WebGL2) · Vite 6 · Tweakpane 4 · Docker Compose

---

## Repository Layout

```
ripples/
├── frontend/
│   ├── index.html           Shell HTML: #app > #canvas-wrap > canvas, #panel
│   ├── package.json         name: wave-interference, type: module
│   ├── vite.config.js       glsl plugin
│   ├── Dockerfile           node:22-slim, runs `npm run dev -- --host 0.0.0.0`
│   └── src/
│       ├── main.js          Entry: renderer, camera, OrbitControls, main loop, resize, mouse
│       ├── particles.js     createParticleSystem() — BufferGeometry + ShaderMaterial
│       ├── waves.js         WaveManager class — ring buffer + uniform upload
│       ├── picker.js        canvasToWorld() — pointer → z=0 world plane via Raycaster
│       ├── ui.js            createUI() — Tweakpane panel wired to params object
│       ├── style.css        Two-column flex layout (canvas-wrap | panel)
│       └── shaders/
│           ├── wave.vert    Particle displacement + height → vH
│           └── wave.frag    Color mapping + circular point-sprite clipping
└── docker-compose.yml       frontend :5173
```

---

## Architecture: Analytic Superposition (not PDE simulation)

Each wave is a pure math function. Every frame, for every particle, all active waves are summed in the vertex shader on the GPU. No ping-pong textures, no simulation passes.

Wave contribution formula:
```
hᵢ(x,y,t) = Aᵢ · envelope(τ, r) · sin(k·r − ω·τ + φᵢ)

  τ = t − t₀ᵢ           elapsed since wave birth
  r = |(x,y) − originᵢ| particle distance from wave origin
  k = 2π / λ             wavenumber
  ω = k · c              angular frequency (c = wave speed)
```

Total height: `h = Σ hᵢ` — linear superposition gives interference for free.

**Envelope function** (prevents infinite undamped oscillation):
```glsl
float envelope(float tau, float r, float c, float decay) {
    if (tau < 0.0) return 0.0;
    float wavefront = c * tau;
    float leading   = smoothstep(wavefront + 0.5, wavefront - 0.5, r);
    float timeDecay = exp(-decay * tau);
    float radial    = 1.0 / (1.0 + 0.5 * r);
    return leading * timeDecay * radial;
}
```

---

## Key Implementation Details

### Particle Geometry (`particles.js`)

- `THREE.BufferGeometry` + `THREE.Points` (not InstancedMesh)
- Attribute name: `position` (Three.js built-in), xy = grid UV in [0,1], z = 0
- World coordinates computed in vertex shader: `worldXY = (position.xy - 0.5) * uFieldSize`
- Rebuilding particle resolution only requires recreating the attribute array — shaders unchanged
- `points.frustumCulled = false` because position attribute holds UV coords, not world coords

### Wave Uniform Layout (`waves.js` + `wave.vert`)

Two parallel `vec4` arrays, `MAX_WAVES = 32` slots:
```glsl
uniform vec4 uWaveA[MAX_WAVES];  // (originX, originY, birthTime, amplitude)
uniform vec4 uWaveB[MAX_WAVES];  // (wavelength, decay, phase, active)
```

`active` is 0.0 or 1.0. In the vertex shader, `if (b.w < 0.5) continue` skips inactive waves (the branch doesn't skip GPU lanes but the envelope returns 0, so contribution is zero).

WebGL2 permits constant loop bounds, so `for (int i = 0; i < MAX_WAVES; i++)` compiles.

### WaveManager Ring Buffer (`waves.js`)

- 32 slots, prefers empty/inactive slots; falls back to ring-buffer eviction
- Auto-deactivates waves when `exp(-decay * tau) < 0.001`
- `dataA` / `dataB` are pre-allocated `THREE.Vector4` arrays reused every frame (no GC pressure)
- A demo wave is spawned at origin on startup (clock t=0)

### Mouse Picking (`picker.js`)

Module-level singletons: `THREE.Plane(z=1, 0)`, `Raycaster`, `Vector2`, `Vector3`. `canvasToWorld(event, canvas, camera)` converts pointer coordinates to the z=0 world plane intersection. Returns `null` if the ray is parallel to the plane.

### Camera & Controls (`main.js`)

- PerspectiveCamera at `(0, -12, 18)` looking at origin — slight forward tilt for visible depth
- OrbitControls wired with **left-click disabled** (reserved for wave spawning), middle = dolly, right = rotate
- Pan disabled; distance clamped [5, 80]; damping factor 0.1

### Fragment Shader (`wave.frag`)

```glsl
float t = clamp(vH * 0.5 + 0.5, 0.0, 1.0);  // map [-1,1] → [0,1]
vec3 col = mix(uColorLow, uColorHigh, t);
vec2 c = gl_PointCoord - 0.5;
if (dot(c, c) > 0.25) discard;               // circular point sprites
```

---

## Params Object (shared across modules)

Defined in `main.js`, passed to `createParticleSystem` and `createUI`:

| Key | Default | Range | Notes |
|-----|---------|-------|-------|
| `particleResolution` | 200 | 32–512 | Triggers `rebuildParticles()` on change |
| `fieldSize` | 20 | 5–50 | World units, uploaded as uniform each frame |
| `waveSpeed` | 5 | 0.5–20 | `c` in wave formula |
| `defaultWavelength` | 3 | 0.5–10 | `λ` for newly spawned waves |
| `defaultAmplitude` | 1.5 | 0.1–5 | Peak height for new waves |
| `defaultDecay` | 0.8 | 0.1–5 | Exponential decay rate |
| `pointSize` | `4 * devicePixelRatio` | 1–10 | Uploaded as uniform each frame |
| `colorLow` | `'#1a3a6a'` | — | Wave trough color |
| `colorHigh` | `'#44bbff'` | — | Wave crest color |
| `paused` | `false` | — | Freezes `uTime`; time resumes from frozen value |

---

## Development Workflow

### Local

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Docker

```bash
docker compose up -d --build    # start frontend container
docker compose logs -f          # follow logs
docker compose down             # stop
```

### Build / Deploy

```bash
cd frontend
npm run build    # outputs to frontend/dist/
npm run preview  # preview the production build locally
```

`frontend/dist/` is a self-contained static site — serve it with any static host (nginx, GitHub Pages, Netlify, etc.).

Vite uses `vite-plugin-glsl` to import `.vert` / `.frag` files directly as strings.

---

## Conventions

- **No TypeScript** — plain ES modules throughout
- **No bundler abstractions** — direct named exports (`createParticleSystem`, `WaveManager`, `canvasToWorld`, `createUI`)
- **Shader imports** — use `import shader from './shaders/foo.vert'` (vite-plugin-glsl resolves to string)
- **Uniform upload** — all uniforms set in the animation loop in `main.js`; `WaveManager.uploadToUniforms()` is called every frame
- **No `aGridUv` attribute** — the vertex shader reads the built-in `position` attribute (xy = UV, z = 0); the design doc's `aGridUv` name was never implemented
- **Color strings** — params stores hex strings (`'#rrggbb'`); `THREE.Color.set()` accepts them directly
- **Memory** — `dataA`/`dataB` in WaveManager are pre-allocated; `rebuildParticles()` calls `.dispose()` on old geometry and material before replacing

---

## What Is Intentionally Not Implemented

- PDE / GPGPU ping-pong simulation (no `position.frag` / `velocity.frag`)
- Boundary reflections
- Dispersion (all waves share one speed `c`)
- 3D orbit camera (OrbitControls is present but left-click is blocked; right-drag rotates)
- Backend / server-side logic (pure client-side app)
- Audio reactivity or video input

---

## Upgrade Path Notes

1. **>32 simultaneous waves** — replace uniform arrays with a data texture; read in shader via `texelFetch`
2. **Reflections / obstacles** — switch to PDE finite-difference simulation with ping-pong height textures
3. **Particle advection** — compute `∂h/∂x`, `∂h/∂y` in vertex shader to drift particles along wave gradient
4. **Audio-driven waves** — pipe `AnalyserNode` data into amplitude uniform; spawn waves on beats
