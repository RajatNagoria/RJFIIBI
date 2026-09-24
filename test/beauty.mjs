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
const browser = await puppeteer.launch({ headless: 'shell', protocolTimeout: 300000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => window.__vertex.hud.setLocked(true));

// vantage: spawn plateau view
await page.evaluate(() => {
  const v = window.__vertex;
  v.camera.position[0] = 3; v.camera.position[1] = 8; v.camera.position[2] = 14;
  v.camera.yaw = Math.atan2(-(-8 - 3), -(-12 - 14));
  v.camera.pitch = -0.18;
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/workspace/docs/shot_spawn.png' });

// wrecking ball action
await page.evaluate(() => {
  const v = window.__vertex;
  const ball = v.world.bodies.find(b => b.name === 'wreckingball');
  const t = v.terrain.heightAt(14, 10);
  v.camera.position[0] = ball.position[0] - 3;
  v.camera.position[1] = t + 10;
  v.camera.position[2] = ball.position[2] - 12;
  v.camera.yaw = Math.atan2(-(ball.position[0] - v.camera.position[0]), -(ball.position[2] - v.camera.position[2]));
  v.camera.pitch = -0.12;
});
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: '/workspace/docs/shot_wrecking.png' });
console.log('done');
await browser.close();
server.close();
