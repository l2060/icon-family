import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { validateStaticSvg } from './svg-safety.mjs';

const DEFAULT_VIEWBOX = '0 0 1024 1024';
const VIEWPORT_SIZE = 1024;
const SAFE_NAME = /^[a-z0-9][a-z0-9_-]*$/i;

export function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function slugify(value, fallback = 'icon') {
  const text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return text || fallback;
}

export function validMachineName(value) {
  return SAFE_NAME.test(String(value ?? ''));
}

export function normalizePrefix(value) {
  const prefix = slugify(value, 'icon').replace(/^-+|-+$/g, '');
  return /^[a-z]/i.test(prefix) ? prefix.slice(0, 40) : `p-${prefix}`.slice(0, 40);
}

export function parseViewBox(value) {
  const numbers = String(value ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0) {
    return numbers.map((n) => Number(n.toFixed(4)));
  }
  return [0, 0, 1024, 1024];
}

export function viewBoxString(value) {
  return parseViewBox(value).join(' ');
}

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanAttributeQuotes(svg) {
  return svg.replace(/([\w:-]+)\s*=\s*(['"])([\s\S]*?)\2/g, (full, name, quote, value) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) return '';
    if (['href', 'xlink:href', 'src'].includes(lower)) {
      const decoded = decodeEntities(value.trim());
      if (decoded && !decoded.startsWith('#')) return '';
    }
    if (lower === 'style' && /url\s*\(|@import|expression\s*\(/i.test(value)) return '';
    return `${name}="${value.replace(/"/g, '&quot;')}"`;
  });
}

export function sanitizeSvg(input, options = {}) {
  const colorMode = options.colorMode ?? 'preserve';
  let svg = validateStaticSvg(input);
  if (!svg || !/<svg\b/i.test(svg)) throw new Error('未找到 SVG 根元素');

  svg = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(iframe|object|embed|audio|video|canvas|animate|set|animateTransform)\b[\s\S]*?(?:<\/\1\s*>|\/?>)/gi, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata\s*>/gi, '')
    .replace(/<!\[CDATA\[/gi, '')
    .replace(/\]\]>/gi, '');

  svg = cleanAttributeQuotes(svg);
  svg = svg.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(/\s{2,}/g, ' ').replace(/>\s+</g, '><').trim();

  const rootMatch = svg.match(/<svg\b([^>]*)>/i);
  if (!rootMatch) throw new Error('SVG 根元素无效');
  const rootAttrs = (rootMatch[1] ?? '').replace(/\/\s*$/, '');
  const viewBoxMatch = rootAttrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  const widthMatch = rootAttrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = rootAttrs.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  const viewBox = viewBoxString(viewBoxMatch?.[1] ?? DEFAULT_VIEWBOX);
  const rootWithoutSize = rootAttrs
    .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+viewBox\s*=\s*["'][^"']*["']/gi, '');
  const root = `<svg${rootWithoutSize} viewBox="${viewBox}">`;
  const start = svg.indexOf('>') + 1;
  const end = svg.toLowerCase().lastIndexOf('</svg>');
  let body = end >= start ? svg.slice(start, end) : svg.slice(start);
  body = body.replace(/\s+xmlns(?::[\w-]+)?\s*=\s*["'][^"']*["']/gi, '');

  if (colorMode === 'currentColor') {
    body = body.replace(/\s(fill|stroke)\s*=\s*(["'])((?!none\b)[^"']+)\2/gi, ' $1="currentColor"');
    body = body.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_, quote, style) => {
      const next = style
        .replace(/(fill|stroke)\s*:\s*[^;]+/gi, '$1:currentColor')
        .replace(/(background|color)\s*:\s*[^;]+/gi, '$1:currentColor');
      return ` style="${next}"`;
    });
  }

  const normalized = `${root}${body}</svg>`;
  return { svg: normalized, body, viewBox, width: widthMatch?.[1] ?? null, height: heightMatch?.[1] ?? null };
}

export function iconFromSvg({ name, svg, sourceType = 'upload', sourceMeta = null, colorMode = 'preserve' }) {
  const clean = sanitizeSvg(svg, { colorMode });
  if (!/<(?:path|rect|circle|ellipse|line|polyline|polygon|use)\b/.test(clean.body)) throw new Error('SVG 未包含可导入的图形');
  const normalized = normalizeToViewport(clean);
  const sourceName = String(name ?? 'icon').replace(/\.[^.]+$/, '');
  const slug = slugify(sourceName);
  return {
    name: sourceName,
    slug,
    sourceType,
    sourceMeta,
    sourceHash: hash(normalized.svg),
    svg: normalized.svg,
    body: normalized.body,
    viewBox: DEFAULT_VIEWBOX,
    colorMode,
  };
}

function numberText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(5)) : 0;
}

export function normalizeToViewport(clean) {
  const [x, y, width, height] = parseViewBox(clean.viewBox);
  const scale = Math.min(VIEWPORT_SIZE / width, VIEWPORT_SIZE / height);
  const translateX = (VIEWPORT_SIZE - width * scale) / 2 - x * scale;
  const translateY = (VIEWPORT_SIZE - height * scale) / 2 - y * scale;
  const isIdentity = Math.abs(scale - 1) < 0.00001 && Math.abs(translateX) < 0.00001 && Math.abs(translateY) < 0.00001;
  const body = isIdentity ? clean.body : `<g transform="translate(${numberText(translateX)} ${numberText(translateY)}) scale(${numberText(scale)})">${clean.body}</g>`;
  return { ...clean, body, viewBox: DEFAULT_VIEWBOX, svg: `<svg viewBox="${DEFAULT_VIEWBOX}">${body}</svg>` };
}

export function transformSvg(svg, transform = {}) {
  const clean = normalizeToViewport(sanitizeSvg(svg, { colorMode: 'preserve' }));
  const requestedScale = Number.isFinite(Number(transform.scale)) ? Number(transform.scale) : 1;
  const scale = Math.max(0.0001, requestedScale);
  const translateX = Number.isFinite(Number(transform.translateX)) ? Number(transform.translateX) : 0;
  const translateY = Number.isFinite(Number(transform.translateY)) ? Number(transform.translateY) : 0;
  const rotation = Number.isFinite(Number(transform.rotation)) ? Number(transform.rotation) : 0;
  const flipX = Number(transform.flipX) < 0 ? -1 : 1;
  const flipY = Number(transform.flipY) < 0 ? -1 : 1;
  // Apply scale/rotation/mirror around the viewport center instead of the
  // SVG origin (0, 0).  This keeps the artwork centered while it grows or
  // shrinks and makes API/batch transforms behave like the editor.
  const center = VIEWPORT_SIZE / 2;
  const transformText = `translate(${numberText(translateX)} ${numberText(translateY)}) translate(${center} ${center}) rotate(${numberText(rotation)}) scale(${numberText(scale * flipX)} ${numberText(scale * flipY)}) translate(${-center} ${-center})`;
  const body = `<g transform="${transformText}">${clean.body}</g>`;
  return { svg: `<svg viewBox="${DEFAULT_VIEWBOX}">${body}</svg>`, body, viewBox: DEFAULT_VIEWBOX };
}

const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];

function multiplyMatrix(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function applyMatrix(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function transformMatrix(value) {
  let matrix = [...IDENTITY_MATRIX];
  const source = String(value ?? '');
  for (const match of source.matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)) {
    const type = match[1].toLowerCase();
    const values = String(match[2]).match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)?.map(Number) || [];
    let next = [...IDENTITY_MATRIX];
    if (type === 'matrix' && values.length >= 6) next = values.slice(0, 6);
    else if (type === 'translate' && values.length >= 1) next = [1, 0, 0, 1, values[0], values[1] ?? 0];
    else if (type === 'scale' && values.length >= 1) next = [values[0], 0, 0, values[1] ?? values[0], 0, 0];
    else if (type === 'rotate' && values.length >= 1) {
      const radians = values[0] * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      next = [cosine, sine, -sine, cosine, 0, 0];
      if (values.length >= 3) {
        const cx = values[1];
        const cy = values[2];
        next = multiplyMatrix(multiplyMatrix([1, 0, 0, 1, cx, cy], next), [1, 0, 0, 1, -cx, -cy]);
      }
    } else if (type === 'skewx' && values.length >= 1) next = [1, 0, Math.tan(values[0] * Math.PI / 180), 1, 0, 0];
    else if (type === 'skewy' && values.length >= 1) next = [1, Math.tan(values[0] * Math.PI / 180), 0, 1, 0, 0];
    matrix = multiplyMatrix(matrix, next);
  }
  return matrix;
}

function numberList(value) {
  return String(value ?? '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)?.map(Number).filter(Number.isFinite) || [];
}

function angleBetween(ux, uy, vx, vy) {
  const denominator = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (!denominator) return 0;
  const cosine = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / denominator));
  const angle = Math.acos(cosine);
  return ux * vy - uy * vx < 0 ? -angle : angle;
}

function arcPoints(startX, startY, radiusX, radiusY, axisRotation, largeArc, sweep, endX, endY) {
  let rx = Math.abs(Number(radiusX));
  let ry = Math.abs(Number(radiusY));
  const x2 = Number(endX);
  const y2 = Number(endY);
  if (!rx || !ry || (Math.abs(startX - x2) < 0.000001 && Math.abs(startY - y2) < 0.000001)) return [[x2, y2]];

  const phi = Number(axisRotation || 0) * Math.PI / 180;
  const cosine = Math.cos(phi);
  const sine = Math.sin(phi);
  const halfX = (startX - x2) / 2;
  const halfY = (startY - y2) / 2;
  const xPrime = cosine * halfX + sine * halfY;
  const yPrime = -sine * halfX + cosine * halfY;
  const lambda = (xPrime * xPrime) / (rx * rx) + (yPrime * yPrime) / (ry * ry);
  if (lambda > 1) {
    const factor = Math.sqrt(lambda);
    rx *= factor;
    ry *= factor;
  }

  const radiusTerm = Math.max(0, ((rx * rx * ry * ry) - (rx * rx * yPrime * yPrime) - (ry * ry * xPrime * xPrime))
    / ((rx * rx * yPrime * yPrime) + (ry * ry * xPrime * xPrime)));
  const sign = Boolean(largeArc) === Boolean(sweep) ? -1 : 1;
  const coefficient = sign * Math.sqrt(radiusTerm);
  const centerPrimeX = coefficient * ((rx * yPrime) / ry);
  const centerPrimeY = coefficient * (-(ry * xPrime) / rx);
  const centerX = cosine * centerPrimeX - sine * centerPrimeY + (startX + x2) / 2;
  const centerY = sine * centerPrimeX + cosine * centerPrimeY + (startY + y2) / 2;
  const unitStartX = (xPrime - centerPrimeX) / rx;
  const unitStartY = (yPrime - centerPrimeY) / ry;
  const unitEndX = (-xPrime - centerPrimeX) / rx;
  const unitEndY = (-yPrime - centerPrimeY) / ry;
  const startAngle = angleBetween(1, 0, unitStartX, unitStartY);
  let deltaAngle = angleBetween(unitStartX, unitStartY, unitEndX, unitEndY);
  if (!sweep && deltaAngle > 0) deltaAngle -= Math.PI * 2;
  if (sweep && deltaAngle < 0) deltaAngle += Math.PI * 2;

  const result = [];
  const addAt = (angle) => {
    result.push([
      centerX + cosine * rx * Math.cos(angle) - sine * ry * Math.sin(angle),
      centerY + sine * rx * Math.cos(angle) + cosine * ry * Math.sin(angle),
    ]);
  };
  const onArc = (angle) => {
    let difference = angle - startAngle;
    if (deltaAngle >= 0) {
      while (difference < 0) difference += Math.PI * 2;
      return difference <= deltaAngle + 0.000001;
    }
    while (difference > 0) difference -= Math.PI * 2;
    return difference >= deltaAngle - 0.000001;
  };
  addAt(startAngle);
  addAt(startAngle + deltaAngle);
  const extrema = [
    Math.atan2(-sine * ry, cosine * rx),
    Math.atan2(cosine * ry, sine * rx),
  ];
  extrema.forEach((angle) => {
    if (onArc(angle)) addAt(angle);
    if (onArc(angle + Math.PI)) addAt(angle + Math.PI);
  });
  return result;
}

function pathPoints(value) {
  const tokens = [];
  const tokenPattern = /([a-zA-Z])|([-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?)/g;
  for (const match of String(value ?? '').matchAll(tokenPattern)) tokens.push(match[1] || Number(match[2]));
  const points = [];
  let index = 0;
  let command = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const add = (px, py) => { if (Number.isFinite(px) && Number.isFinite(py)) points.push([px, py]); };
  const take = () => (typeof tokens[index] === 'number' ? tokens[index++] : null);
  const pair = (relative) => {
    const px = take();
    const py = take();
    if (px === null || py === null) return null;
    return relative ? [x + px, y + py] : [px, py];
  };
  while (index < tokens.length) {
    if (typeof tokens[index] === 'string') command = tokens[index++];
    if (!command) break;
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'Z') {
      x = startX;
      y = startY;
      add(x, y);
      command = null;
      continue;
    }
    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const next = pair(relative);
      if (!next) { command = null; continue; }
      [x, y] = next;
      add(x, y);
      if (upper === 'M') { startX = x; startY = y; command = relative ? 'l' : 'L'; }
      continue;
    }
    if (upper === 'H') {
      const valueX = take();
      if (valueX === null) { command = null; continue; }
      x = relative ? x + valueX : valueX;
      add(x, y);
      continue;
    }
    if (upper === 'V') {
      const valueY = take();
      if (valueY === null) { command = null; continue; }
      y = relative ? y + valueY : valueY;
      add(x, y);
      continue;
    }
    if (upper === 'C') {
      const values = [take(), take(), take(), take(), take(), take()];
      if (values.some((value) => value === null)) { command = null; continue; }
      const [x1, y1, x2, y2, endX, endY] = values;
      const pointsToAdd = relative
        ? [[x + x1, y + y1], [x + x2, y + y2], [x + endX, y + endY]]
        : [[x1, y1], [x2, y2], [endX, endY]];
      pointsToAdd.forEach(([px, py]) => add(px, py));
      [x, y] = pointsToAdd[2];
      continue;
    }
    if (upper === 'S' || upper === 'Q') {
      const values = [take(), take(), take(), take()];
      if (values.some((value) => value === null)) { command = null; continue; }
      const [x1, y1, endX, endY] = values;
      const pointsToAdd = relative
        ? [[x + x1, y + y1], [x + endX, y + endY]]
        : [[x1, y1], [endX, endY]];
      pointsToAdd.forEach(([px, py]) => add(px, py));
      [x, y] = pointsToAdd[1];
      continue;
    }
    if (upper === 'A') {
      const values = [take(), take(), take(), take(), take(), take(), take()];
      if (values.some((value) => value === null)) { command = null; continue; }
      const [rx, ry, rotation, largeArc, sweep, endX, endY] = values;
      const next = relative ? [x + endX, y + endY] : [endX, endY];
      for (const [px, py] of arcPoints(x, y, rx, ry, rotation, largeArc !== 0, sweep !== 0, next[0], next[1])) add(px, py);
      [x, y] = next;
      continue;
    }
    // Unknown commands are ignored until the next command letter.
    command = null;
  }
  return points;
}

function primitivePoints(tagName, attributes) {
  const get = (name, fallback = 0) => {
    const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    const value = Number(match?.[1]);
    return Number.isFinite(value) ? value : fallback;
  };
  if (tagName === 'path') return pathPoints(attributes.match(/\bd\s*=\s*["']([^"']*)["']/i)?.[1] || '');
  if (tagName === 'rect') {
    const x = get('x');
    const y = get('y');
    const width = Math.max(0, get('width'));
    const height = Math.max(0, get('height'));
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  }
  if (tagName === 'circle') {
    const cx = get('cx');
    const cy = get('cy');
    const radius = Math.abs(get('r'));
    return [[cx - radius, cy - radius], [cx + radius, cy + radius]];
  }
  if (tagName === 'ellipse') {
    const cx = get('cx');
    const cy = get('cy');
    const rx = Math.abs(get('rx'));
    const ry = Math.abs(get('ry'));
    return [[cx - rx, cy - ry], [cx + rx, cy + ry]];
  }
  if (tagName === 'line') return [[get('x1'), get('y1')], [get('x2'), get('y2')]];
  if (tagName === 'polyline' || tagName === 'polygon') {
    const values = numberList(attributes.match(/\bpoints\s*=\s*["']([^"']*)["']/i)?.[1] || '');
    const points = [];
    for (let index = 0; index + 1 < values.length; index += 2) points.push([values[index], values[index + 1]]);
    return points;
  }
  return [];
}

export function svgContentBounds(svg) {
  const clean = sanitizeSvg(svg, { colorMode: 'preserve' });
  const points = [];
  const stack = [{ matrix: IDENTITY_MATRIX, hidden: false }];
  const body = clean.body;
  const tagPattern = /<\/?([a-z][\w:-]*)([^>]*)>/gi;
  const containers = new Set(['g', 'svg', 'defs', 'clippath', 'mask', 'pattern', 'marker', 'symbol']);
  const nonRenderingContainers = new Set(['defs', 'clippath', 'mask', 'pattern', 'marker']);
  for (const match of body.matchAll(tagPattern)) {
    const closing = /^<\//.test(match[0]);
    const tagName = match[1].toLowerCase();
    const attributes = match[2] || '';
    if (closing) {
      if (containers.has(tagName) && stack.length > 1) stack.pop();
      continue;
    }
    const local = transformMatrix(attributes.match(/\btransform\s*=\s*["']([^"']*)["']/i)?.[1] || '');
    const parent = stack[stack.length - 1];
    const current = multiplyMatrix(parent.matrix, local);
    if (containers.has(tagName)) {
      if (!/\/\s*>$/.test(match[0])) stack.push({ matrix: current, hidden: parent.hidden || nonRenderingContainers.has(tagName) });
      continue;
    }
    if (parent.hidden) continue;
    for (const [x, y] of primitivePoints(tagName, attributes)) {
      const point = applyMatrix(current, x, y);
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
    }
  }
  if (!points.length) return { minX: 0, minY: 0, maxX: VIEWPORT_SIZE, maxY: VIEWPORT_SIZE, width: VIEWPORT_SIZE, height: VIEWPORT_SIZE };
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export function fitSvgToMargin(svg, margin = 100) {
  const clean = normalizeToViewport(sanitizeSvg(svg, { colorMode: 'preserve' }));
  const safeMargin = Math.min(VIEWPORT_SIZE / 2, Math.max(0, Number.isFinite(Number(margin)) ? Number(margin) : 100));
  const bounds = svgContentBounds(clean.svg);
  const longest = Math.max(bounds.width, bounds.height, 0.0001);
  const targetSize = Math.max(0.0001, VIEWPORT_SIZE - safeMargin * 2);
  const scale = targetSize / longest;
  // `transformSvg` scales around the viewport center.  Therefore the
  // translation needed to move the source bounds' center onto that point is
  // proportional to the scale (rather than `center - sourceCenter * scale`,
  // which is the formula for an origin-anchored scale).
  const translateX = scale * (VIEWPORT_SIZE / 2 - (bounds.minX + bounds.maxX) / 2);
  const translateY = scale * (VIEWPORT_SIZE / 2 - (bounds.minY + bounds.maxY) / 2);
  const transformed = transformSvg(clean.svg, { scale, translateX, translateY });
  return { ...transformed, margin: safeMargin, scale, translateX, translateY, bounds };
}

export function setSvgColor(svg, mode = 'currentColor', color = null) {
  const clean = normalizeToViewport(sanitizeSvg(svg, { colorMode: mode === 'currentColor' ? 'currentColor' : 'preserve' }));
  if (mode !== 'custom' || !color) return { ...clean, colorMode: mode };
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color) || /^[a-zA-Z]+$/.test(color) ? color : 'currentColor';
  const body = clean.body
    .replace(/\s(fill|stroke)\s*=\s*(["'])((?!none\b)[^"']+)\2/gi, ` $1="${safeColor}"`)
    .replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_, quote, style) => ` style="${style.replace(/(fill|stroke)\s*:\s*[^;]+/gi, `$1:${safeColor}`)}"`);
  return { ...clean, body, svg: `<svg viewBox="${clean.viewBox}">${body}</svg>`, colorMode: mode };
}

function escapeJsString(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

export function iconId(project, icon) {
  const prefix = normalizePrefix(project.prefix);
  const candidate = slugify(icon.slug || icon.name || 'icon');
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = (candidate.toLowerCase() === prefix.toLowerCase()
    ? 'icon'
    : candidate.replace(new RegExp(`^${escapedPrefix}(?:-)+`, 'i'), '')) || 'icon';
  return `${prefix}-${suffix}`;
}

export function generateIconfontJs(project, icons) {
  const active = icons
    .filter((icon) => icon.status !== 'deleted')
    .slice()
    .sort((a, b) => String(a.codepoint ?? '').localeCompare(String(b.codepoint ?? '')) || String(a.slug).localeCompare(String(b.slug)));
  const symbols = active.map((icon) => {
    const clean = normalizeToViewport(sanitizeSvg(icon.svg ?? `<svg viewBox="${DEFAULT_VIEWBOX}"></svg>`, { colorMode: icon.colorMode === 'currentColor' ? 'currentColor' : 'preserve' }));
    const id = iconId(project, icon);
    return `<symbol id="${id.replace(/"/g, '')}" viewBox="${DEFAULT_VIEWBOX}">${clean.body}</symbol>`;
  }).join('');
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" id="iconfamily-sprite" style="position:absolute;width:0;height:0" aria-hidden="true"><defs></defs>${symbols}</svg>`;
  const map = Object.fromEntries(active.map((icon) => [icon.slug, { id: iconId(project, icon), name: icon.name, codepoint: icon.codepoint ?? null }]));
  const safeProjectName = String(project.name ?? 'IconFamily').replace(/[\\/*\r\n]/g, ' ');
  return `/* IconFamily ${safeProjectName} - source revision ${project.revision} */\n(function () {\n  var sprite = ${escapeJsString(sprite)};\n  var map = ${escapeJsString(JSON.stringify(map))};\n  if (typeof document !== 'undefined' && !document.getElementById('iconfamily-sprite')) {\n    var holder = document.createElement('div');\n    holder.innerHTML = sprite;\n    document.body.insertBefore(holder.firstElementChild, document.body.firstChild);\n  }\n  if (typeof window !== 'undefined') window.IconFamily = window.IconFamily || {};\n  if (typeof window !== 'undefined') window.IconFamily[${escapeJsString(normalizePrefix(project.prefix))}] = JSON.parse(map);\n})();\n`;
}

function findEndOfCentralDirectory(buffer) {
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}

export function parseZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length > 20 * 1024 * 1024) throw new Error('ZIP 超过 20 MB');
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件');
  const count = buffer.readUInt16LE(eocd + 10);
  if (count > 2000) throw new Error('ZIP 文件数量超限');
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let totalOutput = 0;
  let cursor = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const flags = buffer.readUInt16LE(cursor + 8);
    if (flags & 1) throw new Error('不支持加密 ZIP');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = (flags & 0x800 ? nameBytes.toString('utf8') : nameBytes.toString('latin1')).replace(/\\/g, '/');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/')) continue;
    if (name.startsWith('/') || name.split('/').includes('..') || /^[a-z]:/i.test(name)) throw new Error('ZIP 路径无效');
    if (uncompressedSize > 20 * 1024 * 1024) throw new Error('ZIP 文件解压大小超限');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buffer.length) throw new Error('ZIP 数据不完整');
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = zlib.inflateRawSync(compressed, { maxOutputLength: 20 * 1024 * 1024 });
    else throw new Error('不支持的 ZIP 压缩方法');
    totalOutput += content.length;
    if (content.length !== uncompressedSize || totalOutput > 40 * 1024 * 1024 || entries.size >= 2000) throw new Error('ZIP 解压大小或文件数量超限');
    entries.set(name, content);
  }
  return entries;
}

function extractAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1]) : null;
}

export function extractGlyphsFromIconfontSvg(svgText) {
  const text = String(svgText ?? '');
  const result = [];
  const glyphPattern = /<glyph\b[^>]*>/gi;
  for (const match of text.matchAll(glyphPattern)) {
    const tag = match[0];
    const path = extractAttribute(tag, 'd');
    if (!path) continue;
    const name = extractAttribute(tag, 'glyph-name') || `icon-${result.length + 1}`;
    const unicode = extractAttribute(tag, 'unicode');
    result.push({
      name,
      unicode,
      svg: `<svg viewBox="0 0 1024 1024"><path d="${path.replace(/"/g, '&quot;')}"/></svg>`,
    });
  }
  const symbolPattern = /<symbol\b([^>]*)>([\s\S]*?)<\/symbol\s*>/gi;
  for (const match of text.matchAll(symbolPattern)) {
    const attrs = match[1] ?? '';
    const id = extractAttribute(`<symbol ${attrs}>`, 'id') || `icon-${result.length + 1}`;
    const viewBox = extractAttribute(`<symbol ${attrs}>`, 'viewBox') || DEFAULT_VIEWBOX;
    result.push({ name: id.replace(/^icon[-_]/i, ''), unicode: null, svg: `<svg viewBox="${viewBox}">${match[2]}</svg>` });
  }
  return result;
}

export function parseIconfontZip(input) {
  const entries = parseZipEntries(input);
  const output = [];
  for (const [name, data] of entries.entries()) {
    if (/\.svg$/i.test(name) && !/iconfont\.svg$/i.test(name)) {
      try {
        const raw = data.toString('utf8');
        if (/<svg\b/i.test(raw)) output.push({ name: name.split('/').pop().replace(/\.svg$/i, ''), unicode: null, svg: raw });
      } catch {}
    }
  }
  const sprite = [...entries.entries()].find(([name]) => /(^|\/)iconfont\.svg$/i.test(name));
  if (sprite) output.push(...extractGlyphsFromIconfontSvg(sprite[1].toString('utf8')));
  if (!output.length) {
    const js = [...entries.entries()].find(([name]) => /\.js$/i.test(name));
    if (js) {
      output.push(...parseIconfontJs(js[1].toString('utf8')));
    }
  }
  return output;
}

export function parseIconfontJs(input) {
  if (typeof input !== 'string' || input.length > 20 * 1024 * 1024) throw new Error('JS 文件无效或超过 20 MB');
  const output = [];
  // Only read static string literals. No eval, Function, VM or DOM execution.
  const literals = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g;
  for (const match of input.matchAll(literals)) {
    const literal = match[0];
    if (literal[0] === '`' && literal.includes('${')) continue;
    const text = literal.slice(1, -1).replace(/\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|([\s\S]))/gi, (_, unicode, hex, char) => {
      if (unicode || hex) return String.fromCharCode(parseInt(unicode || hex, 16));
      return ({ n: '\n', r: '\r', t: '\t' })[char] ?? char;
    });
    if (/<symbol\b/i.test(text)) output.push(...extractGlyphsFromIconfontSvg(text));
    if (output.length > 2000) throw new Error('单次导入最多 2000 个图标');
  }
  if (!output.length) throw new Error('未找到静态 SVG symbol，JS 文件不会被执行');
  return output;
}
