import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'iconfamily-e2e-'));
process.env.PORT = '3109';
process.env.HOST = '127.0.0.1';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.STORAGE_DRIVER = 'fs';
await import('../server/index.mjs');
