import * as vec3 from '../math/vec3.js';
import * as quat from '../math/quat.js';
import { SHAPE_SPHERE, SHAPE_BOX } from './body.js';

// Contact convention: normal points from a -> b.
// Solver pushes a along -n, b along +n. For terrain contacts a === null.

export function makeContact(a, b, point, normal, penetration) {
  return {
    a, b,
    point: [point[0], point[1], point[2]],
    normal: [normal[0], normal[1], normal[2]],
    penetration,
    impulseN: 0,
    impulseT1: 0,
    impulseT2: 0,
  };
}

export function collide(a, b, out) {
  if (a.shape === SHAPE_SPHERE && b.shape === SHAPE_SPHERE) {
    return sphereSphere(a, b, out);
  } else if (a.shape === SHAPE_SPHERE && b.shape === SHAPE_BOX) {
    return sphereBox(a, b, out);
  } else if (a.shape === SHAPE_BOX && b.shape === SHAPE_SPHERE) {
    return sphereBox(b, a, out);
  } else {
    return boxBox(a, b, out);
  }
}

function sphereSphere(a, b, out) {
  const d = [b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]];
  const dist = Math.hypot(d[0], d[1], d[2]);
  const rSum = a.radius + b.radius;
  if (dist >= rSum) return 0;
  const n = dist > 1e-6 ? [d[0] / dist, d[1] / dist, d[2] / dist] : [0, 1, 0];
  const pen = rSum - dist;
  const point = [
    a.position[0] + n[0] * (a.radius - pen * 0.5),
    a.position[1] + n[1] * (a.radius - pen * 0.5),
    a.position[2] + n[2] * (a.radius - pen * 0.5),
  ];
  out.push(makeContact(a, b, point, n, pen));
  return 1;
}

const _tmpQ = quat.create();
const _local = vec3.create();

function sphereBox(sphere, box, out) {
  // sphere center in box local space
  quat.conjugate(_tmpQ, box.orientation);
  vec3.sub(_local, sphere.position, box.position);
  vec3.transformQuat(_local, _local, _tmpQ);

  const he = box.halfExtents;
  const cx = clamp(_local[0], -he[0], he[0]);
  const cy = clamp(_local[1], -he[1], he[1]);
  const cz = clamp(_local[2], -he[2], he[2]);

  let nx, ny, nz, pen;
  const dx = _local[0] - cx, dy = _local[1] - cy, dz = _local[2] - cz;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > 1e-9) {
    // center outside the box
    const dist = Math.sqrt(distSq);
    if (dist >= sphere.radius) return 0;
    nx = dx / dist; ny = dy / dist; nz = dz / dist; // local, box->sphere
    pen = sphere.radius - dist;
  } else {
    // center inside: push along least-penetration face
    const px = he[0] - Math.abs(_local[0]);
    const py = he[1] - Math.abs(_local[1]);
    const pz = he[2] - Math.abs(_local[2]);
    if (px < py && px < pz) {
      nx = Math.sign(_local[0]) || 1; ny = 0; nz = 0; pen = sphere.radius + px;
    } else if (py < pz) {
      nx = 0; ny = Math.sign(_local[1]) || 1; nz = 0; pen = sphere.radius + py;
    } else {
      nx = 0; ny = 0; nz = Math.sign(_local[2]) || 1; pen = sphere.radius + pz;
    }
  }

  // world-space normal (box -> sphere), contact point on box surface
  const nLocal = vec3.create(nx, ny, nz);
  const nWorld = vec3.create();
  vec3.transformQuat(nWorld, nLocal, box.orientation);
  const pLocal = vec3.create(cx, cy, cz);
  const pWorld = vec3.create();
  vec3.transformQuat(pWorld, pLocal, box.orientation);
  vec3.add(pWorld, pWorld, box.position);

  // contact normal must go a(sphere) -> b(box): negate
  vec3.negate(nWorld, nWorld);
  out.push(makeContact(sphere, box, pWorld, nWorld, pen));
  return 1;
}

// ---- OBB vs OBB via Separating Axis Theorem (15 axes) ----

const _axesA = [vec3.create(), vec3.create(), vec3.create()];
const _axesB = [vec3.create(), vec3.create(), vec3.create()];
const _d = vec3.create();
const _L = vec3.create();

function extractAxes(body, axes) {
  const m = body._rotM;
  vec3.set(axes[0], m[0], m[1], m[2]);
  vec3.set(axes[1], m[4], m[5], m[6]);
  vec3.set(axes[2], m[8], m[9], m[10]);
}

function projectRadius(he, axes, L) {
  return he[0] * Math.abs(vec3.dot(axes[0], L))
       + he[1] * Math.abs(vec3.dot(axes[1], L))
       + he[2] * Math.abs(vec3.dot(axes[2], L));
}

function boxBox(a, b, out) {
  extractAxes(a, _axesA);
  extractAxes(b, _axesB);
  vec3.sub(_d, b.position, a.position);

  let minOverlap = Infinity;
  let bestAxis = null;

  const testAxis = (L) => {
    const len = vec3.length(L);
    if (len < 1e-5) return true; // near-parallel cross product, skip
    vec3.scale(L, L, 1 / len);
    const rA = projectRadius(a.halfExtents, _axesA, L);
    const rB = projectRadius(b.halfExtents, _axesB, L);
    const dist = Math.abs(vec3.dot(_d, L));
    const overlap = rA + rB - dist;
    if (overlap < 0) return false; // separating axis found
    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxis = [L[0], L[1], L[2]];
    }
    return true;
  };

  for (let i = 0; i < 3; i++) {
    if (!testAxis(_axesA[i])) return 0;
    if (!testAxis(_axesB[i])) return 0;
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      vec3.cross(_L, _axesA[i], _axesB[j]);
      if (!testAxis(_L)) return 0;
    }
  }

  // orient normal a -> b
  let n = bestAxis;
  if (vec3.dot(n, _d) < 0) n = [-n[0], -n[1], -n[2]];

  // contact point: midpoint between support points along the normal
  const sA = supportPoint(a, n);
  const nNeg = [-n[0], -n[1], -n[2]];
  const sB = supportPoint(b, nNeg);
  const point = [(sA[0] + sB[0]) / 2, (sA[1] + sB[1]) / 2, (sA[2] + sB[2]) / 2];

  out.push(makeContact(a, b, point, n, minOverlap));
  return 1;
}

const _supportAxes = [vec3.create(), vec3.create(), vec3.create()];

function supportPoint(body, dir) {
  extractAxes(body, _supportAxes);
  const he = body.halfExtents;
  const out = vec3.create();
  vec3.copy(out, body.position);
  for (let i = 0; i < 3; i++) {
    const axes = _supportAxes;
    const s = Math.sign(vec3.dot(axes[i], dir)) || 1;
    out[0] += axes[i][0] * he[i] * s;
    out[1] += axes[i][1] * he[i] * s;
    out[2] += axes[i][2] * he[i] * s;
  }
  return out;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- Terrain (heightfield) contacts. Terrain is static: a = null ----

export function sphereTerrain(body, terrain, out) {
  const h = terrain.heightAt(body.position[0], body.position[2]);
  const bottom = body.position[1] - body.radius;
  if (bottom >= h) return 0;
  const n = terrain.normalAt(body.position[0], body.position[2]);
  const pen = h - bottom;
  out.push(makeContact(null, body,
    [body.position[0], h, body.position[2]], n, pen));
  return 1;
}

const _corner = vec3.create();

export function boxTerrain(body, terrain, out) {
  const he = body.halfExtents;
  // test all 8 corners against the heightfield, keep deepest 4
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    const sx = (i & 1) ? he[0] : -he[0];
    const sy = (i & 2) ? he[1] : -he[1];
    const sz = (i & 4) ? he[2] : -he[2];
    vec3.set(_corner, sx, sy, sz);
    vec3.transformQuat(_corner, _corner, body.orientation);
    const wx = body.position[0] + _corner[0];
    const wy = body.position[1] + _corner[1];
    const wz = body.position[2] + _corner[2];
    const h = terrain.heightAt(wx, wz);
    if (wy < h) {
      candidates.push({ x: wx, y: wy, z: wz, h, pen: h - wy });
    }
  }
  if (candidates.length === 0) return 0;
  candidates.sort((p, q) => q.pen - p.pen);
  const count = Math.min(candidates.length, 4);
  for (let i = 0; i < count; i++) {
    const c = candidates[i];
    const n = terrain.normalAt(c.x, c.z);
    out.push(makeContact(null, body, [c.x, c.h, c.z], n, c.pen));
  }
  return count;
}

