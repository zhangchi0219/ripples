precision highp float;

const int MAX_WAVES = 32;

uniform vec4 uWaveA[MAX_WAVES]; // (originX, originY, birthTime, amplitude)
uniform vec4 uWaveB[MAX_WAVES]; // (wavelength, decay, phase, active)
uniform float uTime;
uniform float uWaveSpeed;
uniform float uFieldSize;
uniform float uPointSize;

// position attribute (xy = grid UV [0,1], z unused) provided by Three.js

varying float vH;

float envelope(float tau, float r, float c, float decay) {
    if (tau < 0.0) return 0.0;
    float wavefront = c * tau;
    float leading = smoothstep(wavefront + 0.5, wavefront - 0.5, r);
    float timeDecay = exp(-decay * tau);
    float radial = 1.0 / (1.0 + 0.5 * r);
    return leading * timeDecay * radial;
}

void main() {
    vec2 worldXY = (position.xy - 0.5) * uFieldSize;

    float totalH = 0.0;
    for (int i = 0; i < MAX_WAVES; i++) {
        vec4 a = uWaveA[i];
        vec4 b = uWaveB[i];
        if (b.w < 0.5) continue;

        vec2 origin = a.xy;
        float t0    = a.z;
        float amp   = a.w;
        float lambda = b.x;
        float decay  = b.y;
        float phase  = b.z;

        float tau = uTime - t0;
        float r   = distance(worldXY, origin);
        float k   = 6.2831853 / lambda;
        float omega = k * uWaveSpeed;

        totalH += amp * envelope(tau, r, uWaveSpeed, decay)
                * sin(k * r - omega * tau + phase);
    }

    vH = totalH;

    vec3 pos = vec3(worldXY, totalH);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uPointSize;
}
