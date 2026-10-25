import { DOMParser } from '@xmldom/xmldom';
import { Path2D, DOMMatrix, PathOp, FillType, StrokeCap, StrokeJoin } from '@napi-rs/canvas';
import svg2ttf from 'svg2ttf';
import { validateStaticSvg } from './svg-safety.mjs';
import { parseCodepoint } from './unicode.mjs';

const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const numbers = value => (String(value).match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || []).map(Number);

function transform(value) {
  let matrix = new DOMMatrix();
  const pattern = /([a-z]+)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = pattern.exec(value || ''))) {
    const n = numbers(match[2]);
    let next;
    switch (match[1]) {
      case 'matrix': if (n.length === 6) next = new DOMMatrix(n); break;
      case 'translate': next = new DOMMatrix().translate(n[0], n[1] || 0); break;
      case 'scale': next = new DOMMatrix().scale(n[0], n[1] ?? n[0]); break;
      case 'rotate': next = new DOMMatrix().translate(n[1] || 0, n[2] || 0).rotate(n[0]).translate(-(n[1] || 0), -(n[2] || 0)); break;
      case 'skewX': next = new DOMMatrix([1, 0, Math.tan(n[0] * Math.PI / 180), 1, 0, 0]); break;
      case 'skewY': next = new DOMMatrix([1, Math.tan(n[0] * Math.PI / 180), 0, 1, 0, 0]); break;
    }
    if (!next || ![next.a, next.b, next.c, next.d, next.e, next.f].every(Number.isFinite)) throw new Error('SVG 变换无效');
    matrix = matrix.multiply(next);
  }
  if (String(value || '').replace(pattern, '').replace(/[\s,]/g, '')) throw new Error('SVG 变换不受支持');
  return matrix;
}

function shape(node) {
  const n = (key, fallback = 0) => {
    if (!node.hasAttribute(key)) return fallback;
    const value = node.getAttribute(key);
    if (!/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i.test(value)) throw new Error(`不支持 ${key}="${value}" 的长度单位`);
    return parseFloat(value);
  };
  const p = new Path2D();
  switch (node.tagName) {
    case 'path': return new Path2D(node.getAttribute('d') || '');
    case 'rect': {
      const w = n('width'), h = n('height'), rx = Math.min(n('rx', n('ry')), w / 2), ry = Math.min(n('ry', n('rx')), h / 2);
      if (w > 0 && h > 0) p.roundRect(n('x'), n('y'), w, h, { x: Math.max(0, rx), y: Math.max(0, ry) });
      break;
    }
    case 'circle': case 'ellipse': {
      const rx = n(node.tagName === 'circle' ? 'r' : 'rx'), ry = n(node.tagName === 'circle' ? 'r' : 'ry');
      if (rx > 0 && ry > 0) { p.ellipse(n('cx'), n('cy'), rx, ry, 0, 0, 2 * Math.PI); p.closePath(); }
      break;
    }
    case 'line': p.moveTo(n('x1'), n('y1')); p.lineTo(n('x2'), n('y2')); break;
    case 'polygon': case 'polyline': {
      const pts = numbers(node.getAttribute('points'));
      if (pts.length % 2) throw new Error('SVG 顶点无效');
      for (let i = 0; i < pts.length; i += 2) i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]);
      if (node.tagName === 'polygon') p.closePath();
      break;
    }
    default: return null;
  }
  return p;
}

/** Flatten painted shapes to a single monochrome outline, including strokes. */
export function monochromePath(svg) {
  const document = new DOMParser().parseFromString(validateStaticSvg(svg), 'image/svg+xml');
  const root = document.documentElement;
  const vb = numbers(root.getAttribute('viewBox'));
  if (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0) throw new Error('SVG viewBox 无效');
  let visits = 0;
  function visit(node, parentStyle = {}, stack = []) {
    if (++visits > 50000 || stack.length > 64) throw new Error('SVG 引用过于复杂或存在循环');
    const style = { ...parentStyle };
    for (const key of ['fill', 'stroke', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset']) {
      if (node.hasAttribute(key)) style[key] = node.getAttribute(key);
    }
    if (Number(node.getAttribute('opacity') || 1) === 0) return new Path2D();
    if (node.hasAttribute('mask') || node.hasAttribute('clip-path')) throw new Error('TTF 暂不支持蒙版或裁剪，请先将其转换为路径');
    if (node.getAttribute('vector-effect') === 'non-scaling-stroke') throw new Error('TTF 暂不支持非缩放描边，请先将描边转换为路径');
    let result = new Path2D();
    const p = shape(node);
    if (p) {
      if ((style.fill || 'black') !== 'none' && Number(style['fill-opacity'] ?? 1) !== 0) {
        p.setFillType(style['fill-rule'] === 'evenodd' ? FillType.EvenOdd : FillType.Winding);
        result = new Path2D(p).simplify().asWinding();
      }
      if (style.stroke && style.stroke !== 'none' && Number(style['stroke-opacity'] ?? 1) !== 0) {
        let stroke = new Path2D(p);
        if (style['stroke-dasharray'] && style['stroke-dasharray'] !== 'none') {
          const dash = numbers(style['stroke-dasharray']);
          if (dash.length === 1) dash.push(dash[0]);
          if (dash.length !== 2 || dash.some(n => n < 0) || dash.every(n => n === 0)) throw new Error('TTF 暂不支持该虚线样式，请先将描边转换为路径');
          stroke = stroke.dash(dash[0], dash[1], Number(style['stroke-dashoffset'] || 0));
        }
        const width = Number(style['stroke-width'] ?? 1);
        if (!Number.isFinite(width) || width < 0) throw new Error('SVG 描边宽度无效');
        if (width > 0) {
          stroke = stroke.stroke({ width, miterLimit: Number(style['stroke-miterlimit'] || 4),
            cap: ({ round: StrokeCap.Round, square: StrokeCap.Square })[style['stroke-linecap']] ?? StrokeCap.Butt,
            join: ({ round: StrokeJoin.Round, bevel: StrokeJoin.Bevel })[style['stroke-linejoin']] ?? StrokeJoin.Miter });
          result = result.op(stroke, PathOp.Union);
        }
      }
    } else if (node.tagName === 'use') {
      const id = (node.getAttribute('href') || node.getAttribute('xlink:href') || '').slice(1);
      const ref = document.getElementById(id);
      if (!ref || stack.includes(ref)) throw new Error('SVG 引用无效或存在循环');
      if (ref.tagName === 'symbol' && ref.hasAttribute('viewBox')) throw new Error('TTF 暂不支持 symbol viewBox，请先展开引用');
      result = visit(ref, style, [...stack, ref]).transform(new DOMMatrix().translate(Number(node.getAttribute('x') || 0), Number(node.getAttribute('y') || 0)));
    } else if (['svg', 'g', 'symbol'].includes(node.tagName)) {
      if (node.tagName === 'svg' && node !== root) throw new Error('TTF 暂不支持嵌套 SVG，请先转换为路径');
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) result = result.op(visit(child, style, stack), PathOp.Union);
      }
    }
    return result.transform(transform(node.getAttribute('transform')));
  }
  const scale = 1024 / Math.max(vb[2], vb[3]);
  const matrix = new DOMMatrix([scale, 0, 0, -scale, (1024 - vb[2] * scale) / 2 - vb[0] * scale, (1024 + vb[3] * scale) / 2 + vb[1] * scale]);
  return visit(root).simplify().asWinding().transform(matrix).toSVGString();
}

export function generateIconfontTtf(project, icons) {
  const used = new Set();
  const glyphs = icons.filter(icon => !icon.status || icon.status === 'active').sort((a, b) => a.codepoint - b.codepoint).map(icon => {
    try {
      const codepoint = parseCodepoint(icon.codepoint);
      if (used.has(codepoint)) throw new Error('Unicode 编码重复');
      used.add(codepoint);
      const d = monochromePath(icon.svg);
      if (!d) throw new Error('转换后没有可用轮廓');
      return `<glyph glyph-name="${escapeXml(icon.slug)}" unicode="&#${codepoint};" horiz-adv-x="1024" d="${escapeXml(d)}"/>`;
    } catch (error) { throw new Error(`图标「${icon.name || icon.slug}」：${error.message}`); }
  });
  const font = `<svg xmlns="http://www.w3.org/2000/svg"><defs><font id="iconfamily-${project.id}" horiz-adv-x="1024"><font-face font-family="IconFamily-${project.id}" units-per-em="1024" ascent="1024" descent="0"/><missing-glyph horiz-adv-x="1024"/>${glyphs.join('')}</font></defs></svg>`;
  return Buffer.from(svg2ttf(font, { ts: 0 }).buffer);
}
