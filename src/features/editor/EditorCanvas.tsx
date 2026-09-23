import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button, Flex, Tooltip, Typography } from 'antd';
import {
  BorderOutlined,
  CompressOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { SvgPreview } from '../../components/SvgPreview';
import { usePreferences } from '../../preferences';
import { elementMatrix, matrixText } from './elementTransforms';

export function EditorCanvas({
  svg,
  selected,
  onSelect,
  canvasRef,
  onElementChange,
}: {
  svg: string;
  selected?: string;
  onSelect: (key?: string) => void;
  canvasRef: RefObject<HTMLDivElement | null>;
  onElementChange: (key: string, transform: string) => void;
}) {
  const { t } = usePreferences();
  const [grid, setGrid] = useState(true);
  const [panning, setPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const space = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  function updateSelectionBox() {
    const container = wrap.current;
    const element = container?.querySelector(`[data-editor-node="${selected}"]`);
    if (!element || !container) {
      setSelectionBox(undefined);
      return;
    }
    const box = element.getBoundingClientRect(),
      parent = container.getBoundingClientRect();
    setSelectionBox({
      left: box.left - parent.left,
      top: box.top - parent.top,
      width: box.width,
      height: box.height,
    });
  }
  useLayoutEffect(() => {
    updateSelectionBox();
    const observer = new ResizeObserver(updateSelectionBox);
    if (wrap.current) observer.observe(wrap.current);
    return () => observer.disconnect();
  }, [selected, svg, view]);
  const elementDrag = useRef<
    | {
        element: SVGGraphicsElement;
        key: string;
        inverse: DOMMatrix;
        start: DOMPoint;
        matrix: DOMMatrix;
        moved: boolean;
        original: string | null;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    wrap.current?.querySelectorAll('[data-editor-node]').forEach((element) => {
      element.toggleAttribute(
        'data-editor-selected',
        element.getAttribute('data-editor-node') === selected,
      );
    });
  }, [svg, selected]);
  useEffect(() => {
    const element = wrap.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((v) => ({
        ...v,
        zoom: Math.max(0.2, Math.min(4, v.zoom + (event.deltaY < 0 ? 0.08 : -0.08))),
      }));
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLElement && e.target.closest('input,textarea,[contenteditable]'))
      ) {
        space.current = true;
        e.preventDefault();
      }
    };
    const up = () => {
      space.current = false;
    };
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', up);
    return () => {
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', up);
    };
  }, []);
  const tools = [
    {
      label: t('网格', 'Grid'),
      icon: <BorderOutlined />,
      active: grid,
      action: () => setGrid(!grid),
    },
    {
      label: t('适应', 'Fit'),
      icon: <CompressOutlined />,
      action: () => setView({ zoom: 1, x: 0, y: 0 }),
    },
    {
      label: t('放大工作区', 'Zoom in'),
      icon: <ZoomInOutlined />,
      action: () => setView((v) => ({ ...v, zoom: Math.min(4, v.zoom + 0.1) })),
    },
    {
      label: t('缩小工作区', 'Zoom out'),
      icon: <ZoomOutOutlined />,
      action: () => setView((v) => ({ ...v, zoom: Math.max(0.2, v.zoom - 0.1) })),
    },
  ];
  return (
    <div className="editor-canvas-column">
      <Flex gap={6} align="center" className="editor-tools">
        <Typography.Text type="secondary" className="editor-canvas-caption">
          {t('画布', 'Canvas')} · 1024 × 1024
        </Typography.Text>
        {tools.map((tool) => (
          <Tooltip key={tool.label} title={tool.label}>
            <Button
              aria-label={tool.label}
              icon={tool.icon}
              type={tool.active ? 'primary' : 'default'}
              onClick={tool.action}
            ></Button>
          </Tooltip>
        ))}
        <Typography.Text className="editor-zoom-value">
          {Math.round(view.zoom * 100)}%
        </Typography.Text>
      </Flex>
      <div
        ref={(node) => {
          wrap.current = node;
          canvasRef.current = node;
        }}
        className={`editor-canvas-wrap ${panning ? 'panning' : ''}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(e) => {
          if (![0, 1, 2].includes(e.button)) return;
          if (e.button === 0 && !space.current) {
            const element = (e.target as Element).closest<SVGGraphicsElement>('[data-editor-node]');
            if (!element) {
              onSelect(undefined);
              return;
            }
            const key = element.getAttribute('data-editor-node')!;
            onSelect(key);
            const parent = element.parentElement as unknown as SVGGraphicsElement;
            const matrix = parent.getScreenCTM?.();
            if (!matrix) return;
            try {
              const inverse = new DOMMatrix([
                matrix.a,
                matrix.b,
                matrix.c,
                matrix.d,
                matrix.e,
                matrix.f,
              ]).inverse();
              elementDrag.current = {
                element,
                key,
                inverse,
                start: new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse),
                matrix: elementMatrix(element),
                moved: false,
                original: element.getAttribute('transform'),
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            } catch {
              /* Non-invertible elements remain selectable from the list. */
            }
            return;
          }
          dragging.current = true;
          setPanning(true);
          e.preventDefault();
          last.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const item = elementDrag.current;
          if (item) {
            const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(item.inverse);
            const dx = point.x - item.start.x,
              dy = point.y - item.start.y;
            if (Math.abs(dx) + Math.abs(dy) > 0.1) item.moved = true;
            if (item.moved)
              item.element.setAttribute(
                'transform',
                matrixText(new DOMMatrix().translate(dx, dy).multiply(item.matrix)),
              );
            updateSelectionBox();
            return;
          }
          if (!dragging.current) return;
          const dx = e.clientX - last.current.x;
          const dy = e.clientY - last.current.y;
          last.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={() => {
          const item = elementDrag.current;
          elementDrag.current = undefined;
          if (item?.moved) onElementChange(item.key, item.element.getAttribute('transform')!);
          dragging.current = false;
          setPanning(false);
        }}
        onPointerCancel={() => {
          const item = elementDrag.current;
          if (item) {
            if (item.original === null) item.element.removeAttribute('transform');
            else item.element.setAttribute('transform', item.original);
          }
          elementDrag.current = undefined;
          dragging.current = false;
          setPanning(false);
          updateSelectionBox();
        }}
      >
        <div
          className="editor-stage"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <SvgPreview svg={svg} />
          {grid && (
            <div className="editor-grid">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>
                  <i style={{ left: `${(i + 1) * 10}%` }} />
                  <b style={{ top: `${(i + 1) * 10}%` }} />
                </span>
              ))}
            </div>
          )}
        </div>
        {selectionBox && (
          <div className="editor-selection-box" style={selectionBox} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
    </div>
  );
}
