// All GLSL source for the engine. WebGL2 / GLSL ES 3.00.

const COMMON_FS = /* glsl */`
  uniform vec3 uSunDir;      // direction TOWARD the sun
  uniform vec3 uSunColor;
  uniform vec3 uCamPos;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform sampler2D uShadowMap;
  uniform float uShadowTexel;
  uniform float uShadowStrength;

  float sampleShadow(vec4 sc, float ndl) {
    vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
    float bias = max(0.0022 * (1.0 - ndl), 0.0007);
    float sum = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        float d = texture(uShadowMap, p.xy + vec2(x, y) * uShadowTexel).r;
        sum += (p.z - bias <= d) ? 1.0 : 0.0;
      }
    }
    float lit = sum / 9.0;
    return mix(1.0, lit, uShadowStrength);
  }

  vec3 applyLighting(vec3 albedo, vec3 N, vec3 worldPos, vec4 sc, float specAmt, float shininess) {
    float ndl = max(dot(N, uSunDir), 0.0);
    float shadow = sampleShadow(sc, ndl);
    vec3 amb = mix(vec3(0.22, 0.20, 0.17), vec3(0.38, 0.44, 0.52), N.y * 0.5 + 0.5);
    vec3 col = albedo * (amb + uSunColor * ndl * shadow);
    if (specAmt > 0.0) {
      vec3 V = normalize(uCamPos - worldPos);
      vec3 H = normalize(V + uSunDir);
      float spec = pow(max(dot(N, H), 0.0), shininess) * specAmt * shadow;
      col += uSunColor * spec;
    }
    // exponential fog
    float dist = distance(uCamPos, worldPos);
    float fog = 1.0 - exp(-dist * uFogDensity);
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
    // gamma correction
    return pow(col, vec3(1.0 / 2.2));
  }
`;

export const LIT_VS = /* glsl */`#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec3 aColor;
  uniform mat4 uViewProj;
  uniform mat4 uModel;
  uniform mat4 uLightVP;
  out vec3 vNormal;
  out vec3 vWorldPos;
  out vec3 vColor;
  out vec4 vShadowCoord;
  void main() {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vWorldPos = wp.xyz;
    vNormal = mat3(uModel) * aNormal;
    vColor = aColor;
    vShadowCoord = uLightVP * wp;
    gl_Position = uViewProj * wp;
  }
`;

export const LIT_FS = /* glsl */`#version 300 es
  precision highp float;
  in vec3 vNormal;
  in vec3 vWorldPos;
  in vec3 vColor;
  in vec4 vShadowCoord;
  out vec4 fragColor;
  ${COMMON_FS}
  void main() {
    vec3 N = normalize(vNormal);
    vec3 col = applyLighting(vColor, N, vWorldPos, vShadowCoord, 0.0, 1.0);
    fragColor = vec4(col, 1.0);
  }
`;

// Instanced: model matrix from attributes 3-6, color 7, params 8 (x: tintStrength)
export const INST_VS = /* glsl */`#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec3 aColor;   // defaults to white when mesh has no colors
  layout(location=3) in vec4 iM0;
  layout(location=4) in vec4 iM1;
  layout(location=5) in vec4 iM2;
  layout(location=6) in vec4 iM3;
  layout(location=7) in vec3 iColor;
  layout(location=8) in vec3 iParams;
  uniform mat4 uViewProj;
  uniform mat4 uLightVP;
  out vec3 vNormal;
  out vec3 vWorldPos;
  out vec3 vColor;
  out vec4 vShadowCoord;
  out float vSpec;
  void main() {
    mat4 m = mat4(iM0, iM1, iM2, iM3);
    vec4 wp = m * vec4(aPos, 1.0);
    vWorldPos = wp.xyz;
    vNormal = mat3(m) * aNormal;
    vColor = aColor * iColor;
    vShadowCoord = uLightVP * wp;
    vSpec = iParams.y;   // specular amount
    gl_Position = uViewProj * wp;
  }
`;

export const INST_FS = /* glsl */`#version 300 es
  precision highp float;
  in vec3 vNormal;
  in vec3 vWorldPos;
  in vec3 vColor;
  in vec4 vShadowCoord;
  in float vSpec;
  out vec4 fragColor;
  ${COMMON_FS}
  void main() {
    vec3 N = normalize(vNormal);
    vec3 col = applyLighting(vColor, N, vWorldPos, vShadowCoord, vSpec, 42.0);
    fragColor = vec4(col, 1.0);
  }
`;

export const DEPTH_VS = /* glsl */`#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uLightVP;
  uniform mat4 uModel;
  void main() {
    gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
  }
`;

export const DEPTH_INST_VS = /* glsl */`#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=3) in vec4 iM0;
  layout(location=4) in vec4 iM1;
  layout(location=5) in vec4 iM2;
  layout(location=6) in vec4 iM3;
  uniform mat4 uLightVP;
  void main() {
    mat4 m = mat4(iM0, iM1, iM2, iM3);
    gl_Position = uLightVP * m * vec4(aPos, 1.0);
  }
`;

export const DEPTH_FS = /* glsl */`#version 300 es
  precision mediump float;
  void main() {}
`;

// ---------------------------------------------------------------------------
// Sky: fullscreen triangle, procedural gradient + sun + animated fbm clouds.
// ---------------------------------------------------------------------------
export const SKY_VS = /* glsl */`#version 300 es
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }
`;

export const SKY_FS = /* glsl */`#version 300 es
  precision highp float;
  uniform mat4 uInvViewProj;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec2 uResolution;
  out vec4 fragColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
    vec4 farPt = uInvViewProj * vec4(ndc, 1.0, 1.0);
    vec3 ray = normalize(farPt.xyz / farPt.w);

    // gradient: horizon -> zenith
    float h = clamp(ray.y, -1.0, 1.0);
    vec3 zenith = vec3(0.16, 0.36, 0.72);
    vec3 horizon = vec3(0.72, 0.82, 0.92);
    vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6));
    // below-horizon haze
    col = mix(col, vec3(0.55, 0.62, 0.70), clamp(-h * 6.0, 0.0, 1.0));

    // sun disc + glow
    float sunAmt = max(dot(ray, uSunDir), 0.0);
    col += vec3(1.0, 0.9, 0.7) * pow(sunAmt, 800.0) * 8.0;   // disc
    col += vec3(1.0, 0.85, 0.6) * pow(sunAmt, 24.0) * 0.35;  // glow
    col += vec3(0.9, 0.7, 0.5) * pow(sunAmt, 4.0) * 0.12;    // wide halo

    // clouds projected on a virtual plane
    if (ray.y > 0.015) {
      vec2 cuv = ray.xz / (ray.y + 0.08) * 1.6 + vec2(uTime * 0.008, uTime * 0.003);
      float c = fbm(cuv);
      float cover = smoothstep(0.48, 0.72, c);
      float shade = 1.0 - 0.35 * smoothstep(0.5, 0.9, c);
      float fade = smoothstep(0.015, 0.12, ray.y); // fade at horizon
      col = mix(col, vec3(0.98, 0.98, 1.0) * shade, cover * 0.75 * fade);
    }

    fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Water: grid mesh displaced by analytic waves, fresnel + sun glint.
// ---------------------------------------------------------------------------
export const WATER_VS = /* glsl */`#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uViewProj;
  uniform float uTime;
  uniform float uWaterLevel;
  out vec3 vWorldPos;
  out vec3 vNormal;

  // sum of a few gerstner-like sine waves; analytic normals
  void wave(vec2 p, vec2 dir, float freq, float amp, float speed,
            inout float y, inout vec2 grad) {
    float ph = dot(p, dir) * freq + uTime * speed;
    y += amp * sin(ph);
    grad += dir * (amp * freq * cos(ph));
  }

  void main() {
    vec3 wp = vec3(aPos.x, uWaterLevel, aPos.z);
    float y = 0.0;
    vec2 grad = vec2(0.0);
    wave(wp.xz, normalize(vec2(1.0, 0.3)), 0.35, 0.14, 1.1, y, grad);
    wave(wp.xz, normalize(vec2(-0.7, 1.0)), 0.55, 0.09, 1.6, y, grad);
    wave(wp.xz, normalize(vec2(0.3, -1.0)), 1.10, 0.045, 2.3, y, grad);
    wp.y += y;
    vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
    vWorldPos = wp;
    gl_Position = uViewProj * vec4(wp, 1.0);
  }
`;

export const WATER_FS = /* glsl */`#version 300 es
  precision highp float;
  in vec3 vWorldPos;
  in vec3 vNormal;
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  out vec4 fragColor;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    fresnel = mix(0.04, 1.0, fresnel);

    vec3 deep = vec3(0.03, 0.15, 0.22);
    vec3 shallow = vec3(0.10, 0.32, 0.38);
    vec3 waterCol = mix(deep, shallow, clamp(N.y * 0.5, 0.0, 1.0));
    vec3 skyRef = mix(vec3(0.55, 0.68, 0.82), vec3(0.2, 0.4, 0.75), clamp(V.y, 0.0, 1.0));
    vec3 col = mix(waterCol, skyRef, fresnel * 0.85);

    // sun glint
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    col += uSunColor * spec * 1.6;

    float dist = distance(uCamPos, vWorldPos);
    float fog = 1.0 - exp(-dist * uFogDensity);
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
    fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 0.82);
  }
`;

