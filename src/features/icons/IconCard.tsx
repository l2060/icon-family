import { memo } from 'react';
import { Button, Card, Checkbox, Flex, Typography } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { iconName } from '../../api';
import { SvgPreview } from '../../components/SvgPreview';
import { usePreferences } from '../../preferences';
import type { Icon, IconFormat } from '../../types';

export const IconCard = memo(function IconCard({
  icon,
  format,
  prefix,
  selected,
  onToggle,
  onCopy,
  onMenu,
  onExport,
}: {
  icon: Icon;
  format: IconFormat;
  prefix: string;
  selected: boolean;
  onToggle: (id: number, range?: boolean, additive?: boolean, context?: boolean) => void;
  onCopy: (name: string) => void;
  onMenu: (icon: Icon, x: number, y: number) => void;
  onExport: (icon: Icon, x: number, y: number) => void;
}) {
  const { t } = usePreferences();
  const name = iconName(prefix, icon.slug);
  const codepoint = Number(icon.codepoint);
  const unicode =
    icon.codepoint != null && Number.isInteger(codepoint) && codepoint > 0
      ? `0x${codepoint.toString(16).toUpperCase()}`
      : '';
  const copyValue = format === 'ttf' ? unicode : name;
  const copyLabel =
    format === 'ttf' ? t('复制 Unicode', 'Copy Unicode') : t('复制代码', 'Copy code');
  return (
    <Card
      size="small"
      hoverable
      className={`icon-card project-icon-card ${selected ? 'selected' : ''}`}
      data-icon-id={icon.id}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(icon, event.clientX, event.clientY);
      }}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('[data-card-action]'))
          onToggle(icon.id, event.shiftKey, event.ctrlKey || event.metaKey);
      }}
    >
      <span
        className="icon-select-target"
        data-card-action
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onClick={(event) => onToggle(icon.id, event.shiftKey, event.ctrlKey || event.metaKey)}
          aria-label={`${t('选择', 'Select')} ${icon.name}`}
        />
      </span>
      <button
        className="icon-open"
        aria-label={`${t('选择', 'Select')} ${icon.name}`}
        aria-pressed={selected}
      >
        <SvgPreview svg={icon.svg} />
        <Typography.Text className="css-ellipsis icon-card-name" title={icon.name}>
          {icon.name}
        </Typography.Text>
      </button>
      <Flex
        gap={4}
        className="icon-card-actions"
        data-card-action
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          className="icon-copy-button"
          size="small"
          title={`${copyLabel}: ${copyValue}`}
          disabled={!copyValue}
          onClick={() => onCopy(copyValue)}
        >
          {copyLabel}
        </Button>
        <Button
          size="small"
          className="icon-export-button"
          icon={<DownOutlined />}
          title={t('复制 Unicode / SVG / 下载', 'Copy Unicode / SVG / Download')}
          aria-label={`${t('导出图标', 'Export icon')} ${icon.name}`}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            onExport(icon, box.right, box.bottom);
          }}
        />
      </Flex>
    </Card>
  );
});
