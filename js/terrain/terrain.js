import { Noise2D } from '../engine/noise.js';
import { Mesh } from '../engine/mesh.js';

// Procedural heightmap terrain with biome vertex coloring.
// The same sampled heightfield drives both the render mesh and physics collision.
export class Terrain {
  constructor(seed = 20240, size = 400, samples = 201) {
    this.seed = seed;
    this.size = size;               // world spans [-size/2, size/2]
    this.n = samples;               // samples per side
    this.cell = size / (samples - 1);
    this.half = size / 2;
    this.waterLevel = 0.5;

    const noise = new Noise2D(seed);
    this.noise = noise;
    this.heights = new Float32Array(samples * samples);
    this.generate(noise);
  }

  generate(noise) {
    const n = this.n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.half + i * this.cell;
        const z = -this.half + j * this.cell;
        this.heights[j * n + i] = this.computeHeight(noise, x, z);
      }
    }
  }

  computeHeight(noise, x, z) {
    // rolling hills
    let h = noise.fbm(x * 0.006, z * 0.006, 5) * 14;
    // mountain ranges gated by a large-scale mask
    const m = noise.fbm(x * 0.0021 + 100, z * 0.0021 - 50, 3);
    const mask = smoothstep(0.05, 0.38, m);
    const mt = noise.ridged(x * 0.0035, z * 0.0035, 4);
    h += mt * mt * 55 * mask;
    h -= 6.5; // carve basins below water level
    // flatten a spawn plateau near the origin
    const dist = Math.hypot(x, z);
    const f = 1 - smoothstep(14, 45, dist);
    h = h * (1 - f) + 4.0 * f;
    return h;
  }

  // Bilinear interpolated height — the single source of truth for physics.
  heightAt(x, z) {
    const n = this.n;
    let gx = (x + this.half) / this.cell;
    let gz = (z + this.half) / this.cell;
    gx = Math.min(Math.max(gx, 0), n - 1.001);
    gz = Math.min(Math.max(gz, 0), n - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h00 = this.heights[j * n + i];
    const h10 = this.heights[j * n + i + 1];
    const h01 = this.heights[(j + 1) * n + i];
    const h11 = this.heights[(j + 1) * n + i + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  // Terrain normal from central differences.
  normalAt(x, z, out) {
    const e = this.cell * 0.5;
    const hL = this.heightAt(x - e, z), hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e), hU = this.heightAt(x, z + e);
    out = out || new Float32Array(3);
    out[0] = hL - hR; out[1] = 2 * e; out[2] = hD - hU;
    const l = Math.hypot(out[0], out[1], out[2]);
    out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  }

  buildMesh(gl) {
    const n = this.n;
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const indices = new Uint32Array((n - 1) * (n - 1) * 6);
    const tmp = new Float32Array(3);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const vi = j * n + i;
        const x = -this.half + i * this.cell;
        const z = -this.half + j * this.cell;
        const h = this.heights[vi];
        positions[vi * 3] = x;
        positions[vi * 3 + 1] = h;
        positions[vi * 3 + 2] = z;

        this.normalAt(x, z, tmp);
        normals[vi * 3] = tmp[0];
        normals[vi * 3 + 1] = tmp[1];
        normals[vi * 3 + 2] = tmp[2];

        const [r, g, b] = this.colorAt(x, z, h, tmp[1]);
        colors[vi * 3] = r;
        colors[vi * 3 + 1] = g;
        colors[vi * 3 + 2] = b;
      }
    }

    let k = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const b = a + n;
        indices[k++] = a; indices[k++] = b; indices[k++] = a + 1;
        indices[k++] = b; indices[k++] = b + 1; indices[k++] = a + 1;
      }
    }
    return new Mesh(gl, { positions, normals, colors, indices });
  }

  // Biome coloring from height + slope + noise variation.
  colorAt(x, z, h, slopeY) {
    const wl = this.waterLevel;
    const t1 = this.noise.noise(x * 0.15, z * 0.15) * 0.5 + 0.5;
    const t2 = this.noise.noise(x * 0.03 + 40, z * 0.03 - 17) * 0.5 + 0.5;
    let r, g, b;
    if (h < wl - 0.4) {
      // lake bed sand
      r = 0.55; g = 0.50; b = 0.36;
    } else if (h < wl + 0.9) {
      // beach
      r = 0.72; g = 0.65; b = 0.46;
    } else {
      // grass with two-tone variation
      const gg = 0.34 + t1 * 0.16;
      r = 0.16 + t2 * 0.08; g = gg; b = 0.10 + t1 * 0.05;
      // dry patches
      if (t2 > 0.72) { r = 0.45; g = 0.42; b = 0.20; }
    }
    // rock on steep slopes (blend; note smoothstep edges swapped: steep => low slopeY)
    const rockAmt = smoothstep(0.86, 0.72, slopeY);
    if (rockAmt > 0) {
      const rk = 0.32 + t1 * 0.10;
      r = r + (rk - r) * rockAmt;
      g = g + (rk * 0.96 - g) * rockAmt;
      b = b + (rk * 0.95 - b) * rockAmt;
    }
    // snow on high peaks
    if (h > 26) {
      const sAmt = smoothstep(26, 34, h) * (slopeY > 0.5 ? 1 : 0.3);
      r = r + (0.92 - r) * sAmt;
      g = g + (0.93 - g) * sAmt;
      b = b + (0.97 - b) * sAmt;
    }
    return [r, g, b];
  }


  // Scatter trees/rocks using noise clusters + slope/height rules.
  // Returns { trees: [{x,y,z,scale,rot,tint}], rocks: [...] }
  scatter(treeCount = 700, rockCount = 120) {
    const rng = mulberry(this.seed ^ 0x9e3779b9);
    const trees = [], rocks = [];
    const placeNoise = new Noise2D(this.seed + 555);
    let tries = 0;
    while (trees.length < treeCount && tries++ < treeCount * 12) {
      const x = (rng() * 2 - 1) * (this.half - 8);
      const z = (rng() * 2 - 1) * (this.half - 8);
      const cluster = placeNoise.fbm(x * 0.012 + 7, z * 0.012 - 3, 3);
      if (cluster < 0.08) continue;
      const h = this.heightAt(x, z);
      if (h < this.waterLevel + 1.2 || h > 24) continue;
      const n = this.normalAt(x, z);
      if (n[1] < 0.88) continue;
      const dist = Math.hypot(x, z);
      if (dist < 16) continue; // keep spawn clear
      trees.push({ x, y: h - 0.15, z, scale: 2.2 + rng() * 2.8, rot: rng() * Math.PI * 2, tint: 0.8 + rng() * 0.45 });
    }
    tries = 0;
    while (rocks.length < rockCount && tries++ < rockCount * 12) {
      const x = (rng() * 2 - 1) * (this.half - 6);
      const z = (rng() * 2 - 1) * (this.half - 6);
      const h = this.heightAt(x, z);
      if (h < this.waterLevel - 1.5) continue;
      const dist = Math.hypot(x, z);
      if (dist < 14) continue;
      rocks.push({ x, y: h + 0.05, z, scale: 0.8 + rng() * 2.4, rot: rng() * Math.PI * 2, tint: 0.85 + rng() * 0.3 });
    }
    return { trees, rocks };
  }
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

