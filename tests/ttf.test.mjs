import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import { generateIconfontTtf, monochromePath } from '../server/ttf.mjs';
import { Store } from '../server/db.mjs';
import { JsonStore } from '../server/fs-store.mjs';

const svg = '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="red"/></svg>';
for (const Driver of [Store, JsonStore]) {
  test(`${Driver.name}: Unicode stays unique and stable across edits, deletion, restart and migration`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iconfamily-unicode-'));
    let store = new Driver(dir);
    try {
      store.seedAdmin('admin', 'test-password');
      const project = store.createProject({ name: 'Font', prefix: 'font', ownerId: 1 });
      const create = (slug, codepoint) => store.createIcon({ projectId: project.id, name: slug, slug, sourceHash: slug, svg, codepoint });
      const first = create('first'), second = create('second');
      assert.equal(first.codepoint, 0xe900);
      assert(Number.isInteger(store.nextCodepoint(project.id, 0xe900 + 0.5)));
      assert.notEqual(second.codepoint, first.codepoint);
      assert.throws(() => create('duplicate', first.codepoint), /占用/);
      assert.throws(() => store.updateIcon(second.id, { codepoint: 'U+E900' }), /占用/);
      for (const codepoint of [null, '', 'invalid', 0xd800, 0x110000, 12.5, true]) {
        assert.throws(() => store.updateIcon(second.id, { codepoint }), /无效/);
      }
      store.updateIcon(first.id, { name: 'Renamed' });
      assert.equal(store.iconById(first.id).codepoint, first.codepoint);
      store.updateIcon(second.id, { codepoint: 'U+F0000' });
      store.softDeleteIcon(first.id);
      const third = create('third');
      assert.notEqual(third.codepoint, first.codepoint);
      store.close(); store = new Driver(dir);
      assert.equal(store.iconById(second.id).codepoint, 0xf0000);
      // Simulate an old installation with missing and duplicate assignments.
      if (Driver === Store) {
        store.db.exec('DROP INDEX idx_icons_unicode');
        store.db.prepare('UPDATE icons SET codepoint=NULL WHERE id=?').run(first.id);
        store.db.prepare('UPDATE icons SET codepoint=? WHERE id=?').run(0xf0000, third.id);
      } else {
        store.state.icons.find(i => i.id === first.id).codepoint = null;
        store.state.icons.find(i => i.id === third.id).codepoint = 0xf0000;
        store.save();
      }
      store.close(); store = new Driver(dir);
      assert.equal(store.iconById(second.id).codepoint, 0xf0000);
      const codes = [first, second, third].map(i => store.iconById(i.id).codepoint);
      assert.equal(new Set(codes).size, 3);
      assert(codes.every(Number.isInteger));
      store.close(); store = new Driver(dir);
      assert.deepEqual([first, second, third].map(i => store.iconById(i.id).codepoint), codes);
    } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test('TTF loads as a real font, maps BMP and supplementary Unicode and preserves margins', () => {
  const font = generateIconfontTtf({ id: 901 }, [
    { name: 'Square', slug: 'square', svg, codepoint: 0xe900 },
    { name: 'Square2', slug: 'square2', svg, codepoint: 0xf0000 },
  ]);
  assert.equal(font.readUInt32BE(0), 0x00010000);
  assert.deepEqual(font, generateIconfontTtf({ id: 901 }, [
    { name: 'Square', slug: 'square', svg, codepoint: 0xe900 },
    { name: 'Square2', slug: 'square2', svg, codepoint: 0xf0000 },
  ]));
  const registered = GlobalFonts.register(font, 'IconFamilyTest');
  assert(registered);
  try {
    for (const codepoint of [0xe900, 0xf0000]) {
      const canvas = createCanvas(24, 24), context = canvas.getContext('2d');
      context.font = '24px IconFamilyTest';
      context.fillText(String.fromCodePoint(codepoint), 0, 24);
      const alpha = (x, y) => context.getImageData(x, y, 1, 1).data[3];
      assert.equal(alpha(12, 12), 255);
      assert.equal(alpha(0, 0), 0);
      assert.equal(alpha(23, 23), 0);
      assert.equal(context.measureText(String.fromCodePoint(codepoint)).width, 24);
    }
  } finally { GlobalFonts.remove(registered); }
});

test('monochrome conversion merges colors, expands strokes, preserves holes and transforms', () => {
  const outline = monochromePath('<svg viewBox="0 0 24 24"><g transform="translate(2 2)"><path fill="red" fill-rule="evenodd" d="M0 0H20V20H0Z M5 5H15V15H5Z"/><path fill="none" stroke="blue" stroke-width="2" d="M0 10H20"/></g></svg>');
  const canvas = createCanvas(1024, 1024), context = canvas.getContext('2d');
  context.fill(new Path2D(outline));
  const alpha = (x, y) => context.getImageData(x, y, 1, 1).data[3];
  assert.equal(alpha(512, 512), 255, 'stroke crosses the hole');
  assert.equal(alpha(512, 650), 0, 'hole remains above the stroke');
  assert.equal(alpha(130, 512), 255, 'filled ring remains');
  assert.equal(alpha(0, 0), 0, 'margin remains');
  assert.throws(() => generateIconfontTtf({ id: 1 }, [{ name: 'Masked', slug: 'mask', codepoint: 0xe900, svg: '<svg viewBox="0 0 24 24"><path mask="url(#mask)" d="M0 0H10V10Z"/></svg>' }]), /Masked.*蒙版/);
});
