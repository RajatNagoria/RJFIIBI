// Headless physics sanity tests (run with: node test/physics.test.mjs)
import { Terrain } from '../js/terrain/terrain.js';
import { Body, SHAPE_SPHERE, SHAPE_BOX } from '../js/physics/body.js';
import { PhysicsWorld, DistanceJoint } from '../js/physics/world.js';

// Terrain imports Mesh (needs WebGL) — stub it via a global hook? Instead we avoid buildMesh.
const terrain = new Terrain(20240, 400, 201);
console.log('terrain height at origin:', terrain.heightAt(0, 0).toFixed(3));

function run(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

run('sphere falls and settles on terrain', () => {
  const w = new PhysicsWorld(terrain);
  const s = new Body({ shape: SHAPE_SPHERE, radius: 0.5, position: [0, 15, 0], mass: 1 });
  w.addBody(s);
  for (let i = 0; i < 600; i++) w.step(1 / 60);
  const groundH = terrain.heightAt(0, 0);
  console.log(`  sphere rest y=${s.position[1].toFixed(3)} (ground=${groundH.toFixed(3)})`);
  assert(Math.abs(s.position[1] - (groundH + 0.5)) < 0.15, 'sphere should rest at ground+radius');
  assert(Math.hypot(...s.velocity) < 0.5, 'sphere should be nearly at rest');
});

run('box stack stays stable', () => {
  const w = new PhysicsWorld(terrain);
  const h = terrain.heightAt(5, 5); // flat spawn plateau
  const boxes = [];
  for (let i = 0; i < 4; i++) {
    const b = new Body({
      shape: SHAPE_BOX, halfExtents: [0.5, 0.5, 0.5],
      position: [5, h + 0.55 + i * 1.01, 5], mass: 1, friction: 0.8, restitution: 0.02,
    });
    boxes.push(b); w.addBody(b);
  }
  for (let i = 0; i < 600; i++) w.step(1 / 60);
  const top = boxes[3];
  console.log(`  top box y=${top.position[1].toFixed(3)} expected ~${(h + 4.5).toFixed(3)}`);
  assert(top.position[1] > h + 3.4, 'stack should not collapse');
  assert(Math.hypot(...top.velocity) < 1.0, 'top box should settle');
});

run('sphere-sphere collision separates', () => {
  const w = new PhysicsWorld(terrain);
  const a = new Body({ shape: SHAPE_SPHERE, radius: 0.5, position: [-0.8, 30, -0.8], mass: 1, velocity: [3, 0, 3], restitution: 0.8 });
  const b = new Body({ shape: SHAPE_SPHERE, radius: 0.5, position: [0.8, 30, 0.8], mass: 1, velocity: [-3, 0, -3], restitution: 0.8 });
  w.addBody(a); w.addBody(b);
  let collided = false;
  for (let i = 0; i < 120; i++) {
    w.step(1 / 60);
    const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
    if (d <= 1.01) collided = true;
  }
  assert(collided, 'spheres should have collided');
});

run('distance joint chain swings, does not explode', () => {
  const w = new PhysicsWorld(terrain);
  const anchor = [0, 20, 0];
  let prev = null;
  const links = [];
  for (let i = 0; i < 5; i++) {
    const link = new Body({ shape: SHAPE_SPHERE, radius: 0.2, position: [0, 20 - (i + 1) * 0.8, 0.5], mass: 0.5 });
    w.addBody(link);
    w.addJoint(new DistanceJoint(prev, link, prev ? null : anchor, 0.8));
    prev = link;
    links.push(link);
  }
  for (let i = 0; i < 600; i++) w.step(1 / 60);
  const last = links[4];
  const dAnchor = Math.hypot(last.position[0] - 0, last.position[1] - 20, last.position[2] - 0);
  console.log(`  last link distance from anchor=${dAnchor.toFixed(3)} (max 4.0)`);
  assert(dAnchor < 4.2, 'chain should not stretch beyond total rest length');
  assert(Number.isFinite(last.position[0]), 'positions must stay finite');
});

run('impact events fire', () => {
  const w = new PhysicsWorld(terrain);
  const s = new Body({ shape: SHAPE_SPHERE, radius: 0.5, position: [5, 12, 5], mass: 2 });
  w.addBody(s);
  let got = false;
  for (let i = 0; i < 300; i++) { w.step(1 / 60); if (w.events.length) got = true; }
  assert(got, 'expected at least one impact event');
});
