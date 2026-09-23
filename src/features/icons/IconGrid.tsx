import { memo, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Empty } from 'antd';
import { usePreferences } from '../../preferences';
import type { Icon } from '../../types';
import { IconCard } from './IconCard';
import { useMarqueeSelection } from './useMarqueeSelection';
import { IconContextMenu, type IconMenuTarget } from './IconContextMenu';
import { IconExportMenu } from './IconExportMenu';

export const IconGrid = memo(function IconGrid({
  icons,
  prefix,
  selected,
  onToggle,
  onEdit,
  onCopy,
  onClone,
  onMove,
  onRename,
  onDelete,
  onSelect,
}: {
  icons: Icon[];
  prefix: string;
  selected: Set<number>;
  onToggle: (id: number, range?: boolean, additive?: boolean, context?: boolean) => void;
  onEdit: (icon: Icon) => void;
  onCopy: (name: string) => void;
  onClone: (icon: Icon) => void;
  onMove: (icon: Icon) => void;
  onRename: (icon: Icon) => void;
  onDelete: (icon: Icon) => void;
  onSelect: (ids: Set<number>) => void;
}) {
  const { t } = usePreferences();
  const [readyCount, setReadyCount] = useState(48);
  useEffect(() => {
    if (readyCount >= icons.length) return;
    // Yield between batches so the first rows and controls can paint promptly.
    // Mounted cards are never removed when scrolling (this is not virtualization).
    const timer = window.setTimeout(() => {
      startTransition(() => setReadyCount((count) => count + 48));
    }, 16);
    return () => window.clearTimeout(timer);
  }, [readyCount, icons.length]);
  const container = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<IconMenuTarget>();
  const [exportMenu, setExportMenu] = useState<IconMenuTarget>();
  const openExport = useCallback((icon: Icon, x: number, y: number) => {
    setMenu(undefined);
    setExportMenu({ icon, x, y });
  }, []);
  const openMenu = useCallback(
    (icon: Icon, x: number, y: number) => {
      onToggle(icon.id, false, false, true);
      setExportMenu(undefined);
      setMenu({ icon, x, y });
    },
    [onToggle],
  );
  const closeMenu = useCallback(() => {
    setMenu(undefined);
    setExportMenu(undefined);
  }, []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize((previous) => {
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        return previous.width === width && previous.height === height
          ? previous
          : { width, height };
      }),
    );
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);
  const columns = Math.max(1, Math.floor((size.width - 4 + 14) / 164));
  const marquee = useMarqueeSelection(container, icons, columns, selected, onSelect);
  return (
    <div className="icon-scroll" ref={container} {...marquee.handlers} onScroll={closeMenu}>
      {icons.length ? (
        <div className="icon-grid">
          {icons.map((icon, index) =>
            index < readyCount ? (
              <IconCard
                key={icon.id}
                icon={icon}
                prefix={prefix}
                selected={selected.has(icon.id)}
                onToggle={onToggle}
                onCopy={onCopy}
                onMenu={openMenu}
                onExport={openExport}
              />
            ) : (
              <div key={icon.id} className="icon-card-placeholder" aria-hidden="true" />
            ),
          )}
        </div>
      ) : (
        <Empty
          className="workspace-empty"
          description={t(
            '没有图标，可导入 SVG 或从 iconfont 添加。',
            'No icons. Import SVG files or add icons from iconfont.',
          )}
        />
      )}
      {marquee.rect && <div className="icon-marquee" style={marquee.rect} />}
      {menu && (
        <IconContextMenu
          target={menu}
          onClose={closeMenu}
          onEdit={onEdit}
          onClone={onClone}
          onMove={onMove}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
      {exportMenu && <IconExportMenu target={exportMenu} prefix={prefix} onClose={closeMenu} />}
    </div>
  );
});
