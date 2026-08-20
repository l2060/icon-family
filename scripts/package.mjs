import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const checkOnly = process.argv.includes('--check');

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function check() {
  const required = ['package.json', 'README.md', 'server/index.mjs', 'server/core.mjs', 'server/db.mjs', 'server/fs-store.mjs', 'public/index.html', 'public/app.js', 'public/styles.css'];
  for (const file of required) if (!(await exists(path.join(root, file)))) throw new Error(`缺少打包文件：${file}`);
  for (const file of ['server/index.mjs', 'server/core.mjs', 'server/db.mjs', 'server/fs-store.mjs', 'public/app.js']) {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function collectFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await collectFiles(absolute, relative));
    else result.push({ name: relative.replace(/\\/g, '/'), data: await fs.readFile(absolute) });
  }
  return result;
}

function makeStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localParts.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}

async function packageRelease() {
  await check();
  if (checkOnly) {
    console.log('IconFamily package check passed.');
    return;
  }
  await fs.rm(release, { recursive: true, force: true });
  await fs.mkdir(release, { recursive: true });
  await fs.cp(path.join(root, 'server'), path.join(release, 'server'), { recursive: true });
  await fs.cp(path.join(root, 'public'), path.join(release, 'public'), { recursive: true });
  await fs.cp(path.join(root, 'scripts'), path.join(release, 'scripts'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(release, 'package.json'));
  await fs.copyFile(path.join(root, 'README.md'), path.join(release, 'README.md'));
  if (await exists(path.join(root, '.env.example'))) await fs.copyFile(path.join(root, '.env.example'), path.join(release, '.env.example'));
  await fs.writeFile(path.join(release, 'start.cmd'), '@echo off\r\nset PORT=3000\r\nnode --use-system-ca server\\index.mjs\r\n', 'utf8');
  await fs.writeFile(path.join(release, 'start.sh'), '#!/usr/bin/env sh\nPORT=${PORT:-3000} node --use-system-ca server/index.mjs\n', 'utf8');
  if (os.platform() !== 'win32') await fs.chmod(path.join(release, 'start.sh'), 0o755);

  const zip = path.join(root, `iconfamily-${JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version}.zip`);
  await fs.rm(zip, { force: true });
  await fs.writeFile(zip, makeStoredZip(await collectFiles(release)));
  console.log(`Release directory: ${release}`);
  console.log(`Release archive: ${zip}`);
}

packageRelease().catch((error) => { console.error(error.message); process.exitCode = 1; });
