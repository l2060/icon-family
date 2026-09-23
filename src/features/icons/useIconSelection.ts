import { useCallback, useEffect, useRef, useState } from 'react';
import type { Icon } from '../../types';

export function useIconSelection(icons: Icon[], visible: Icon[]) {
  const [selected, setSelected] = useState(new Set<number>());
  const anchor = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    const existing = new Set(icons.map((icon) => icon.id));
    setSelected((previous) =>
      [...previous].every((id) => existing.has(id))
        ? previous
        : new Set([...previous].filter((id) => existing.has(id))),
    );
  }, [icons]);
  const toggle = useCallback((id: number, range = false, additive = false, context = false) => {
    const visible = visibleRef.current;
    const start = visible.findIndex((icon) => icon.id === anchor.current);
    const end = visible.findIndex((icon) => icon.id === id);
    setSelected((previous) => {
      if (context) return previous.has(id) ? previous : new Set([id]);
      const next = new Set(additive ? previous : []);
      if (range && start >= 0 && end >= 0) {
        for (const icon of visible.slice(Math.min(start, end), Math.max(start, end) + 1))
          next.add(icon.id);
      } else if (additive && next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!range || start < 0) anchor.current = id;
  }, []);
  return { selected, setSelected, toggle };
}
