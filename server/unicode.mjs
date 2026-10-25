export function parseCodepoint(value) {
  let n = value;
  if (typeof value === 'string') {
    const text = value.trim();
    n = /^(?:U\+|0x)[0-9a-f]+$/i.test(text) ? parseInt(text.replace(/^(U\+|0x)/i, ''), 16)
      : /^[0-9]+$/.test(text) ? Number(text) : /^[0-9a-f]+$/i.test(text) ? parseInt(text, 16) : NaN;
  }
  if (!Number.isInteger(n) || n < 0x20 || n > 0x10ffff || (n >= 0x7f && n <= 0x9f)
    || (n >= 0xd800 && n <= 0xdfff) || (n >= 0xfdd0 && n <= 0xfdef) || (n & 0xffff) >= 0xfffe) {
    throw Object.assign(new Error('Unicode 编码无效，请输入 U+E900 等有效编码'), { statusCode: 400 });
  }
  return n;
}

export function allocateCodepoint(icons, start = 0xe900) {
  const used = new Set(icons.map(icon => Number(icon.codepoint)));
  const ranges = [[0xe000, 0xf8ff], [0xf0000, 0xffffd], [0x100000, 0x10fffd]];
  const preferred = Number.isInteger(Number(start)) ? Number(start) : 0xe900;
  for (const [min, max] of ranges) {
    for (let n = Math.max(min, preferred >= min && preferred <= max ? preferred : min); n <= max; n++) {
      if (!used.has(n)) return n;
    }
  }
  throw Object.assign(new Error('项目 Unicode 私用区编码已用完'), { statusCode: 400 });
}

export function uniqueCodepoint(icons, value, id) {
  const n = parseCodepoint(value);
  if (icons.some(icon => Number(icon.id) !== Number(id) && Number(icon.codepoint) === n)) {
    throw Object.assign(new Error('Unicode 编码已被当前项目的其他图标占用'), { statusCode: 409 });
  }
  return n;
}

// Keep valid existing assignments, including deleted icons, and repair only
// missing/invalid/duplicate values. Allocation never steals a later icon's value.
export function repairCodepoints(icons) {
  const seen = new Set();
  const reserved = icons.map(icon => {
    try { return { codepoint: parseCodepoint(icon.codepoint) }; } catch { return { codepoint: null }; }
  });
  const changes = [];
  for (const icon of [...icons].sort((a, b) => a.id - b.id)) {
    let n;
    try { n = parseCodepoint(icon.codepoint); } catch {}
    if (n === undefined || seen.has(n)) {
      n = allocateCodepoint(reserved);
      reserved.push({ codepoint: n });
    }
    seen.add(n);
    if (n !== icon.codepoint) changes.push({ id: icon.id, codepoint: n });
  }
  return changes;
}
