import type { MouseEvent, ReactNode } from 'react';
import { Button, ConfigProvider, Flex, Select, Typography } from 'antd';
import { usePreferences } from '../../preferences';
import type { TransformAction } from './elementTransforms';

export function EditorInspector({
  selected,
  onSelect,
  elements,
  operate,
  center,
  children,
}: {
  selected?: string;
  onSelect: (key?: string) => void;
  elements: { value: string; label: string }[];
  operate: (action: TransformAction, amount: number) => void;
  center: (axis: 'horizontal' | 'vertical') => void;
  children?: ReactNode;
}) {
  const { t } = usePreferences();
  function adjust(action: TransformAction, direction: number, event: MouseEvent) {
    const modifier = event.ctrlKey || event.metaKey;
    const step =
      action === 'scale'
        ? event.shiftKey
          ? 0.1
          : modifier
            ? 0.05
            : 0.01
        : action === 'rotation'
          ? 15
          : event.shiftKey
            ? 100
            : modifier
              ? 10
              : 1;
    operate(action, action === 'scale' ? 1 + direction * step : direction * step);
  }
  return (
    <ConfigProvider componentSize="small">
      <aside className="editor-inspector">
        <Flex gap={6}>
          <Select
            aria-label={t('选择 SVG 元素', 'Select SVG element')}
            style={{ flex: 1, minWidth: 0 }}
            value={selected ?? 'all'}
            showSearch
            optionFilterProp="label"
            onChange={(key) => onSelect(key === 'all' ? undefined : key)}
            options={[{ value: 'all', label: t('整个图标', 'Whole icon') }, ...elements]}
          />
          <Button
            aria-label={t('取消元素选择', 'Clear selection')}
            onClick={() => onSelect(undefined)}
          >
            {t('整体', 'All')}
          </Button>
        </Flex>
        <Typography.Title level={5}>
          {selected === undefined
            ? t('整体变换', 'Transform icon')
            : t('元素变换', 'Transform element')}
        </Typography.Title>
        <Flex vertical gap={6}>
          <Flex gap={8}>
            <Button onClick={() => center('horizontal')}>
              {t('水平居中', 'Center horizontally')}
            </Button>
            <Button onClick={() => center('vertical')}>{t('垂直居中', 'Center vertically')}</Button>
          </Flex>
          <div className="editor-transform-grid">
            {(
              [
                ['scale', t('缩放', 'Scale'), t('缩小', 'Shrink'), t('放大', 'Grow')],
                ['rotation', t('旋转', 'Rotate'), '−15°', '+15°'],
                ['tx', t('水平', 'Horizontal'), '←', '→'],
                ['ty', t('垂直', 'Vertical'), '↑', '↓'],
              ] as const
            ).map(([action, label, minus, plus]) => (
              <Flex key={action} vertical gap={3}>
                <span>{label}</span>
                <Flex gap={4}>
                  <Button onClick={(event) => adjust(action, -1, event)}>{minus}</Button>
                  <Button onClick={(event) => adjust(action, 1, event)}>{plus}</Button>
                </Flex>
              </Flex>
            ))}
          </div>
          <Flex gap={6}>
            <Button onClick={() => operate('flipX', -1)}>
              {t('水平镜像', 'Flip horizontally')}
            </Button>
            <Button onClick={() => operate('flipY', -1)}>{t('垂直镜像', 'Flip vertically')}</Button>
          </Flex>
        </Flex>
        {children}
      </aside>
    </ConfigProvider>
  );
}
