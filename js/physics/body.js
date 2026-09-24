import * as vec3 from '../math/vec3.js';
import * as quat from '../math/quat.js';

export const SHAPE_SPHERE = 0;
export const SHAPE_BOX = 1;

let nextBodyId = 1;

export class Body {
  /**
   * opts: { shape, radius?, halfExtents?, position, mass, restitution, friction,
   *         color, specular, angularDamping, linearDamping, isStatic, name }
   */
  constructor(opts) {
    this.id = nextBodyId++;
    this.name = opts.name || '';
    this.shape = opts.shape;
    this.radius = opts.radius || 0;
    this.halfExtents = opts.halfExtents ? new Float32Array(opts.halfExtents) : null;

    this.position = vec3.create(...(opts.position || [0, 0, 0]));
    this.orientation = quat.create();
    if (opts.rotationY !== undefined) {
      quat.setAxisAngle(this.orientation, [0, 1, 0], opts.rotationY);
    }
    this.velocity = vec3.create(...(opts.velocity || [0, 0, 0]));
    this.angularVelocity = vec3.create();

    this.isStatic = !!opts.isStatic;
    const mass = this.isStatic ? 0 : (opts.mass || 1);
    this.mass = mass;
    this.invMass = this.isStatic ? 0 : 1 / mass;

    // Local inverse inertia (diagonal)
    this.invInertiaLocal = vec3.create();
    if (!this.isStatic) {
      if (this.shape === SHAPE_SPHERE) {
        const I = 0.4 * mass * this.radius * this.radius;
        vec3.set(this.invInertiaLocal, 1 / I, 1 / I, 1 / I);
      } else {
        const he = this.halfExtents;
        const ix = (1 / 12) * mass * (4 * he[1] * he[1] + 4 * he[2] * he[2]);
        const iy = (1 / 12) * mass * (4 * he[0] * he[0] + 4 * he[2] * he[2]);
        const iz = (1 / 12) * mass * (4 * he[0] * he[0] + 4 * he[1] * he[1]);
        vec3.set(this.invInertiaLocal, 1 / ix, 1 / iy, 1 / iz);
      }
    }
    this.invInertiaWorld = new Float32Array(9); // row-major 3x3

    this.restitution = opts.restitution ?? 0.1;
    this.friction = opts.friction ?? 0.6;
    this.linearDamping = opts.linearDamping ?? 0.01;
    this.angularDamping = opts.angularDamping ?? 0.08;

    this.color = opts.color || [0.8, 0.8, 0.8];
    this.specular = opts.specular ?? 0.15;

    this.asleep = false;
    this.sleepTimer = 0;
    this.dead = false;
    this.lastImpactTime = 0;

    this._rotM = new Float32Array(16);
    this.updateInertia();
  }

  // World-space inverse inertia: R * I^-1 * R^T (row-major 3x3)
  updateInertia() {
    const m = this._rotM;
    quat.toMat4(m, this.orientation);
    const d = this.invInertiaLocal;
    const W = this.invInertiaWorld;
    const r00 = m[0], r01 = m[4], r02 = m[8];
    const r10 = m[1], r11 = m[5], r12 = m[9];
    const r20 = m[2], r21 = m[6], r22 = m[10];
    const d0 = d[0], d1 = d[1], d2 = d[2];
    W[0] = r00 * r00 * d0 + r01 * r01 * d1 + r02 * r02 * d2;
    W[1] = r00 * r10 * d0 + r01 * r11 * d1 + r02 * r12 * d2;
    W[2] = r00 * r20 * d0 + r01 * r21 * d1 + r02 * r22 * d2;
    W[3] = W[1];
    W[4] = r10 * r10 * d0 + r11 * r11 * d1 + r12 * r12 * d2;
    W[5] = r10 * r20 * d0 + r11 * r21 * d1 + r12 * r22 * d2;
    W[6] = W[2];
    W[7] = W[5];
    W[8] = r20 * r20 * d0 + r21 * r21 * d1 + r22 * r22 * d2;
  }

  // Apply impulse J at world point (relPos = point - center of mass)
  applyImpulse(J, relPos) {
    if (this.isStatic) return;
    this.wake();
    this.velocity[0] += J[0] * this.invMass;
    this.velocity[1] += J[1] * this.invMass;
    this.velocity[2] += J[2] * this.invMass;
    // angular: invInertiaWorld * (relPos x J)
    const cx = relPos[1] * J[2] - relPos[2] * J[1];
    const cy = relPos[2] * J[0] - relPos[0] * J[2];
    const cz = relPos[0] * J[1] - relPos[1] * J[0];
    const W = this.invInertiaWorld;
    this.angularVelocity[0] += W[0] * cx + W[1] * cy + W[2] * cz;
    this.angularVelocity[1] += W[3] * cx + W[4] * cy + W[5] * cz;
    this.angularVelocity[2] += W[6] * cx + W[7] * cy + W[8] * cz;
  }

  integrateForces(dt, gravity) {
    if (this.isStatic || this.asleep) return;
    this.velocity[0] += gravity[0] * dt;
    this.velocity[1] += gravity[1] * dt;
    this.velocity[2] += gravity[2] * dt;
    const ld = Math.max(0, 1 - this.linearDamping * dt);
    const ad = Math.max(0, 1 - this.angularDamping * dt);
    vec3.scale(this.velocity, this.velocity, ld);
    vec3.scale(this.angularVelocity, this.angularVelocity, ad);
    // velocity clamp for stability
    const sp = vec3.length(this.velocity);
    if (sp > 90) vec3.scale(this.velocity, this.velocity, 90 / sp);
  }

  integratePositions(dt) {
    if (this.isStatic || this.asleep) return;
    vec3.scaleAndAdd(this.position, this.position, this.velocity, dt);
    quat.integrateAngularVelocity(this.orientation, this.orientation,
      this.angularVelocity[0], this.angularVelocity[1], this.angularVelocity[2], dt);
    this.updateInertia();
  }

  // Approximate world AABB
  aabb(out) {
    if (this.shape === SHAPE_SPHERE) {
      const r = this.radius;
      out[0] = this.position[0] - r; out[1] = this.position[1] - r; out[2] = this.position[2] - r;
      out[3] = this.position[0] + r; out[4] = this.position[1] + r; out[5] = this.position[2] + r;
    } else {
      // AABB of oriented box: extent = |R| * he
      const m = this._rotM;
      const he = this.halfExtents;
      const ex = Math.abs(m[0]) * he[0] + Math.abs(m[4]) * he[1] + Math.abs(m[8]) * he[2];
      const ey = Math.abs(m[1]) * he[0] + Math.abs(m[5]) * he[1] + Math.abs(m[9]) * he[2];
      const ez = Math.abs(m[2]) * he[0] + Math.abs(m[6]) * he[1] + Math.abs(m[10]) * he[2];
      out[0] = this.position[0] - ex; out[1] = this.position[1] - ey; out[2] = this.position[2] - ez;
      out[3] = this.position[0] + ex; out[4] = this.position[1] + ey; out[5] = this.position[2] + ez;
    }
    return out;
  }

  wake() {
    this.asleep = false;
    this.sleepTimer = 0;
  }

  trySleep(dt) {
    if (this.isStatic || this.asleep) return;
    const lv = vec3.squaredLength(this.velocity);
    const av = vec3.squaredLength(this.angularVelocity);
    if (lv < 0.04 && av < 0.04) {
      this.sleepTimer += dt;
      if (this.sleepTimer > 0.6) {
        this.asleep = true;
        vec3.set(this.velocity, 0, 0, 0);
        vec3.set(this.angularVelocity, 0, 0, 0);
      }
    } else {
      this.sleepTimer = 0;
    }
  }
}

