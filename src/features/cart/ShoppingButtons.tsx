import { Badge, Button, Flex } from 'antd';
import { ShopOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { usePreferences } from '../../preferences';
import { useCart } from './CartProvider';

export function ShoppingButtons() {
  const { t } = usePreferences();
  const { items, openShop, openCart } = useCart();
  return (
    <Flex gap={8} wrap>
      <Button icon={<ShopOutlined />} onClick={openShop}>
        {t('图标商店', 'Icon store')}
      </Button>
      <Badge count={items.length} overflowCount={999}>
        <Button icon={<ShoppingCartOutlined />} onClick={openCart}>
          {t('购物车', 'Cart')}
        </Button>
      </Badge>
    </Flex>
  );
}
