import { memo } from 'react';
import { Card, Checkbox, Empty, Spin, Typography } from 'antd';
import { SvgPreview } from '../../components/SvgPreview';
import { usePreferences } from '../../preferences';
import type { CartItem } from '../../types';

const CartCard = memo(function CartCard({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: CartItem;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  const { t } = usePreferences();
  const label = `${t('选择', 'Select')} ${item.name}`;
  return (
    <Card size="small" className={`icon-card cart-card ${selected ? 'selected' : ''}`}>
      <Checkbox
        className="icon-checkbox"
        aria-label={label}
        checked={selected}
        disabled={disabled}
        onChange={() => onToggle(item.id)}
      />
      <button
        className="cart-icon-select"
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onToggle(item.id)}
      >
        <SvgPreview svg={item.svg} />
        <Typography.Text className="css-ellipsis" title={item.name}>
          {item.name}
        </Typography.Text>
      </button>
    </Card>
  );
});

export function CartGrid({
  items,
  selected,
  loading,
  disabled,
  onToggle,
}: {
  items: CartItem[];
  selected: Set<number>;
  loading: boolean;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  const { t } = usePreferences();
  return (
    <div className="cart-grid-area">
      <Spin spinning={loading} classNames={{ root: 'cart-grid-spinner' }}>
        {items.length ? (
          <div className="remote-grid cart-grid-row">
            {items.map((item) => (
              <CartCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                disabled={disabled}
                onToggle={onToggle}
              />
            ))}
          </div>
        ) : (
          !loading && (
            <Empty
              description={t(
                '购物车为空，去商店挑选图标吧。',
                'Your cart is empty. Find icons in the store.',
              )}
            />
          )
        )}
      </Spin>
    </div>
  );
}
