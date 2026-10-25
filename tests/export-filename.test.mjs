import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExportFilename, exportFilename } from '../server/export-filename.mjs';

test('shared export names accept either extension and preserve existing settings', () => {
  for (const value of ['team-icons', 'team-icons.js', 'team-icons.ttf', ' team-icons.TTF ']) {
    const jsFilename = normalizeExportFilename(value);
    assert.equal(jsFilename, 'team-icons.js');
    assert.equal(exportFilename({ settings: { jsFilename } }, 'ttf'), 'team-icons.ttf');
    assert.equal(exportFilename({ settings: { jsFilename } }, 'js'), 'team-icons.js');
  }
  assert.equal(exportFilename({ settings: { jsFilename: 'legacy.js' } }, 'ttf'), 'legacy.ttf');
  assert.equal(exportFilename({ settings: {} }, 'ttf'), 'iconfont.ttf');
  assert.equal(normalizeExportFilename(''), '');
  for (const value of ['../bad.js', 'bad\r\n.ttf', 'bad/name', {}, false]) {
    assert.throws(() => normalizeExportFilename(value), { statusCode: 400 });
  }
});
