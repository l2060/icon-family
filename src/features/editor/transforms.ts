export interface EditState {
  elementColors: Record<string, Partial<Record<'fill' | 'stroke' | 'opacity', string>>>;
  elementOrders: Record<string, string[]>;
  elementTransforms: Record<string, string>;
  name: string;
  slug: string;
  codepoint: string;
  colorMode: string;
  scale: number;
  tx: number;
  ty: number;
  rotation: number;
  flipX: number;
  flipY: number;
}
export const identity = { scale: 1, tx: 0, ty: 0, rotation: 0, flipX: 1, flipY: 1 };
export const editableSelector = 'g,path,rect,circle,ellipse,line,polyline,polygon,use';
// Resolve inherited paint for the controls without rewriting the SVG tree.
export function elementPaint(element: Element | null, attribute: 'fill' | 'stroke'): string {
  for (let node = element; node; node = node.parentElement) {
    const value =
      (node as SVGElement).style?.getPropertyValue(attribute).trim() ||
      node.getAttribute(attribute)?.trim();
    if (!value || value === 'inherit' || value === 'unset') continue;
    if (value === 'initial') return attribute === 'fill' ? '#000000' : 'none';
    return value;
  }
  return attribute === 'fill' ? 'currentColor' : 'none';
}
export function transformedSvg(source: string, state: EditState, preview = false) {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const nodes = [...doc.querySelectorAll(editableSelector)];
  nodes.forEach((element, index) => {
    const key = String(index);
    if (state.elementTransforms[key] !== undefined)
      element.setAttribute('transform', state.elementTransforms[key]);
    if (preview) element.setAttribute('data-editor-node', key);
    for (const [attribute, value] of Object.entries(state.elementColors[key] || {})) {
      element.setAttribute(attribute, value);
      (element as SVGElement).style?.removeProperty(attribute);
    }
  });
  for (const order of Object.values(state.elementOrders)) {
    const siblings = order.map((key) => nodes[Number(key)]).filter(Boolean);
    const parent = siblings[0]?.parentNode;
    if (parent)
      siblings.forEach((element) => {
        if (element.parentNode === parent) parent.appendChild(element);
      });
  }
  source = new XMLSerializer().serializeToString(doc.documentElement);
  const match = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg\s*>/i);
  if (!match) return source;
  const n = (value: number) => Number(value.toFixed(4));
  const transform = `translate(${n(state.tx)} ${n(state.ty)}) translate(512 512) rotate(${n(state.rotation)}) scale(${n(state.scale * state.flipX)} ${n(state.scale * state.flipY)}) translate(-512 -512)`;
  const body =
    state.colorMode === 'currentColor'
      ? match[1].replace(/\s(fill|stroke)\s*=\s*(["'])((?!none\b)[^"']+)\2/gi, ' $1="currentColor"')
      : match[1];
  return `<svg viewBox="0 0 1024 1024"><g transform="${transform}">${body}</g></svg>`;
}
