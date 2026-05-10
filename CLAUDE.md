# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ripples — a new project. No code has been added yet. Update this file as the project develops.
# Wave Interference Particle Field

一个基于 three.js + 原生 GLSL 的 web app：粒子组成的二维水面，鼠标点击在水面上投下波纹，多个波纹之间产生真实的线性干涉。

---

## 项目目标

- 一个 N×N 的粒子网格作为「水面」（默认 256×256 = 65536 个粒子）。
- 鼠标点击 canvas 任意位置生成一个新的圆形波纹，从点击处向外扩散。
- 同时最多 32 个活跃波纹，自动衰减消失，按环形缓冲覆盖。
- 多个波纹的位移**线性叠加**，自动产生干涉条纹（相长 / 相消）。
- 粒子用高度上色，呈现波峰波谷的可视化。
- 右侧 tweakpane 面板控制：粒子密度、波速、波长、振幅、衰减、最大波数。

---

## 技术选型与原理

### 路线：解析叠加法（不是 PDE 模拟）

每个波是一个数学函数，不模拟波动方程。这一帧，对每个粒子，遍历所有活跃波，把它们的贡献相加。

第 i 个波在位置 (x,y) 时刻 t 的贡献是：

```
hᵢ(x,y,t) = Aᵢ · envelope(τ, r) · sin(k·r − ω·τ + φᵢ)

其中:
  τ = t − t₀ᵢ           // 自波诞生以来的时间
  r = |(x,y) − originᵢ| // 粒子到波原点的距离
  k = 2π / λ            // 波数 (wavenumber)，λ 是波长
  ω = 2π · f            // 角频率, f 是频率
  c = ω / k             // 波相速度
```

总位移就是 `h(x,y,t) = Σᵢ hᵢ`。这就是物理上的线性叠加原理——干涉是免费的。

### 包络函数（envelope）

为什么需要包络？纯 sin 是无限大无衰减的，那粒子永远在抖。包络让波有「生命周期」和「波前」：

```glsl
float envelope(float tau, float r, float c, float decay) {
    if (tau < 0.0) return 0.0;
    float wavefront = c * tau;             // 波前到达的距离
    float leading   = smoothstep(wavefront + 0.5, wavefront - 0.5, r);
    // r > wavefront 时是 0, 即「波还没到这里」
    float timeDecay = exp(-decay * tau);   // 时间上指数衰减
    float radial    = 1.0 / (1.0 + 0.5 * r); // 距离上 1/r 衰减（二维传播）
    return leading * timeDecay * radial;
}
```

### 为什么不用 GPGPU ping-pong

传统 GPGPU 流体/波模拟用两张纹理交替读写来推进 PDE。我们不需要：
- 粒子位置是**静态网格**，不动，只有 z 在 vertex shader 里被实时算出来。
- 波的状态很小（几十个 vec4），用 **uniform 数组**直接传，不需要纹理。
- 没有数值耗散问题，波形是数学纯净的。
- shader 里只有一个 vertex + fragment，没有 simulation pass。

如果以后想加反射、障碍物、连续介质效应，再切到 PDE 路线，那时候 ping-pong 才用得上。

### 名词速查

- **GLSL**: OpenGL Shading Language，写在 GPU 上跑的 C 风格小语言。
- **Vertex shader**: 对每个顶点（这里是每个粒子）跑一次，决定它在屏幕上的位置。
- **Fragment shader**: 对每个像素跑一次，决定它的颜色。
- **Uniform**: CPU 给 GPU 的「全局变量」，每帧设一次，所有顶点/像素读到同一个值。可以是数组。
- **Attribute**: 每个顶点不同的输入数据（这里是粒子的网格坐标 uv）。
- **Varying**: 从 vertex shader 传给 fragment shader 的插值变量。
- **NDC** (Normalized Device Coordinates): 屏幕坐标系，x 和 y 都在 [-1, 1]。鼠标 pixel 坐标要先转成 NDC 才能反投影到 3D 世界。

---

## 项目结构

```
wave-interference/
├── backend/
│   ├── main.py              FastAPI, 只用来 serve 静态文件 + 上传(可选)
│   └── requirements.txt
└── frontend/
    ├── package.json
    ├── vite.config.js       配置 /api 代理到 :8000
    ├── index.html
    └── src/
        ├── main.js          renderer + scene + 主循环 + 鼠标监听
        ├── particles.js     创建静态网格几何体 + ShaderMaterial
        ├── waves.js         WaveManager: 环形缓冲 + uniform 上传
        ├── picker.js        鼠标 pixel → NDC → 世界坐标 (z=0 平面)
        ├── ui.js            tweakpane 控制面板
        ├── style.css        Ableton 风两栏布局
        └── shaders/
            ├── wave.vert    粒子位移 + 颜色高度计算
            └── wave.frag    点精灵着色
```

注意：scaffold 默认会生成 `position.frag` / `velocity.frag`（GPGPU 用），本项目**不需要**，可以删掉。

---

## 关键实现细节

### 粒子几何体

用 `THREE.BufferGeometry` + `THREE.Points`，不是 `InstancedMesh`。每个粒子的 attribute 只有一个 `vec2 aGridUv`，范围 [0,1]×[0,1]。世界坐标在 vertex shader 里算出来：

```glsl
vec2 worldXY = (aGridUv - 0.5) * uFieldSize;
```

改粒子密度只要重建几何体的 attribute 数组，shader 不用动。

### 波列表的 uniform 布局

每个波需要：origin(x,y), birthTime, amplitude, wavelength, decay, phase, active。一个 vec4 装不下，用两个并行数组：

```glsl
const int MAX_WAVES = 32;
uniform vec4 uWaveA[MAX_WAVES];  // (originX, originY, birthTime, amplitude)
uniform vec4 uWaveB[MAX_WAVES];  // (wavelength, decay, phase, active)
uniform float uTime;
uniform float uWaveSpeed;
```

`active` 是 0 或 1。波衰减到几乎为 0 时 JS 端把 active 设为 0，新的点击就可以覆盖它。

### WaveManager (waves.js)

```js
class WaveManager {
  constructor(maxWaves = 32) {
    this.maxWaves = maxWaves;
    this.waves = new Array(maxWaves).fill(null);
    this.next = 0;  // 环形缓冲指针
  }

  spawn(x, y, time, params) {
    let slot = this.waves.findIndex(w => !w || !w.active);
    if (slot === -1) {
      slot = this.next;
      this.next = (this.next + 1) % this.maxWaves;
    }
    this.waves[slot] = { origin: [x, y], birthTime: time, ...params, active: true };
  }

  uploadToUniforms(material, time) {
    // 把 32 个槽位 flatten 成两个 vec4 数组传给 shader
    // 顺便把寿命到的标记 active = false
  }
}
```

### 鼠标 → 世界坐标

`picker.js` 用 three.js 的 `Raycaster`：建一个虚拟的 z=0 平面 `new THREE.Plane(new THREE.Vector3(0,0,1), 0)`，把鼠标 NDC 转成 ray，求射线和平面的交点。这就是水面上被点击的位置。

### Vertex shader 主循环

```glsl
float totalH = 0.0;
for (int i = 0; i < MAX_WAVES; i++) {
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    if (b.w < 0.5) continue;          // active 检查

    vec2 origin = a.xy;
    float t0    = a.z;
    float amp   = a.w;
    float lambda= b.x;
    float decay = b.y;
    float phase = b.z;

    float tau = uTime - t0;
    float r   = distance(worldXY, origin);
    float k   = 6.2831853 / lambda;
    float omega = k * uWaveSpeed;

    totalH += amp * envelope(tau, r, uWaveSpeed, decay)
            * sin(k * r - omega * tau + phase);
}
```

WebGL2 允许循环上界是常量（`MAX_WAVES`），所以这个写法能编译。`continue` 在 GPU 上不会真的跳过——所有 lane 还是会算——但 `b.w < 0.5` 时 envelope 是 0，等价于贡献为 0。

### Tweakpane 控制项

- `particleResolution` (32~512, 改了重建几何体)
- `fieldSize` (世界单位边长)
- `waveSpeed` (c)
- `defaultWavelength` (新生波的 λ)
- `defaultAmplitude`
- `defaultDecay`
- `pointSize`
- `colorLow` / `colorHigh` (高度的两端颜色)
- `paused` (boolean, 暂停时间推进)

### 颜色映射 (fragment shader)

```glsl
float t = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
vec3 col = mix(uColorLow, uColorHigh, t);
// 圆形点精灵：丢弃离中心 > 0.5 的像素
vec2 c = gl_PointCoord - 0.5;
if (dot(c, c) > 0.25) discard;
gl_FragColor = vec4(col, 1.0);
```

---

## 运行方式

```bash
# Terminal 1
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 ，点 canvas 任意位置生成波纹。

### Docker Compose 运行

```bash
# 构建并启动所有服务（后台运行）
docker compose up -d --build

# 查看服务状态
docker compose ps

# 查看日志（实时跟踪）
docker compose logs -f

# 只看某个服务的日志
docker compose logs -f backend
docker compose logs -f frontend

# 停止所有服务
docker compose down

# 重新构建某个服务
docker compose build frontend
docker compose up -d frontend
```

启动后：
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

注意：frontend 构建产物挂载到 backend 容器（`frontend/dist` → `/app/frontend/dist`，只读）。如果 frontend 有改动，需要先重新构建 frontend 再重启 backend。

---

## 不做的事

- 不模拟波动方程 PDE。需要的时候再切 GPGPU。
- 不做 3D 相机轨道。固定俯视角或者轻微倾斜，减少视觉噪声让干涉条纹清晰。
- 不做边界反射。波传到水面边缘自然衰减消失。
- 不做色散（不同频率不同速度）。所有波同一个 c。
- 没有音频反应、没有视频输入、没有上传——backend 留着备用，目前只 serve 静态文件。

---

## 升级路径备忘

1. **加反射 / 障碍**：切到 PDE 路线，需要 ping-pong 两张 height texture，每帧推进波动方程的有限差分。这时 `position.frag` / `velocity.frag` 就用上了。
2. **粒子也参与流动**：让粒子在 xy 平面也被波的梯度推动，做出「漂浮物」感。需要在 vertex shader 里数值算 ∂h/∂x 和 ∂h/∂y。
3. **超过 32 个波**：把 uniform 数组换成 data texture，shader 里 texelFetch 读取。理论上几千个波都行。
4. **音频驱动**：用 Web Audio AnalyserNode，让低频能量转成 amplitude 上传成 uniform，鼓点自动 spawn 波纹。