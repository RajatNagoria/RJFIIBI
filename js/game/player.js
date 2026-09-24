import * as vec3 from '../math/vec3.js';
import { Body, SHAPE_SPHERE } from '../physics/body.js';
import { collide } from '../physics/collision.js';

const EYE_HEIGHT = 1.62;
const RADIUS = 0.45;
const WALK_SPEED = 6.0;
const SPRINT_SPEED = 10.5;
const JUMP_SPEED = 8.5;
const GRAVITY = 22;

// First-person player: kinematic capsule (approximated by a sphere) that
// collides with the heightfield and pushes dynamic bodies around.
export class Player {
  constructor(terrain, world) {
    this.terrain = terrain;
    this.world = world;
    const y = terrain.heightAt(0, 0);
    this.position = vec3.create(0, y + 0.1, 0); // feet
    this.velocity = vec3.create();
    this.grounded = false;
    this.headBobPhase = 0;
    this.onLand = null;   // callback(hardLanding)
    this._pushBody = new Body({ shape: SHAPE_SPHERE, radius: RADIUS, mass: 3, position: [0, 0, 0] });
    this._contacts = [];
    this.speed = 0;
    this._wasGrounded = true;
  }

  update(dt, input, camera) {
    // --- look ---
    const [mdx, mdy] = input.consumeMouseDelta();
    camera.yaw -= mdx * 0.0022;
    camera.pitch -= mdy * 0.0022;
    camera.pitch = Math.max(-1.53, Math.min(1.53, camera.pitch));

    // --- move ---
    const fwd = [camera.forward[0], 0, camera.forward[2]];
    const fl = Math.hypot(fwd[0], fwd[2]) || 1;
    fwd[0] /= fl; fwd[2] /= fl;
    const right = [-fwd[2], 0, fwd[0]];

    let wx = 0, wz = 0;
    if (input.isDown('KeyW')) { wx += fwd[0]; wz += fwd[2]; }
    if (input.isDown('KeyS')) { wx -= fwd[0]; wz -= fwd[2]; }
    if (input.isDown('KeyD')) { wx += right[0]; wz += right[2]; }
    if (input.isDown('KeyA')) { wx -= right[0]; wz -= right[2]; }
    const wl = Math.hypot(wx, wz);
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const target = wl > 0 ? (sprint ? SPRINT_SPEED : WALK_SPEED) : 0;
    if (wl > 0) { wx /= wl; wz /= wl; }

    const accel = this.grounded ? 11 : 2.2;
    const k = Math.min(1, accel * dt);
    this.velocity[0] += (wx * target - this.velocity[0]) * k;
    this.velocity[2] += (wz * target - this.velocity[2]) * k;

    // jump & gravity
    if (this.grounded && input.isDown('Space')) {
      this.velocity[1] = JUMP_SPEED;
      this.grounded = false;
    }
    this.velocity[1] -= GRAVITY * dt;

    // integrate
    this.position[0] += this.velocity[0] * dt;
    this.position[1] += this.velocity[1] * dt;
    this.position[2] += this.velocity[2] * dt;

    // world bounds
    const lim = this.terrain.half - 6;
    this.position[0] = Math.max(-lim, Math.min(lim, this.position[0]));
    this.position[2] = Math.max(-lim, Math.min(lim, this.position[2]));

    // --- terrain collision ---
    const groundH = this.terrain.heightAt(this.position[0], this.position[2]);
    this.grounded = false;
    if (this.position[1] <= groundH + 0.02) {
      const impactSpeed = -this.velocity[1];
      this.position[1] = groundH;
      if (this.velocity[1] < 0) this.velocity[1] = 0;
      this.grounded = true;
      if (!this._wasGrounded && impactSpeed > 5 && this.onLand) {
        this.onLand(impactSpeed > 11);
      }
      // slide downhill on steep slopes
      const n = this.terrain.normalAt(this.position[0], this.position[2]);
      if (n[1] < 0.75) {
        const slide = (0.75 - n[1]) * 30 * dt;
        this.position[0] += n[0] * slide;
        this.position[2] += n[2] * slide;
      }
    }
    this._wasGrounded = this.grounded;

    // --- collide with dynamic bodies (player can shove them) ---
    this._collideBodies(dt);

    // --- head bob + camera placement ---
    this.speed = Math.hypot(this.velocity[0], this.velocity[2]);
    if (this.grounded && this.speed > 0.5) {
      this.headBobPhase += dt * this.speed * 1.4;
    }
    const bob = Math.sin(this.headBobPhase) * 0.035 * Math.min(1, this.speed / WALK_SPEED);
    camera.position[0] = this.position[0];
    camera.position[1] = this.position[1] + EYE_HEIGHT + bob;
    camera.position[2] = this.position[2];
  }

  _collideBodies(dt) {
    const sphere = this._pushBody;
    vec3.set(sphere.position, this.position[0], this.position[1] + 0.9, this.position[2]);
    this._contacts.length = 0;
    for (const b of this.world.bodies) {
      if (b.asleep) {
        // cheap reject before narrowphase
        const dx = b.position[0] - sphere.position[0];
        const dz = b.position[2] - sphere.position[2];
        if (dx * dx + dz * dz > 9) continue;
      }
      collide(sphere, b, this._contacts);
    }
    for (const c of this._contacts) {
      // normal points player -> body; push player out along -n
      const n = c.normal;
      const pen = c.penetration;
      if (pen <= 0) continue;
      this.position[0] -= n[0] * pen * 0.9;
      this.position[1] -= n[1] * pen * 0.9;
      this.position[2] -= n[2] * pen * 0.9;
      // kill velocity into the body
      const vn = this.velocity[0] * n[0] + this.velocity[1] * n[1] + this.velocity[2] * n[2];
      if (vn > 0) {
        this.velocity[0] -= n[0] * vn;
        this.velocity[1] -= n[1] * vn;
        this.velocity[2] -= n[2] * vn;
      }
      if (n[1] < -0.5) this.grounded = true; // standing on a body
      // shove the body
      const shove = 3.0 * Math.min(1, pen * 4 + 0.25) * dt * 60;
      c.b.applyImpulse([n[0] * shove, n[1] * shove, n[2] * shove], [
        c.point[0] - c.b.position[0],
        c.point[1] - c.b.position[1],
        c.point[2] - c.b.position[2],
      ]);
    }
  }
}
