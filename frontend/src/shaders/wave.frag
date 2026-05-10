precision highp float;

uniform vec3 uColorLow;
uniform vec3 uColorHigh;

varying float vH;

void main() {
    float t = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uColorLow, uColorHigh, t);

    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;

    gl_FragColor = vec4(col, 1.0);
}
