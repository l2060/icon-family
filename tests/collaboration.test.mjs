import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/db.mjs';
import { JsonStore } from '../server/fs-store.mjs';

for (const Driver of [Store, JsonStore]) {
  test(`${Driver.name}: persistent collaboration and revocation`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'iconfamily-collaboration-'));
    let store = new Driver(directory);
    try {
      store.seedAdmin('admin', 'password');
      const admin = store.authenticate('admin', 'password');
      const member = store.createUser({ username: 'member', password: 'password' });
      const project = store.createProject({ name: 'Shared', prefix: 'shared', ownerId: admin.id });
      assert.equal(store.listProjects(member).length, 0);
      store.updateProject(project.id, { settings: { collaboratorIds: [member.id], jsFilename: 'shared.js' } });
      store.close();
      store = new Driver(directory);
      assert.equal(store.listProjects(member)[0].settings.jsFilename, 'shared.js');
      store.updateProject(project.id, { settings: { collaboratorIds: [] } });
      assert.equal(store.listProjects(member).length, 0);
      assert.equal(store.listProjects(admin).length, 1);
      store.updateProject(project.id, { settings: { everyoneCanEdit: true, collaboratorIds: [] } });
      store.close();
      store = new Driver(directory);
      assert.equal(store.listProjects(member).length, 1);
      store.updateProject(project.id, { settings: { everyoneCanEdit: false, collaboratorIds: [] } });
      assert.equal(store.listProjects(member).length, 0);
    } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
  });
}
