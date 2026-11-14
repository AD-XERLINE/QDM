// Prints manual/manual.html to manual/QDM-Negotiator-Manual.pdf with headless Chrome. No npm packages.
// Needs the project served at http://localhost:8765 (python serve.py). Run: node manual/build-pdf.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:8765/manual/manual.html';
const PORT = 9334;
const profile = join(tmpdir(), 'qdm-manual-pdf');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; }
  catch { /* not up yet */ }
  if (!wsUrl) await sleep(200);
}
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const js = async e => (await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.value;

await cdp('Page.enable');
await cdp('Page.navigate', { url: URL });
for (let i = 0; i < 100; i++) { if (await js(`document.readyState === 'complete'`)) break; await sleep(100); }
await js(`Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))]).then(() => true)`);
await sleep(500);
const { data } = await cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
const out = join(HERE, 'QDM-Negotiator-Manual.pdf');
writeFileSync(out, Buffer.from(data, 'base64'));
console.log('saved', out);
ws.close();
chrome.kill();
