import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/db.mjs';
import { JsonStore } from '../server/fs-store.mjs';

for (const Driver of [Store, JsonStore]) {
  test(`${Driver.name}: password verification, reset, session revocation and persistence`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'iconfamily-password-'));
    let store = new Driver(directory);
    try {
      store.seedAdmin('admin', 'original');
      const user = store.authenticate('admin', 'original');
      const session = store.createSession(user.id);
      assert.equal(store.changePassword(user.id, 'changed', 'incorrect'), false);
      assert.ok(store.userBySession(session.token));
      assert.equal(store.changePassword(user.id, 'changed', 'original'), true);
      assert.equal(store.userBySession(session.token), null);
      assert.equal(store.authenticate('admin', 'original'), null);
      assert.ok(store.authenticate('admin', 'changed'));
      assert.equal(store.changePassword(user.id, 'reset-password'), true);
      store.close();
      store = new Driver(directory);
      assert.ok(store.authenticate('admin', 'reset-password'));
      const deleted = store.createUser({ username: 'deleted', password: 'password' });
      store.deleteUser(deleted.id);
      assert.equal(store.changePassword(deleted.id, 'new-password'), false);
    } finally {
      store.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}
