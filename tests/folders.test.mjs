import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/db.mjs';
import { JsonStore } from '../server/fs-store.mjs';
import { manageFolders, moveFolderIcons } from '../server/folders.mjs';
import { generateIconfontJs } from '../server/core.mjs';

for (const Driver of [Store, JsonStore]) test(`${Driver.name}: folders preserve builds, validate moves and delete atomically`, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iconfamily-folders-'));
  let store = new Driver(dir);
  try {
    store.seedAdmin('admin', 'test-password');
    const project = store.createProject({ name: 'Folders', prefix: 'folders', ownerId: 1 });
    const second = store.createProject({ name: 'Other', prefix: 'other', ownerId: 1 });
    const makeIcon = (name, projectId = project.id) => store.createIcon({ projectId, name, slug: name, sourceHash: name, svg: '<svg viewBox="0 0 1024 1024"><path d="M0 0H100V100Z"/></svg>' });
    const rootIcon = makeIcon('root'), nestedIcon = makeIcon('nested'), sibling = makeIcon('sibling');
    const foreign = makeIcon('foreign', second.id);
    const build = () => generateIconfontJs(store.projectById(project.id), store.listIcons(project.id));
    const before = build();
    const parent = manageFolders(store, project.id, 'POST', undefined, { name: 'Parent' }).folder;
    const child = manageFolders(store, project.id, 'POST', undefined, { name: 'Child', parentId: parent.id }).folder;
    const target = manageFolders(store, second.id, 'POST', undefined, { name: 'Other folder' }).folder;
    assert.throws(() => manageFolders(store, project.id, 'POST', undefined, { name: 'parent' }), /已存在/);
    assert.throws(() => manageFolders(store, project.id, 'PATCH', parent.id, { parentId: child.id }), /下级目录/);
    assert.throws(() => moveFolderIcons(store, project.id, { iconIds: [rootIcon.id, foreign.id], folderId: parent.id }), /不属于/);
    assert.equal(store.iconById(rootIcon.id).folder_id, null);
    assert.throws(() => moveFolderIcons(store, project.id, { iconIds: [nestedIcon.id], folderId: target.id }), /不存在/);
    moveFolderIcons(store, project.id, { iconIds: [nestedIcon.id], folderId: child.id });
    moveFolderIcons(store, project.id, { iconIds: [sibling.id], folderId: parent.id });
    manageFolders(store, project.id, 'PATCH', parent.id, { name: 'Renamed' });
    assert.equal(build(), before);
    store.close(); store = new Driver(dir);
    assert.equal(store.iconById(nestedIcon.id).folder_id, child.id);
    const removed = manageFolders(store, project.id, 'DELETE', parent.id, {});
    assert.deepEqual(new Set(removed.removedIconIds), new Set([nestedIcon.id, sibling.id]));
    assert.equal(store.iconById(nestedIcon.id).status, 'deleted');
    assert.equal(store.listIcons(project.id).length, 1);
    assert.equal(store.listIcons(second.id).length, 1);
    assert.notEqual(build(), before);
    assert.equal(store.projectById(project.id).settings.folders.length, 0);
    if (Driver === Store) {
      store.db.exec('ALTER TABLE icons DROP COLUMN folder_id');
      store.close(); store = new Store(dir);
      assert.equal(store.iconById(rootIcon.id).folder_id, null);
    }
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
