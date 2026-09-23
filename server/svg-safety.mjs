// Deliberately accept only a static SVG subset. Rebuild every tag and attribute;
// no uploaded markup, CSS or JavaScript is executed by this parser.
const tags = new Set('svg g defs symbol path rect circle ellipse line polyline polygon use clipPath mask linearGradient radialGradient stop title desc'.split(' '));
const attributes = new Set('id viewBox xmlns xmlns:xlink x y x1 y1 x2 y2 cx cy r rx ry width height d points transform fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset fill-rule clip-rule fill-opacity stroke-opacity opacity clip-path mask gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity fx fy href xlink:href preserveAspectRatio vector-effect'.split(' '));
const styles = new Set('fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset fill-rule clip-rule fill-opacity stroke-opacity opacity stop-color stop-opacity'.split(' '));
const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (!n || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new Error('SVG 实体无效');
      return String.fromCodePoint(n);
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
  });
}
function safeValue(name, value) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('SVG 属性无效');
  if (name === 'href' || name === 'xlink:href') {
    if (!/^#[\w.-]+$/.test(value)) throw new Error('SVG 不允许外部引用');
  }
  if (/url\s*\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(value)) throw new Error('SVG 不允许外部引用');
  if (/javascript\s*:|data\s*:|expression\s*\(|@import|\\/i.test(value)) throw new Error('SVG 包含不安全内容');
  return `${name}="${escape(value)}"`;
}
export function validateStaticSvg(input) {
  if (typeof input !== 'string' || input.length > 2 * 1024 * 1024) throw new Error('SVG 文件无效或超过 2 MB');
  const text = input.trim().replace(/^<\?xml\s[^?]*\?>\s*/i, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const output = [];
  let cursor = 0, roots = 0, count = 0;
  const token = /<[^<>]*>|[^<]+/gy;
  while (cursor < text.length) {
    token.lastIndex = cursor;
    const match = token.exec(text);
    if (!match || ++count > 50000) throw new Error('SVG 结构无效或过于复杂');
    cursor = token.lastIndex;
    const part = match[0];
    if (!part.startsWith('<')) {
      if (part.trim() && !['title', 'desc'].includes(stack.at(-1))) throw new Error('SVG 包含无效文本');
      output.push(escape(decode(part))); continue;
    }
    const end = /^<\/([\w:-]+)\s*>$/.exec(part);
    if (end) {
      if (stack.pop() !== end[1]) throw new Error('SVG 标签不匹配');
      output.push(part); continue;
    }
    const start = /^<([\w:-]+)(\s[\s\S]*?)?\s*(\/?)>$/.exec(part);
    if (!start || !tags.has(start[1])) throw new Error('SVG 包含不支持或不安全的元素');
    const name = start[1];
    if (!stack.length && (name !== 'svg' || roots++)) throw new Error('SVG 必须有唯一根元素');
    if (stack.length > 64) throw new Error('SVG 嵌套过深');
    let rest = (start[2] || '').trim();
    if (rest.endsWith('/')) rest = rest.slice(0, -1).trim();
    const attrs = [], seen = new Set();
    while (rest) {
      const attr = /^([\w:-]+)\s*=\s*("[^"]*"|'[^']*')\s*/.exec(rest);
      if (!attr || seen.has(attr[1])) throw new Error('SVG 属性格式无效');
      const key = attr[1], value = decode(attr[2].slice(1, -1));
      seen.add(key); rest = rest.slice(attr[0].length);
      if (/^on/i.test(key)) throw new Error('SVG 不允许事件处理器');
      if (key === 'style') {
        for (const declaration of value.split(';').filter((item) => item.trim())) {
          const colon = declaration.indexOf(':');
          const property = declaration.slice(0, colon).trim().toLowerCase();
          const val = declaration.slice(colon + 1).trim();
          safeValue(property, val);
          if (styles.has(property)) attrs.push(safeValue(property, val));
        }
      } else if (attributes.has(key)) attrs.push(safeValue(key, value));
    }
    const selfClosing = /\/>$/.test(part);
    output.push(`<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClosing ? '/' : ''}>`);
    if (!selfClosing) stack.push(name);
  }
  if (stack.length || roots !== 1) throw new Error('SVG 结构不完整');
  return output.join('');
}
