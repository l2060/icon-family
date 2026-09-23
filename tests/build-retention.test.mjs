import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/db.mjs';
import { JsonStore } from '../server/fs-store.mjs';
import { pruneBuildHistory } from '../server/build-retention.mjs';

for (const Driver of [Store, JsonStore]) {
  test(`${Driver.name}: retain ten builds and clean old files without losing published download`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iconfamily-build-retention-'));
    let store = new Driver(root);
    try {
      store.seedAdmin('admin', 'test-password');
      const project = store.createProject({ name: 'Builds', prefix: 'builds', ownerId: 1 });
      const other = store.createProject({ name: 'Other', prefix: 'other', ownerId: 1 });
      const artifacts = path.join(root, 'artifacts');
      const directory = path.join(artifacts, String(project.id));
      fs.mkdirSync(directory, { recursive: true });
      for (let version = 1; version <= 25; version++) {
        const build = store.createBuild(project.id, 1, version);
        const artifactPath = path.join(directory, `iconfont-v${version}.js`);
        fs.writeFileSync(artifactPath, `version ${version}`);
        store.finishBuild(build.id, { status: 'success', artifactPath });
        store.publishBuild(project.id, build.id);
      }
      store.createBuild(other.id, 1, 1);
      fs.writeFileSync(path.join(directory, 'latest.js'), 'version 25');
      fs.writeFileSync(path.join(directory, 'notes.txt'), 'keep');
      pruneBuildHistory(store, artifacts, project.id);
      assert.deepEqual(store.listBuilds(project.id, null).map(build => build.version), [25,24,23,22,21,20,19,18,17,16]);
      assert.equal(fs.readdirSync(directory).filter(name => /^iconfont-v/.test(name)).length, 10);
      assert.equal(fs.readFileSync(path.join(directory, 'latest.js'), 'utf8'), 'version 25');
      assert.equal(fs.readFileSync(path.join(directory, 'notes.txt'), 'utf8'), 'keep');
      assert.equal(store.listBuilds(other.id).length, 1);
      for (let version = 26; version <= 40; version++) {
        const build = store.createBuild(project.id, 1, version);
        store.finishBuild(build.id, { status: 'failed', errorMessage: 'test' });
        pruneBuildHistory(store, artifacts, project.id);
      }
      assert.equal(store.listBuilds(project.id, null).length, 10);
      assert.equal(store.listBuilds(project.id)[0].version, 40);
      assert.equal(store.latestBuild(project.id).version, 25);
      assert.equal(fs.readFileSync(store.latestBuild(project.id).artifact_path, 'utf8'), 'version 25');
      // Missing files do not block cleanup; reruns and reopening are safe.
      pruneBuildHistory(store, artifacts, project.id);
      store.close();
      store = new Driver(root);
      assert.equal(store.listBuilds(project.id, null).length, 10);
      const build = store.createBuild(project.id, 1, 41);
      store.finishBuild(build.id, { status: 'success', artifactPath: path.join(directory, 'iconfont-v41.js') });
      store.publishBuild(project.id, build.id);
      pruneBuildHistory(store, artifacts, project.id);
      assert.equal(fs.existsSync(path.join(directory, 'iconfont-v25.js')), false);
      assert.equal(store.latestBuild(project.id).version, 41);
      assert.equal(store.listBuilds(project.id, null).length, 10);
    } finally {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
