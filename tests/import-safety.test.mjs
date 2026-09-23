import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { sanitizeSvg, parseIconfontJs, generateIconfontJs, parseIconfontZip } from '../server/core.mjs';

function zip(name, content, declaredSize = content.length) {
  const filename = Buffer.from(name), compressed = zlib.deflateRawSync(content);
  const local = Buffer.alloc(30 + filename.length);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(filename.length, 26); filename.copy(local, 30);
  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(filename.length, 28); filename.copy(central, 46);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, end]);
}

test('ZIP extracts static JS but rejects traversal, invalid sizes and decompression bombs', () => {
  const js = Buffer.from('var s=\'<svg><symbol id="icon-a"><path d="M0 0H10V10Z"/></symbol></svg>\';');
  assert.equal(parseIconfontZip(zip('iconfont.js', js)).length, 1);
  assert.throws(() => parseIconfontZip(zip('../iconfont.js', js)));
  assert.throws(() => parseIconfontZip(zip('iconfont.js', js, 1)));
  assert.throws(() => parseIconfontZip(zip('iconfont.js', Buffer.alloc(21 * 1024 * 1024), 1)));
});

test('static SVG preserves geometry and gradients and rejects active content and malformed XML', () => {
  assert.match(
    sanitizeSvg(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><path d="M0 0H10V10Z" fill="url(#paint)"/></svg>',
    ).svg,
    /url\(#paint\)/,
  );
  for (const content of [
    '<script>alert(1)</script>',
    '<foreignObject><div>unsafe</div></foreignObject>',
    '<path onload="alert(1)"/>',
    '<use href="&#106;avascript:alert(1)"/>',
    '<use href="https://example.com/a.svg#x"/>',
    '<path fill="url(https://example.com/a)"/>',
    '<style>@import "https://example.com";</style>',
    '<animate attributeName="href"/>',
    '<path style="fill:u\\72l(https://example.com)"/>',
    '<path d=M0/>',
    '<g><path/></svg>',
  ])
    assert.throws(() => sanitizeSvg(`<svg>${content}</svg>`), content);
  for (const input of [
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>',
    '<svg/><svg/>',
    '<svg><path/>',
  ])
    assert.throws(() => sanitizeSvg(input));
  assert.doesNotMatch(
    sanitizeSvg('<svg style="width:1em;height:1em"><path style="fill:red" d="M0 0H10V10Z"/></svg>')
      .svg,
    /style=/,
  );
});

test('JS strings are parsed without execution, including escaped symbol markup', () => {
  const sprite =
    '<svg><symbol id="icon-test" viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></symbol></svg>';
  globalThis.importExecuted = false;
  const items = parseIconfontJs(
    `globalThis.importExecuted=true; var sprite=${JSON.stringify(sprite)};`,
  );
  assert.equal(globalThis.importExecuted, false);
  assert.equal(items.length, 1);
  assert.match(sanitizeSvg(items[0].svg).svg, /path/);
  assert.equal(parseIconfontJs(`var s='${sprite}';`).length, 1);
  const generated = generateIconfontJs({ name: 'Round trip', prefix: 'round', revision: 1 }, [{ slug: 'test', name: 'Test', svg: '<svg><path d="M0 0H10V10Z"/></svg>' }]);
  assert.equal(parseIconfontJs(generated).length, 1);
  assert.throws(() => parseIconfontJs('alert(1)'));
  delete globalThis.importExecuted;
});
