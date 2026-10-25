import { useEffect } from 'react';
import { App, Dropdown } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { copyText, iconName } from '../../api';
import { usePreferences } from '../../preferences';
import type { IconMenuTarget } from './IconContextMenu';
import { downloadBlob, exportPng, exportSvg } from './exportIcon';

export function IconExportMenu({
  target,
  prefix,
  onClose,
}: {
  target: IconMenuTarget;
  prefix: string;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const codepoint = Number(target.icon.codepoint);
  const unicode =
    target.icon.codepoint != null && Number.isInteger(codepoint) && codepoint > 0
      ? `0x${codepoint.toString(16).toUpperCase()}`
      : '';
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.icon-export-popup')) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  return (
    <Dropdown
      open
      autoFocus
      trigger={[]}
      placement="bottomRight"
      classNames={{ root: 'icon-export-popup' }}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      menu={{
        items: [
          {
            key: 'copy-unicode',
            label: `${t('复制 Unicode', 'Copy Unicode')}${unicode ? ` (${unicode})` : ''}`,
            icon: <CopyOutlined />,
            disabled: !unicode,
          },
          { key: 'copy-svg', label: t('复制 SVG', 'Copy SVG'), icon: <CopyOutlined /> },
          { key: 'svg', label: t('下载 SVG', 'Download SVG'), icon: <DownloadOutlined /> },
          {
            key: 'png',
            // Submenus are portalled outside the root dropdown. Treat them as
            // part of this menu so pointerdown does not discard their click.
            popupClassName: 'icon-export-popup',
            label: t('下载 PNG', 'Download PNG'),
            icon: <DownloadOutlined />,
            children: [16, 32, 64, 128, 256, 512, 1024].map((size) => ({
              key: `png-${size}`,
              label: `${size} × ${size} px`,
            })),
          },
        ],
        onClick: ({ key }) => {
          onClose();
          const name = iconName(prefix, target.icon.slug);
          void (async () => {
            if (key === 'copy-unicode') {
              await copyText(unicode);
              message.success(t(`已复制 Unicode：${unicode}`, `Copied Unicode: ${unicode}`));
              return;
            }
            const svg = exportSvg(target.icon.svg);
            if (key === 'copy-svg') {
              await copyText(svg);
              message.success(t(`已复制 SVG：${name}`, `Copied SVG: ${name}`));
            } else if (key === 'svg')
              downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`);
            else if (key.startsWith('png-')) {
              const size = Number(key.slice(4));
              downloadBlob(await exportPng(svg, size), `${name}-${size}.png`);
            }
          })().catch((error) => message.error(error.message));
        },
      }}
    >
      <span
        style={{
          position: 'fixed',
          left: target.x,
          top: target.y,
          width: 1,
          height: 1,
          pointerEvents: 'none',
        }}
      />
    </Dropdown>
  );
}
