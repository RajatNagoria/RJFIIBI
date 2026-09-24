import * as vec3 from '../math/vec3.js';
import { SHAPE_SPHERE } from './body.js';
import { collide, sphereTerrain, boxTerrain } from './collision.js';

const GRAVITY = [0, -18, 0];
const CELL_SIZE = 5;
const SOLVER_ITERATIONS = 10;
const BAUMGARTE = 0.2;
const SLOP = 0.005;
const RESTITUTION_THRESHOLD = 1.2;

export class DistanceJoint {
  constructor(bodyA, bodyB, anchorWorld, restLength) {
    this.a = bodyA;                 // null => world anchor
    this.b = bodyB;
    this.anchor = anchorWorld ? [...anchorWorld] : null;
    this.rest = restLength;
    this.impulse = 0;
  }

  points() {
    const pa = this.a ? this.a.position : this.anchor;
    const pb = this.b.position;
    return [pa, pb];
  }

  solve(dt) {
    const [pa, pb] = this.points();
    const axis = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const dist = Math.hypot(axis[0], axis[1], axis[2]);
    if (dist < 1e-6) return;
    axis[0] /= dist; axis[1] /= dist; axis[2] /= dist;
    const C = dist - this.rest;

    const a = this.a, b = this.b;
    const invMassA = a ? a.invMass : 0;
    // velocity along axis
    const va = a ? a.velocity : ZERO;
    const vb = b.velocity;
    const vn = (vb[0] - va[0]) * axis[0] + (vb[1] - va[1]) * axis[1] + (vb[2] - va[2]) * axis[2];
    const bias = (BAUMGARTE / dt) * clamp(C, -0.5, 0.5);
    let lambda = -(vn + bias) / (invMassA + b.invMass);
    this.impulse += lambda;
    const J = [axis[0] * lambda, axis[1] * lambda, axis[2] * lambda];
    if (a) {
      a.wake();
      a.velocity[0] -= J[0] * a.invMass;
      a.velocity[1] -= J[1] * a.invMass;
      a.velocity[2] -= J[2] * a.invMass;
    }
    b.wake();
    b.velocity[0] += J[0] * b.invMass;
    b.velocity[1] += J[1] * b.invMass;
    b.velocity[2] += J[2] * b.invMass;
  }
}

const ZERO = [0, 0, 0];

export class PhysicsWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.bodies = [];
    this.joints = [];
    this.events = [];      // impact events for audio/gameplay
    this.gravity = GRAVITY;
    this._pairSet = new Set();
    this._contactCache = new Map();   // warm-start impulses across frames
    this._grid = new Map();
    this._aabb = new Float32Array(6);
    this.time = 0;
  }

  addBody(body) {
    this.bodies.push(body);
    return body;
  }

  addJoint(joint) {
    this.joints.push(joint);
    return joint;
  }

  removeDead() {
    for (const b of this.bodies) {
      if (b.position[1] < -60 || Math.abs(b.position[0]) > 400 || Math.abs(b.position[2]) > 400) {
        b.dead = true;
      }
    }
    if (this.bodies.some(b => b.dead)) {
      const deadSet = new Set(this.bodies.filter(b => b.dead));
      this.joints = this.joints.filter(j =>
        !(j.a && deadSet.has(j.a)) && !deadSet.has(j.b));
      this.bodies = this.bodies.filter(b => !b.dead);
    }
  }

  step(dt) {
    this.events.length = 0;
    const S = 4;
    const h = dt / S;
    for (let s = 0; s < S; s++) this.substep(h);
    for (const b of this.bodies) b.trySleep(dt);
    this.removeDead();
  }

  substep(dt) {
    this.time += dt;

    // 1. integrate forces
    for (const b of this.bodies) b.integrateForces(dt, this.gravity);

    // 2. broadphase
    const pairs = this.broadphase();

    // 3. narrowphase
    const contacts = [];
    for (const [a, b] of pairs) collide(a, b, contacts);
    for (const b of this.bodies) {
      if (b.asleep) continue;
      // cheap terrain rejection: bounding radius vs height at center
      const bound = b.shape === SHAPE_SPHERE ? b.radius : vec3.length(b.halfExtents);
      const h = this.terrain.heightAt(b.position[0], b.position[2]);
      if (b.position[1] - bound < h + 0.1) {
        if (b.shape === SHAPE_SPHERE) sphereTerrain(b, this.terrain, contacts);
        else boxTerrain(b, this.terrain, contacts);
      }
    }

    // 3b. warm start from cached impulses
    this.warmStart(contacts);

    // 4. solve velocity constraints (reverse order on odd iterations to
    // cancel Gauss-Seidel ordering bias)
    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      for (const j of this.joints) j.solve(dt);
      if (iter % 2 === 0) {
        for (const c of contacts) this.solveContact(c, dt, iter === 0);
      } else {
        for (let ci = contacts.length - 1; ci >= 0; ci--) this.solveContact(contacts[ci], dt, false);
      }
    }

    // 4b. persist impulses for next frame
    this.saveContacts(contacts);

    // 5. non-linear positional correction (split-impulse style, translation only)
    for (const c of contacts) {
      const corr = Math.max(0, c.penetration - SLOP) * 0.35;
      if (corr <= 0) continue;
      const a = c.a, b = c.b;
      const invA = a ? a.invMass : 0;
      const invB = b.invMass;
      const sum = invA + invB;
      if (sum === 0) continue;
      const k = corr / sum;
      if (a && !a.isStatic && !a.asleep) {
        a.position[0] -= c.normal[0] * k * invA;
        a.position[1] -= c.normal[1] * k * invA;
        a.position[2] -= c.normal[2] * k * invA;
      }
      if (!b.isStatic && !b.asleep) {
        b.position[0] += c.normal[0] * k * invB;
        b.position[1] += c.normal[1] * k * invB;
        b.position[2] += c.normal[2] * k * invB;
      }
    }

    // 5. impact events (based on accumulated normal impulse)
    for (const c of contacts) {
      if (c.impulseN > 3.0) {
        const now = this.time;
        const bodyB = c.b, bodyA = c.a;
        const main = bodyB || bodyA;
        if (main && now - main.lastImpactTime > 0.09) {
          main.lastImpactTime = now;
          this.events.push({
            type: 'impact',
            x: c.point[0], y: c.point[1], z: c.point[2],
            strength: c.impulseN,
            metallic: Math.max(bodyA ? bodyA.restitution : 0, bodyB ? bodyB.restitution : 0) > 0.4,
          });
        }
      }
    }

    // 6. integrate positions
    for (const b of this.bodies) b.integratePositions(dt);
  }


  // Match new contacts against last frame's cache and re-apply accumulated
  // impulses (warm starting) — key to stable stacks.
  warmStart(contacts) {
    for (const c of contacts) {
      const idA = c.a ? c.a.id : 0;
      const key = idA * 1048576 + c.b.id;
      const prev = this._contactCache.get(key);
      if (prev) {
        for (const pc of prev) {
          const dx = pc.point[0] - c.point[0];
          const dy = pc.point[1] - c.point[1];
          const dz = pc.point[2] - c.point[2];
          if (dx * dx + dy * dy + dz * dz < 0.02) {
            c.impulseN = pc.impulseN * 0.85;
            c.impulseT1 = pc.impulseT1 * 0.85;
            c.impulseT2 = pc.impulseT2 * 0.85;
            c.warm = true;
            break;
          }
        }
      }
      if (c.impulseN > 0 || c.impulseT1 !== 0 || c.impulseT2 !== 0) {
        const a = c.a, b = c.b;
        const ra = a ? [c.point[0] - a.position[0], c.point[1] - a.position[1], c.point[2] - a.position[2]] : null;
        const rb = [c.point[0] - b.position[0], c.point[1] - b.position[1], c.point[2] - b.position[2]];
        const n = c.normal, t1 = c.tangent1, t2 = c.tangent2;
        applyPairImpulse(a, b, ra, rb,
          n[0] * c.impulseN + t1[0] * c.impulseT1 + t2[0] * c.impulseT2,
          n[1] * c.impulseN + t1[1] * c.impulseT1 + t2[1] * c.impulseT2,
          n[2] * c.impulseN + t1[2] * c.impulseT1 + t2[2] * c.impulseT2);
      }
    }
  }

  saveContacts(contacts) {
    this._contactCache.clear();
    for (const c of contacts) {
      const idA = c.a ? c.a.id : 0;
      const key = idA * 1048576 + c.b.id;
      let list = this._contactCache.get(key);
      if (!list) { list = []; this._contactCache.set(key, list); }
      list.push({
        point: c.point,
        impulseN: c.impulseN,
        impulseT1: c.impulseT1,
        impulseT2: c.impulseT2,
      });
    }
  }

  // Uniform grid spatial hash on the XZ plane.
  broadphase() {
    const grid = this._grid;
    grid.clear();
    const bodies = this.bodies;
    const boxes = new Array(bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const bb = b.aabb(this._aabb);
      boxes[i] = [bb[0], bb[1], bb[2], bb[3], bb[4], bb[5]];
      const x0 = Math.floor(bb[0] / CELL_SIZE), x1 = Math.floor(bb[3] / CELL_SIZE);
      const z0 = Math.floor(bb[2] / CELL_SIZE), z1 = Math.floor(bb[5] / CELL_SIZE);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = (cx + 512) * 2048 + (cz + 512);
          let cell = grid.get(key);
          if (!cell) { cell = []; grid.set(key, cell); }
          cell.push(i);
        }
      }
    }
    const pairs = [];
    this._pairSet.clear();
    for (const cell of grid.values()) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const ia = Math.min(cell[i], cell[j]), ib = Math.max(cell[i], cell[j]);
          const pk = ia * 65536 + ib;
          if (this._pairSet.has(pk)) continue;
          this._pairSet.add(pk);
          const A = boxes[ia], B = boxes[ib];
          if (A[0] > B[3] || A[3] < B[0] || A[1] > B[4] || A[4] < B[1] || A[2] > B[5] || A[5] < B[2]) continue;
          const ba = bodies[ia], bb = bodies[ib];
          if (ba.asleep && bb.asleep) continue;
          pairs.push([ba, bb]);
        }
      }
    }
    return pairs;
  }

  // Sequential impulse with Baumgarte positional bias + Coulomb friction.
  solveContact(c, dt, firstIter) {
    const a = c.a;           // may be null (terrain)
    const b = c.b;
    const n = c.normal;
    const p = c.point;

    const ra = a ? [p[0] - a.position[0], p[1] - a.position[1], p[2] - a.position[2]] : null;
    const rb = [p[0] - b.position[0], p[1] - b.position[1], p[2] - b.position[2]];

    // relative velocity at contact (b relative to a)
    const va = contactVelocity(a, ra);
    const vb = contactVelocity(b, rb);
    const rvx = vb[0] - va[0], rvy = vb[1] - va[1], rvz = vb[2] - va[2];
    const vn = rvx * n[0] + rvy * n[1] + rvz * n[2];

    // effective mass along normal
    const kn = effectiveMass(a, b, ra, rb, n);

    const e = Math.min(a ? a.restitution : 0, b.restitution);
    let bias = 0; // positional correction handles penetration (split impulse)
    if (vn < -RESTITUTION_THRESHOLD) bias += -e * vn; // restitution only for fast approach

    let lambda = -(vn - bias) / kn;
    const oldN = c.impulseN;
    c.impulseN = Math.max(oldN + lambda, 0);
    lambda = c.impulseN - oldN;
    if (lambda !== 0) {
      applyPairImpulse(a, b, ra, rb, n[0] * lambda, n[1] * lambda, n[2] * lambda);
    }

    // Coulomb friction: two FIXED orthogonal tangents per contact, so
    // accumulated impulses stay direction-consistent across iterations.
    if (c.impulseN > 0) {
      const mu = Math.sqrt((a ? a.friction : 0.7) * b.friction);
      // build orthonormal basis around n (stable across the whole solve)
      let t1x = n[2], t1y = 0, t1z = -n[0]; // cross(n, +Y)
      let t1l = Math.hypot(t1x, t1y, t1z);
      if (t1l < 1e-6) { t1x = 0; t1y = n[2]; t1z = -n[1]; t1l = Math.hypot(t1x, t1y, t1z); }
      t1x /= t1l; t1y /= t1l; t1z /= t1l;
      // t2 = n x t1
      const t2x = n[1] * t1z - n[2] * t1y;
      const t2y = n[2] * t1x - n[0] * t1z;
      const t2z = n[0] * t1y - n[1] * t1x;
      c.tangent1[0] = t1x; c.tangent1[1] = t1y; c.tangent1[2] = t1z;
      c.tangent2[0] = t2x; c.tangent2[1] = t2y; c.tangent2[2] = t2z;

      const maxF = mu * c.impulseN;
      for (let ti = 0; ti < 2; ti++) {
        const tx = ti === 0 ? t1x : t2x;
        const ty = ti === 0 ? t1y : t2y;
        const tz = ti === 0 ? t1z : t2z;
        const va2 = contactVelocity(a, ra);
        const vb2 = contactVelocity(b, rb);
        const vt = (vb2[0] - va2[0]) * tx + (vb2[1] - va2[1]) * ty + (vb2[2] - va2[2]) * tz;
        if (Math.abs(vt) < 1e-7) continue;
        const kt = effectiveMass(a, b, ra, rb, [tx, ty, tz]);
        let lt = -vt / kt;
        const acc = ti === 0 ? 'impulseT1' : 'impulseT2';
        const oldT = c[acc];
        c[acc] = Math.min(Math.max(oldT + lt, -maxF), maxF);
        lt = c[acc] - oldT;
        if (lt !== 0) {
          applyPairImpulse(a, b, ra, rb, tx * lt, ty * lt, tz * lt);
        }
      }
    }

  }
}

function contactVelocity(body, relPos) {
  if (!body) return ZERO;
  // v + omega x r
  const w = body.angularVelocity;
  return [
    body.velocity[0] + w[1] * relPos[2] - w[2] * relPos[1],
    body.velocity[1] + w[2] * relPos[0] - w[0] * relPos[2],
    body.velocity[2] + w[0] * relPos[1] - w[1] * relPos[0],
  ];
}

// Effective mass along direction dir for the two-body contact:
// k = invM_a + invM_b + n . ((I_a^-1 (ra x n)) x ra) + ((I_b^-1 (rb x n)) x rb)
function effectiveMass(a, b, ra, rb, dir) {
  let k = (a ? a.invMass : 0) + b.invMass;
  if (a && !a.isStatic) k += angularTerm(a, ra, dir);
  if (!b.isStatic) k += angularTerm(b, rb, dir);
  return k;
}

function angularTerm(body, r, n) {
  // c = r x n
  const cx = r[1] * n[2] - r[2] * n[1];
  const cy = r[2] * n[0] - r[0] * n[2];
  const cz = r[0] * n[1] - r[1] * n[0];
  const W = body.invInertiaWorld;
  // t = W * c
  const tx = W[0] * cx + W[1] * cy + W[2] * cz;
  const ty = W[3] * cx + W[4] * cy + W[5] * cz;
  const tz = W[6] * cx + W[7] * cy + W[8] * cz;
  // (t x r) . n
  return (ty * r[2] - tz * r[1]) * n[0]
       + (tz * r[0] - tx * r[2]) * n[1]
       + (tx * r[1] - ty * r[0]) * n[2];
}

function applyPairImpulse(a, b, ra, rb, jx, jy, jz) {
  if (a && !a.isStatic) {
    a.wake();
    a.applyImpulse([-jx, -jy, -jz], ra);
  }
  if (!b.isStatic) {
    b.wake();
    b.applyImpulse([jx, jy, jz], rb);
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

