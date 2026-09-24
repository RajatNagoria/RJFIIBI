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
  headless: 'shell', protocolTimeout: 300000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => window.__vertex.hud.setLocked(true));

// domino topple: fire a ball straight down the domino line
const domino = await page.evaluate(async () => {
  const v = window.__vertex;
  const doms = v.world.bodies.filter(b => b.name === 'domino');
  const d0 = doms[0];
  const dN = doms[doms.length - 1];
  // fire a fast ball down the line from behind the first domino
  const dir = [dN.position[0] - d0.position[0], 0, dN.position[2] - d0.position[2]];
  const len = Math.hypot(dir[0], dir[2]);
  dir[0] /= len; dir[2] /= len;
  const start = [d0.position[0] - dir[0] * 6, d0.position[1] + 0.4, d0.position[2] - dir[2] * 6];
  const ball = v.props.shootBall(start, dir);
  ball.velocity[1] = 1;
  await new Promise(r => setTimeout(r, 6000));
  // count toppled dominoes (y dropped or tilted a lot)
  let toppled = 0;
  for (const d of doms) {
    if (Math.abs(d.orientation[3]) < 0.85) toppled++;
  }
  return { total: doms.length, toppled };
});
console.log('domino topple:', JSON.stringify(domino));

// pyramid stability after 8s
const pyr = await page.evaluate(() => {
  const v = window.__vertex;
  const crates = v.world.bodies.filter(b => b.name === 'crate');
  const ys = crates.map(b => +b.position[1].toFixed(1));
  return { count: crates.length, maxY: Math.max(...ys), sample: ys.slice(0, 6) };
});
console.log('crates after 8s:', JSON.stringify(pyr));

await page.screenshot({ path: '/tmp/final_domino.png' });

// beauty shot: vista over the lake toward spawn props
await page.evaluate(() => {
  const v = window.__vertex;
  v.camera.position[0] = -30; v.camera.position[1] = 16; v.camera.position[2] = 26;
  v.camera.yaw = Math.atan2(-(0 - -30), -(0 - 26));
  v.camera.pitch = -0.22;
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/final_beauty.png' });
console.log('shots done, errors:', errors.length ? errors : 'none');
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
