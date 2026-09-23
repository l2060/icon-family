import { Button, ColorPicker, Flex, InputNumber, Select, Slider, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { usePreferences } from '../../preferences';

export type LayerAction = 'up' | 'down' | 'front' | 'back';
export function EditorAppearance({
  disabled,
  fill,
  stroke,
  canRaise,
  canLower,
  onLayer,
  onColor,
  opacity,
  onOpacity,
}: {
  disabled: boolean;
  fill: string;
  stroke: string;
  canRaise: boolean;
  canLower: boolean;
  onLayer: (action: LayerAction) => void;
  onColor: (attribute: 'fill' | 'stroke', value: string) => void;
  opacity: number;
  onOpacity: (value: number) => void;
}) {
  const { t } = usePreferences();
  const [alpha, setAlpha] = useState(opacity * 100);
  useEffect(() => setAlpha(opacity * 100), [opacity]);
  return (
    <>
      <Typography.Title level={5}>{t('元素层级', 'Element order')}</Typography.Title>
      <Flex gap={4}>
        {(['back', 'down', 'up', 'front'] as const).map((action, index) => (
          <Button
            size="small"
            key={action}
            aria-label={
              [t('置底', 'Back'), t('下移', 'Lower'), t('上移', 'Raise'), t('置顶', 'Front')][index]
            }
            disabled={disabled || (index < 2 ? !canLower : !canRaise)}
            onClick={() => onLayer(action)}
          >
            {[t('置底', 'Back'), t('下移', 'Lower'), t('上移', 'Raise'), t('置顶', 'Front')][index]}
          </Button>
        ))}
      </Flex>
      <Typography.Title level={5}>{t('元素颜色', 'Element colors')}</Typography.Title>
      <Flex vertical gap={8}>
        {(['fill', 'stroke'] as const).map((attribute) => {
          const value = attribute === 'fill' ? fill : stroke;
          const special = ['none', 'currentColor'].includes(value);
          const label = attribute === 'fill' ? t('填充', 'Fill') : t('描边', 'Stroke');
          return (
            <Flex key={attribute} align="center" gap={8}>
              <span>{label}</span>
              <Select
                classNames={{ popup: { root: `editor-${attribute}-options` } }}
                aria-label={label}
                size="small"
                disabled={disabled}
                style={{ flex: 1 }}
                value={special ? value : 'color'}
                onChange={(next) => onColor(attribute, next === 'color' ? '#1677ff' : next)}
                options={[
                  { value: 'currentColor', label: t('跟随文字', 'Text color') },
                  { value: 'color', label: t('自定义', 'Custom') },
                  { value: 'none', label: t('无颜色', 'None') },
                ]}
              />
              <ColorPicker
                size="small"
                disabled={disabled}
                value={special || value.startsWith('url(') ? '#000000' : value}
                onChangeComplete={(color) => onColor(attribute, color.toHexString())}
              />
            </Flex>
          );
        })}
      </Flex>
      <Flex align="center" gap={6} className="editor-opacity">
        <span>{t('透明度', 'Opacity')}</span>
        <Slider
          aria-label={t('透明度滑块', 'Opacity slider')}
          style={{ flex: 1 }}
          min={0}
          max={100}
          value={alpha}
          disabled={disabled}
          onChange={setAlpha}
          onChangeComplete={(value) => onOpacity(value / 100)}
        />
        <InputNumber
          aria-label={t('透明度百分比', 'Opacity percent')}
          size="small"
          min={0}
          max={100}
          precision={0}
          style={{ width: 70 }}
          suffix="%"
          value={alpha}
          disabled={disabled}
          onChange={(value) => {
            if (value !== null) {
              setAlpha(value);
              onOpacity(value / 100);
            }
          }}
        />
      </Flex>
    </>
  );
}
