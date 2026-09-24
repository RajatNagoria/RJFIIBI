// Gradient (Perlin-style) noise with seeded PRNG, plus fBm helpers.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Permutation table based value/gradient noise in 2D.
export class Noise2D {
  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.grad = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);
  }

  gradDot(hash, x, y) {
    const g = (hash & 7) * 2;
    return this.grad[g] * x + this.grad[g + 1] * y;
  }

  // Returns noise in [-1, 1]
  noise(x, y) {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const p = this.perm;
    const aa = p[p[xi] + yi];
    const ab = p[p[xi] + yi + 1];
    const ba = p[p[xi + 1] + yi];
    const bb = p[p[xi + 1] + yi + 1];
    const x1 = lerp(this.gradDot(aa, xf, yf), this.gradDot(ba, xf - 1, yf), u);
    const x2 = lerp(this.gradDot(ab, xf, yf - 1), this.gradDot(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 1.414; // normalize roughly to [-1,1]
  }

  // Fractal Brownian motion, returns roughly [-1, 1]
  fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // Ridged multifractal for mountains, [0, 1]
  ridged(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1.0 - Math.abs(this.noise(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
