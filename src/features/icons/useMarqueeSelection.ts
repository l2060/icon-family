import { useRef, useState, type PointerEvent, type MouseEvent, type RefObject } from 'react';
import type { Icon } from '../../types';

export const ICON_ROW_HEIGHT = 176;
export function useMarqueeSelection(
  container: RefObject<HTMLDivElement | null>,
  icons: Icon[],
  columns: number,
  selected: Set<number>,
  onSelect: (ids: Set<number>) => void,
) {
  const drag = useRef<{
    pointer: number;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    base: Set<number>;
    active: boolean;
  } | null>(null);
  const suppressed = useRef(false);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const holder = () => container.current;
  function bounds(view: HTMLElement) {
    const box = view.getBoundingClientRect();
    const css = getComputedStyle(view);
    const paddingLeft = parseFloat(css.paddingLeft);
    const paddingTop = parseFloat(css.paddingTop);
    return {
      left: box.left + paddingLeft,
      top: box.top + paddingTop,
      right: box.right,
      bottom: box.bottom,
      width: view.clientWidth - paddingLeft - parseFloat(css.paddingRight),
      paddingLeft,
      paddingTop,
    };
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      (event.target as HTMLElement).closest('[data-card-action]')
    )
      return;
    const view = holder();
    if (!view) return;
    const box = bounds(view);
    if (event.clientX >= box.right - 12 || event.clientY < box.top || event.clientY > box.bottom)
      return;
    suppressed.current = false;
    drag.current = {
      pointer: event.pointerId,
      startX: event.clientX - box.left,
      startY: event.clientY - box.top + view.scrollTop,
      clientX: event.clientX,
      clientY: event.clientY,
      base: event.ctrlKey || event.metaKey || event.shiftKey ? new Set(selected) : new Set(),
      active: false,
    };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const view = holder();
    if (!current || !view) return;
    if (
      !current.active &&
      Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) < 6
    )
      return;
    current.active = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    const box = bounds(view);
    if (event.clientY > box.bottom - 24) view.scrollTop += 20;
    else if (event.clientY < box.top + 24) view.scrollTop -= 20;
    const x = Math.max(0, Math.min(box.width, event.clientX - box.left));
    const y = Math.max(0, event.clientY - box.top + view.scrollTop);
    const left = Math.min(current.startX, x);
    const right = Math.max(current.startX, x);
    const top = Math.min(current.startY, y);
    const bottom = Math.max(current.startY, y);
    const next = new Set(current.base);
    const columnWidth = (box.width - 4 - (columns - 1) * 14) / columns;
    for (let index = 0; index < icons.length; index++) {
      const cardLeft = 2 + (index % columns) * (columnWidth + 14);
      const cardTop = Math.floor(index / columns) * ICON_ROW_HEIGHT + 2;
      if (
        cardLeft < right &&
        cardLeft + columnWidth > left &&
        cardTop < bottom &&
        cardTop + 162 > top
      )
        next.add(icons[index].id);
    }
    onSelect(next);
    setRect({
      left: left + box.paddingLeft,
      top: top + box.paddingTop,
      width: right - left,
      height: bottom - top,
    });
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.active) {
      suppressed.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
    setRect(null);
  }
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (suppressed.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressed.current = false;
    }
  }
  return {
    rect,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onClickCapture,
    },
  };
}
