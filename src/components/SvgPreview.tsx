import { memo, useContext, useMemo } from 'react';
import { ProjectThemeContext } from '../features/projects/ProjectTheme';
import DOMPurify from 'dompurify';

const cache = new Map<string, string>();
let cacheBytes = 0;
const maxCacheBytes = 16 * 1024 * 1024;
export function cleanSvg(svg: string) {
  const cached = cache.get(svg);
  if (cached !== undefined) {
    cache.delete(svg);
    cache.set(svg, cached);
    return cached;
  }
  // Legacy JS imports sometimes retained string-literal escapes in markup.
  // Decode before sanitizing, never after, so recovered markup is checked too.
  const normalized = svg.replace(/\\+(["'])/g, '$1');
  const clean = DOMPurify.sanitize(normalized, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['style', 'foreignObject'],
    RETURN_DOM: true,
  });
  if (!(clean instanceof Element)) return '';
  const root = clean.firstElementChild;
  if (root?.localName !== 'svg' || clean.childElementCount !== 1) return '';
  root.removeAttribute('style');
  const result = new XMLSerializer().serializeToString(root);
  const bytes = (svg.length + result.length) * 2;
  if (bytes <= maxCacheBytes) {
    while (cache.size && (cache.size >= 2048 || cacheBytes + bytes > maxCacheBytes)) {
      const oldest = cache.keys().next().value!;
      cacheBytes -= (oldest.length + cache.get(oldest)!.length) * 2;
      cache.delete(oldest);
    }
    cache.set(svg, result);
    cacheBytes += bytes;
  }
  return result;
}
export const SvgPreview = memo(function SvgPreview({
  svg,
  className = '',
}: {
  svg: string;
  className?: string;
}) {
  const clean = useMemo(() => cleanSvg(svg), [svg]);
  const color = useContext(ProjectThemeContext);
  return (
    <div
      className={`svg-preview ${className}`}
      aria-hidden="true"
      style={color ? { color, fill: color } : undefined}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
});
