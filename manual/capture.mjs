// Captures the screenshots used by the user manual and records element boxes for callouts.
// Needs: Chrome installed, the app served at http://localhost:8765 (python serve.py). No npm packages.
// Run: node manual/capture.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'img');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'http://localhost:8765/';
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), 'qdm-manual-chrome');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || expr);
  return r.result.value;
};

await cdp('Page.enable');
await cdp('Runtime.enable');

let n = 0;
async function open(hash, { width = 1536, height = 864, mobile = false } = {}) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
  await cdp('Page.navigate', { url: `${APP}?shot=${++n}#${hash}` });
  for (let i = 0; i < 100; i++) {
    if (await js(`document.readyState === 'complete' && !!document.querySelector('#tc-chart .drag')`)) break;
    await sleep(100);
  }
  await js('document.fonts.ready.then(() => true)');
  await sleep(400);
}
const act = async code => { await js(`(async () => { ${code} })()`); await sleep(400); };
const set = (sel, v) => `{ const el = document.querySelector('${sel}'); el.value = '${v}'; el.dispatchEvent(new Event('input', { bubbles: true })); }`;

async function rect(sel, pad = 0) {
  const r = await js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
  return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + 2 * pad, height: r.height + 2 * pad };
}
async function shot(name, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = { ...clip, scale: 1 };
  const { data } = await cdp('Page.captureScreenshot', params);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('saved', name);
}
const crop = async (name, sel, pad = 0) => shot(name, await rect(sel, pad));

const DEFAULT = 'd=5000&s=49&i=20&t=0:5,1000:4.8,2000:4.75';
const boxes = {};

// 1. Default state: whole screen plus the boxes for numbered callouts.
await open(DEFAULT);
await shot('overview');
for (const [k, sel] of Object.entries({
  sidebar: '.panel', dsi: '.field[data-key=D]', tiers: '.tiers', proposal: '.panel-proposal',
  actions: '.actions', hero: '.hero', stats: '.stats', chart1: '#tc-chart', chart2: '#price-chart', table: '.card-table',
})) boxes[k] = await rect(sel);
await crop('sidebar', '.panel');
await crop('proposal', '.panel-proposal', 6);
await crop('hero-good', '.hero', 6);
await crop('chart1-good', '.charts > .card:nth-child(1)', 6);
await crop('chart2-good', '.charts > .card:nth-child(2)', 6);
await crop('table-good', '.card-table', 6);
await crop('topline', '.topline', 6);

// 2. A proposal that costs more than the shop's best offer.
await open(`${DEFAULT}&q=1400&p=4.8`);
await crop('hero-bad', '.hero', 6);
await crop('chart1-bad', '.charts > .card:nth-child(1)', 6);
await crop('chart2-bad', '.charts > .card:nth-child(2)', 6);
await crop('table-bad', '.card-table', 6);

// 3. A lower price than the shop offers, at the suggested lot.
await open(`${DEFAULT}&q=714&p=4.7`);
await crop('hero-lowprice', '.hero', 6);

// 4. Lot too small for any price to pay off.
await open(`${DEFAULT}&q=5&p=4.8`);
await crop('hero-nobe', '.hero', 6);
await crop('stats-nobe', '.stats', 6);

// 5. All three tier statuses in one table.
await open('d=5000&s=49&i=20&t=0:5,500:4.9,1000:4.8');
await crop('table-statuses', '.card-table', 6);
await crop('chart1-statuses', '.charts > .card:nth-child(1)', 6);

// 6. One price tier only.
await open('d=5000&s=49&i=11&t=0:5&q=1100&p=5');
await crop('chart1-onetier', '.charts > .card:nth-child(1)', 6);

// 7. Input errors.
await open(DEFAULT);
await act(set('#D-num', '') + set('#tier-rows tr:nth-child(2) input[type=number]', '0'));
await crop('errors', '.panel');

// 8. Copy-link feedback.
await open(DEFAULT);
await act(`document.getElementById('copy-link').textContent = 'คัดลอกแล้ว';`);
await crop('copied', '.actions', 8);

// 9. Phone width.
await open(DEFAULT, { width: 390, height: 844, mobile: true });
await act(`window.scrollTo(0, document.querySelector('.dash').offsetTop);`);
await shot('mobile');

writeFileSync(join(OUT, 'boxes.json'), JSON.stringify({ viewport: { width: 1536, height: 864 }, boxes }, null, 2));
ws.close();
chrome.kill();
