import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = await mkdtemp(path.join(os.tmpdir(), 'iconfamily-runtime-'));
const env = { ...process.env, DATA_DIR: data, HOST: '127.0.0.1', STORAGE_DRIVER: 'fs', ADMIN_PASSWORD: 'runtime-check-password' };

async function waitFor(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Process exited: ${child.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stop(child) {
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
  await exited;
}

const release = path.join(root, 'release');
const manifest = JSON.parse(await readFile(path.join(release, 'package.json'), 'utf8'));
assert(manifest.dependencies?.svg2ttf);
const production = spawn(process.execPath, ['--use-system-ca', 'server/index.mjs'], { cwd: release, env: { ...env, PORT: '3111' }, windowsHide: true, stdio: 'pipe' });
production.stdout.resume(); production.stderr.resume();
try {
  await waitFor('http://127.0.0.1:3111/api/health', production);
  const html = await (await fetch('http://127.0.0.1:3111/')).text();
  assert.match(html, /id="root"/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert(assets.length > 0);
  for (const asset of assets) assert.equal((await fetch(`http://127.0.0.1:3111${asset}`)).status, 200);
  const fontModule = await import(new URL('../release/server/ttf.mjs', import.meta.url));
  assert.equal(fontModule.generateIconfontTtf({ id: 1 }, []).readUInt32BE(0), 0x00010000);
  const login = await fetch('http://127.0.0.1:3111/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const created = await fetch('http://127.0.0.1:3111/api/projects', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Runtime font', prefix: 'runtime' }) });
  const { project } = await created.json();
  const url = `http://127.0.0.1:3111/api/projects/${project.id}/ttf`;
  const responses = await Promise.all([fetch(url), fetch(url)]);
  for (const response of responses) assert.equal(response.status, 200);
  const original = Buffer.from(await responses[0].arrayBuffer());
  assert.equal(original.readUInt32BE(0), 0x00010000);
  const cached = path.join(data, 'artifacts', String(project.id), 'latest.ttf');
  await unlink(cached);
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), original, 'missing TTF is rebuilt');
  await writeFile(cached, 'corrupt font');
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), original, 'corrupt TTF is rebuilt');
  console.log('Standalone release: HTML, compiled assets, API and TTF cache recovery passed.');
} finally { await stop(production); }

assert(process.env.npm_execpath, 'Run using npm run test:runtime');
const development = spawn(process.execPath, [process.env.npm_execpath, 'run', 'dev'], { cwd: root, env: { ...env, PORT: '3112' }, windowsHide: true, stdio: 'pipe' });
development.stdout.resume(); development.stderr.resume();
try {
  const response = await waitFor('http://127.0.0.1:5173/api/health', development);
  assert.equal((await response.json()).service, 'iconfamily');
  const html = await (await fetch('http://127.0.0.1:5173/')).text();
  assert.match(html, /@vite\/client/);
  assert.equal((await fetch('http://127.0.0.1:5173/src/main.tsx')).status, 200);
  console.log('Unified development: Vite, TypeScript transform and API proxy passed.');
} finally { await stop(development); }
