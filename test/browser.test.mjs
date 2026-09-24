// Headless browser verification. Run: node test/browser.test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import puppeteer from '/tmp/pptr/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

const ROOT = '/workspace';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

process.env.LD_LIBRARY_PATH = '/tmp/chromelibs/root/usr/lib/x86_64-linux-gnu:/tmp/chromelibs/root/lib/x86_64-linux-gnu';
const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 300000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const v = window.__vertex;
  return {
    bodies: v.world.bodies.length,
    joints: v.world.joints.length,
    trees: v.scatter.trees,
    rocks: v.scatter.rocks,
    drawCalls: v.renderer.stats.drawCalls,
  };
});
console.log('info:', JSON.stringify(info));

// physics liveness
const motion = await page.evaluate(async () => {
  const v = window.__vertex;
  const ball = v.world.bodies.find(b => b.name === 'wreckingball');
  const before = Array.from(ball.position);
  await new Promise(r => setTimeout(r, 1200));
  const after = Array.from(ball.position);
  return Math.abs(after[0] - before[0]) + Math.abs(after[2] - before[2]);
});
console.log('wrecking ball moved:', motion.toFixed(3));

await page.evaluate(() => window.__vertex.hud.setLocked(true));

// tower close-up (shadow check)
await page.evaluate(() => {
  const v = window.__vertex;
  const t = v.terrain.heightAt(-6, -12);
  v.camera.position[0] = -12;
  v.camera.position[1] = t + 2.0;
  v.camera.position[2] = -17;
  v.camera.yaw = Math.atan2(-(-6 - v.camera.position[0]), -(-12 - v.camera.position[2]));
  v.camera.pitch = -0.22;
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/shot_tower.png' });
console.log('tower shot ok');

// tree cluster shot
await page.evaluate(() => {
  const v = window.__vertex;
  const h = v.terrain.heightAt(70, 40);
  v.camera.position[0] = 70;
  v.camera.position[1] = h + 3.5;
  v.camera.position[2] = 40;
  v.camera.yaw = 2.2;
  v.camera.pitch = -0.12;
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/shot_trees.png' });
console.log('trees shot ok');

// gameplay simulation: walk forward + shoot balls + spawn pyramid
const play = await page.evaluate(async () => {
  const v = window.__vertex;
  v.input.locked = true;
  v.input.keys.add("KeyW");
  const startZ = v.player.position[2];
  // shoot 3 balls at the tower
  for (let i = 0; i < 3; i++) v.props.shootBall(v.camera.position, v.camera.forward);
  v.props.spawnPyramid(-20, -20);
  const bodiesBefore = v.world.bodies.length;
  await new Promise(r => setTimeout(r, 5000));
  v.input.keys.delete("KeyW");
  const walked = startZ - v.player.position[2];
  const groundY = v.terrain.heightAt(v.player.position[0], v.player.position[2]);
  const sunk = v.player.position[1] < groundY - 0.5;
  let nanBodies = 0;
  for (const b of v.world.bodies) if (!Number.isFinite(b.position[1])) nanBodies++;
  return { walked: +walked.toFixed(2), sunk, nanBodies, bodiesBefore, bodiesAfter: v.world.bodies.length, py: +v.player.position[1].toFixed(2), gy: +groundY.toFixed(2) };
});
console.log("gameplay sim:", JSON.stringify(play));

// wrecking ball shot
await page.evaluate(() => {
  const v = window.__vertex;
  const ball = v.world.bodies.find(b => b.name === 'wreckingball');
  const t = v.terrain.heightAt(14, 10);
  v.camera.position[0] = ball.position[0] - 8;
  v.camera.position[1] = t + 3;
  v.camera.position[2] = ball.position[2] - 8;
  v.camera.yaw = Math.atan2(-(ball.position[0] - v.camera.position[0]), -(ball.position[2] - v.camera.position[2]));
  v.camera.pitch = -0.1;
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/shot_wreck.png' });
console.log('wreck shot ok');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
server.close();
const okMotion = motion > 0.03;
console.log(okMotion && !errors.length ? 'BROWSER TEST PASSED' : 'BROWSER TEST FAILED');
process.exit(okMotion && !errors.length ? 0 : 1);
