import { memo } from 'react';
import { Button, Card, Typography } from 'antd';
import { CheckOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { SvgPreview } from '../../components/SvgPreview';
import { usePreferences } from '../../preferences';
import type { RemoteIcon } from '../../types';

export const StoreIconCard = memo(function StoreIconCard({
  item,
  inCart,
  pending,
  disabled,
  onAdd,
}: {
  item: RemoteIcon;
  inCart: boolean;
  pending: boolean;
  disabled: boolean;
  onAdd: (item: RemoteIcon) => Promise<void>;
}) {
  const { t } = usePreferences();
  return (
    <Card size="small" className={`icon-card store-card ${inCart ? 'selected' : ''}`}>
      <SvgPreview svg={item.svg} />
      <Typography.Text className="css-ellipsis" title={item.name}>
        {item.name}
      </Typography.Text>
      <Typography.Text type="secondary" className="small-text css-ellipsis">
        {item.fontClass || item.unicode || item.remoteId}
      </Typography.Text>
      <Button
        size="small"
        type={inCart ? 'default' : 'primary'}
        icon={inCart ? <CheckOutlined /> : <ShoppingCartOutlined />}
        loading={pending}
        disabled={inCart || disabled}
        onClick={() => void onAdd(item)}
      >
        {inCart ? t('已在购物车', 'In cart') : t('加入购物车', 'Add to cart')}
      </Button>
    </Card>
  );
});
