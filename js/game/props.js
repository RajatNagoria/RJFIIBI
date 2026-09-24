import { Body, SHAPE_SPHERE, SHAPE_BOX } from '../physics/body.js';
import { DistanceJoint } from '../physics/world.js';

const MAX_BODIES = 260;
const BALL_LIFETIME = 35;

const CRATE_COLOR = [0.60, 0.42, 0.22];
const CRATE_COLOR2 = [0.52, 0.36, 0.20];
const BALL_COLOR = [0.72, 0.74, 0.80];
const DOMINO_COLORS = [[0.85, 0.30, 0.25], [0.25, 0.55, 0.85], [0.9, 0.75, 0.2], [0.4, 0.75, 0.35]];

// Gameplay object spawners + body budget management.
export class Props {
  constructor(world, terrain) {
    this.world = world;
    this.terrain = terrain;
    this.balls = [];
    this.time = 0;
  }

  _add(body) {
    if (this.world.bodies.length >= MAX_BODIES) {
      // despawn oldest ball first, else oldest dynamic body
      const victim = this.balls.shift() || this.world.bodies[0];
      if (victim) victim.dead = true;
    }
    this.world.addBody(body);
    return body;
  }

  shootBall(pos, dir) {
    const b = new Body({
      shape: SHAPE_SPHERE,
      radius: 0.45,
      position: [pos[0] + dir[0] * 1.4, pos[1] + dir[1] * 1.4, pos[2] + dir[2] * 1.4],
      mass: 6,
      velocity: [dir[0] * 38, dir[1] * 38 + 2.5, dir[2] * 38],
      restitution: 0.55,
      friction: 0.5,
      angularDamping: 0.02,
      color: BALL_COLOR,
      specular: 0.9,
      name: 'ball',
    });
    b.spawnedAt = this.time;
    this.balls.push(b);
    return this._add(b);
  }

  spawnTower(x, z, levels = 4) {
    const h = this.terrain.heightAt(x, z);
    for (let i = 0; i < levels; i++) {
      this._add(new Body({
        shape: SHAPE_BOX,
        halfExtents: [0.5, 0.5, 0.5],
        position: [x, h + 0.52 + i * 1.001, z],
        mass: 2, friction: 0.8, restitution: 0.02, angularDamping: 0.25,
        color: i % 2 ? CRATE_COLOR : CRATE_COLOR2,
        name: 'crate',
      }));
    }
  }

  spawnPyramid(x, z) {
    const h = this.terrain.heightAt(x, z);
    const size = 0.55;
    for (let layer = 0; layer < 4; layer++) {
      const count = 4 - layer;
      const y = h + size + layer * (size * 2 + 0.012);
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * (size * 2 + 0.07);
        this._add(new Body({
          shape: SHAPE_BOX,
          halfExtents: [size, size, size],
          position: [x + offset, y, z],
          mass: 2, friction: 0.85, restitution: 0.02, angularDamping: 0.25,
          color: layer % 2 ? CRATE_COLOR : CRATE_COLOR2,
          name: 'crate',
        }));
      }
    }
  }

  spawnDominoes(x, z, angle = 0, count = 14) {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    for (let i = 0; i < count; i++) {
      const px = x + dx * i * 0.55;
      const pz = z + dz * i * 0.55;
      const h = this.terrain.heightAt(px, pz);
      const b = new Body({
        shape: SHAPE_BOX,
        halfExtents: [0.30, 0.65, 0.08],
        position: [px, h + 0.66, pz],
        rotationY: Math.PI / 2 - angle,
        mass: 1.2, friction: 0.7, restitution: 0.02, angularDamping: 0.2,
        color: DOMINO_COLORS[i % DOMINO_COLORS.length],
        name: 'domino',
      });
      this._add(b);
    }
  }

  // Chain of small spheres from a fixed anchor + heavy wrecking ball.
  spawnWreckingBall(x, z) {
    const ground = this.terrain.heightAt(x, z);
    const anchor = [x, ground + 10.5, z];
    const linkRest = 0.85;
    let prev = null;
    const links = 5;
    for (let i = 0; i < links; i++) {
      const link = new Body({
        shape: SHAPE_SPHERE,
        radius: 0.22,
        position: [x + 0.15 * (i + 1), anchor[1] - linkRest * (i + 1), z],
        mass: 1.5, friction: 0.4, restitution: 0.05,
        color: [0.35, 0.36, 0.4], specular: 0.6,
        name: 'chain',
      });
      this._add(link);
      this.world.addJoint(new DistanceJoint(prev, link, prev ? null : anchor, linkRest));
      prev = link;
    }
    const ball = new Body({
      shape: SHAPE_SPHERE,
      radius: 0.95,
      position: [x + 0.15 * (links + 1) + 1.2, anchor[1] - linkRest * links - 1.1, z],
      mass: 60,
      velocity: [7, 0, 0],   // start with a swing
      friction: 0.4, restitution: 0.1, angularDamping: 0.02,
      color: [0.22, 0.23, 0.27], specular: 0.95,
      name: 'wreckingball',
    });
    this._add(ball);
    this.world.addJoint(new DistanceJoint(prev, ball, null, 1.15));
  }

  spawnDefaultScene() {
    this.spawnTower(-6, -12, 4);
    this.spawnPyramid(8, -14);
    this.spawnDominoes(-14, 6, Math.PI * 0.35, 16);
    this.spawnWreckingBall(14, 10);
    this.spawnTower(20, -6, 3);
    this.spawnPyramid(-18, -8);
  }

  reset() {
    for (const b of this.world.bodies) b.dead = true;
    this.world.removeDead();
    this.world.joints.length = 0;
    this.balls.length = 0;
    this.spawnDefaultScene();
  }

  update(dt) {
    this.time += dt;
    // despawn old balls
    while (this.balls.length && this.time - this.balls[0].spawnedAt > BALL_LIFETIME) {
      const b = this.balls.shift();
      b.dead = true;
    }
  }
}
