import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { Mesh } from './engine/mesh.js';
import { buildCube, buildSphere } from './engine/geometry.js';
import { buildTree, buildRock, buildGrid } from './engine/geometry-extra.js';
import { Terrain } from './terrain/terrain.js';
import { PhysicsWorld } from './physics/world.js';
import { SHAPE_BOX } from './physics/body.js';
import { Input } from './game/input.js';
import { Player } from './game/player.js';
import { AudioEngine } from './game/audio.js';
import { Props } from './game/props.js';
import { Hud } from './game/hud.js';

const PHYS_DT = 1 / 60;
const MAX_BODY_INSTANCES = 300;
const MAX_STATIC_INSTANCES = 900;

function fatal(msg) {
  const el = document.getElementById('overlay');
  el.innerHTML = `<div class="panel"><h1>Cannot start</h1><p>${msg}</p></div>`;
  el.classList.remove('hidden');
  throw new Error(msg);
}

function boot() {
  const canvas = document.getElementById('gl');
  let renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    fatal(e.message);
  }
  const gl = renderer.gl;

  // --- world content ---
  const terrain = new Terrain(20240, 400, 201);
  const terrainMesh = terrain.buildMesh(gl);
  const waterMesh = new Mesh(gl, buildGrid(600, 96));
  const cubeMesh = new Mesh(gl, buildCube());
  const sphereMesh = new Mesh(gl, buildSphere(24, 16));
  const treeMesh = new Mesh(gl, buildTree());
  const rockMesh = new Mesh(gl, buildRock(7));

  cubeMesh.initInstances(gl, MAX_BODY_INSTANCES, true);
  sphereMesh.initInstances(gl, MAX_BODY_INSTANCES, true);
  treeMesh.initInstances(gl, MAX_STATIC_INSTANCES, false);
  rockMesh.initInstances(gl, MAX_STATIC_INSTANCES, false);

  // static vegetation/rocks
  const { trees, rocks } = terrain.scatter(650, 110);
  treeMesh.uploadInstances(gl, packStatic(trees), trees.length);
  rockMesh.uploadInstances(gl, packStatic(rocks), rocks.length);

  // --- simulation ---
  const world = new PhysicsWorld(terrain);
  const props = new Props(world, terrain);
  props.spawnDefaultScene();

  const camera = new Camera(72, 0.1, 700);
  camera.yaw = 0.15;
  camera.pitch = -0.05;
  const player = new Player(terrain, world);
  const input = new Input(canvas);
  const audio = new AudioEngine();
  const hud = new Hud();

  player.onLand = (hard) => audio.playJumpLand(hard);

  // --- input wiring ---
  canvas.addEventListener('click', () => {
    audio.resume();
    input.requestLock();
  });
  document.getElementById('overlay').addEventListener('click', () => {
    audio.resume();
    input.requestLock();
  });
  input.onLockChange = (locked) => hud.setLocked(locked);
  input.onPrimaryAction = () => {
    props.shootBall(camera.position, camera.forward);
    audio.playShoot();
  };
  input.onSecondaryAction = () => {
    props.shootBall(camera.position, camera.forward);
    audio.playShoot();
  };
  input.onKeyPress = (code) => {
    const ahead = [
      player.position[0] + camera.forward[0] * 7,
      0,
      player.position[2] + camera.forward[2] * 7,
    ];
    switch (code) {
      case 'KeyB': props.spawnTower(ahead[0], ahead[2], 4); hud.toast('Crate tower'); break;
      case 'KeyN': props.spawnPyramid(ahead[0], ahead[2]); hud.toast('Pyramid'); break;
      case 'KeyG': props.spawnDominoes(ahead[0], ahead[2], Math.atan2(camera.forward[2], camera.forward[0]), 14); hud.toast('Dominoes'); break;
      case 'KeyV': props.spawnWreckingBall(ahead[0], ahead[2]); hud.toast('Wrecking ball'); break;
      case 'KeyR': props.reset(); hud.toast('Scene reset'); break;
      case 'KeyM': hud.toast(audio.toggleMute() ? 'Muted' : 'Sound on'); break;
      case 'KeyH': hud.toggleHelp(); break;
    }
  };

  // scratch buffers for dynamic instance packing
  const cubeData = new Float32Array(MAX_BODY_INSTANCES * 22);
  const sphereData = new Float32Array(MAX_BODY_INSTANCES * 22);

  const scene = {
    terrain: terrainMesh,
    water: waterMesh,
    waterLevel: terrain.waterLevel,
    instanced: [cubeMesh, sphereMesh, treeMesh, rockMesh],
    instancedShadow: [cubeMesh, sphereMesh, treeMesh, rockMesh],
  };

  // --- game loop ---
  let last = performance.now();
  let accumulator = 0;
  let physMs = 0;
  let time = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was hidden
    time += dt;

    if (input.locked) {
      player.update(Math.min(dt, 0.05), input, camera);
    } else {
      camera.update(canvas.width / canvas.height); // keep matrices valid
    }

    const t0 = performance.now();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= PHYS_DT && steps < 3) {
      world.step(PHYS_DT);
      accumulator -= PHYS_DT;
      steps++;
    }
    if (steps === 3) accumulator = 0; // drop excess (slow machine)
    physMs = physMs * 0.9 + (performance.now() - t0) * 0.1;

    // impact audio events
    for (const ev of world.events) {
      if (ev.type === 'impact') audio.playImpact(ev.x, ev.y, ev.z, ev.strength, ev.metallic);
    }
    props.update(dt);
    audio.update(dt, camera, player.speed, player.grounded);

    // pack dynamic instances
    const [cubes, spheres] = packDynamic(world.bodies, cubeData, sphereData);
    cubeMesh.uploadInstances(gl, cubeData, cubes);
    sphereMesh.uploadInstances(gl, sphereData, spheres);

    camera.update(canvas.width / Math.max(1, canvas.height));
    renderer.render(scene, camera, time);

    let asleep = 0;
    for (const b of world.bodies) if (b.asleep) asleep++;
    hud.update(dt, {
      drawCalls: renderer.stats.drawCalls,
      triangles: renderer.stats.triangles,
      bodies: world.bodies.length,
      asleep,
      physMs,
      pos: player.position,
    });
  }
  requestAnimationFrame(frame);

  // debug / test hook
  window.__vertex = { renderer, world, camera, player, props, terrain, hud, input, scatter: { trees: trees.length, rocks: rocks.length } };
}

// Pack dynamic bodies into instanced attribute buffers (mat4 + color + params).
function packDynamic(bodies, cubeData, sphereData) {
  let ci = 0, si = 0;
  for (const b of bodies) {
    const isBox = b.shape === SHAPE_BOX;
    const data = isBox ? cubeData : sphereData;
    let idx = isBox ? ci : si;
    if (idx >= data.length / 22) continue;
    const o = idx * 22;
    const m = b._rotM;
    let sx, sy, sz;
    if (isBox) {
      sx = b.halfExtents[0] * 2; sy = b.halfExtents[1] * 2; sz = b.halfExtents[2] * 2;
    } else {
      sx = sy = sz = b.radius * 2;
    }
    data[o] = m[0] * sx; data[o + 1] = m[1] * sx; data[o + 2] = m[2] * sx; data[o + 3] = 0;
    data[o + 4] = m[4] * sy; data[o + 5] = m[5] * sy; data[o + 6] = m[6] * sy; data[o + 7] = 0;
    data[o + 8] = m[8] * sz; data[o + 9] = m[9] * sz; data[o + 10] = m[10] * sz; data[o + 11] = 0;
    data[o + 12] = b.position[0]; data[o + 13] = b.position[1]; data[o + 14] = b.position[2]; data[o + 15] = 1;
    data[o + 16] = b.color[0]; data[o + 17] = b.color[1]; data[o + 18] = b.color[2];
    data[o + 19] = 0; data[o + 20] = b.specular; data[o + 21] = 0;
    if (isBox) ci++; else si++;
  }
  return [ci, si];
}

// Pack static scatter items {x,y,z,scale,rot,tint}.
function packStatic(items) {
  const data = new Float32Array(items.length * 22);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const o = i * 22;
    const c = Math.cos(it.rot), s = Math.sin(it.rot);
    const sc = it.scale;
    data[o] = c * sc; data[o + 1] = 0; data[o + 2] = -s * sc; data[o + 3] = 0;
    data[o + 4] = 0; data[o + 5] = sc; data[o + 6] = 0; data[o + 7] = 0;
    data[o + 8] = s * sc; data[o + 9] = 0; data[o + 10] = c * sc; data[o + 11] = 0;
    data[o + 12] = it.x; data[o + 13] = it.y; data[o + 14] = it.z; data[o + 15] = 1;
    const t = it.tint;
    data[o + 16] = t; data[o + 17] = t; data[o + 18] = t;
    data[o + 19] = 0; data[o + 20] = 0.02; data[o + 21] = 0;
  }
  return data;
}

boot();

