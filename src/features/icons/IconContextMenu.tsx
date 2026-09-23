import { useEffect } from 'react';
import { Dropdown } from 'antd';
import {
  BlockOutlined,
  FormOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { usePreferences } from '../../preferences';
import type { Icon } from '../../types';
import { useCart } from '../cart/CartProvider';

export interface IconMenuTarget {
  icon: Icon;
  x: number;
  y: number;
}
export function IconContextMenu({
  target,
  onClose,
  onEdit,
  onClone,
  onMove,
  onRename,
  onDelete,
}: {
  target: IconMenuTarget;
  onClose: () => void;
  onEdit: (icon: Icon) => void;
  onClone: (icon: Icon) => void;
  onMove: (icon: Icon) => void;
  onRename: (icon: Icon) => void;
  onDelete: (icon: Icon) => void;
}) {
  const { t } = usePreferences();
  const cart = useCart();
  const cartId = `project-icon:${target.icon.id}`;
  const inCart = cart.ids.has(cartId);
  const adding = cart.pending.has(cartId);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('[data-icon-menu]')) onClose();
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
      placement="bottomLeft"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      popupRender={(node) => <div data-icon-menu>{node}</div>}
      menu={{
        items: [
          { key: 'edit', label: t('编辑', 'Edit'), icon: <EditOutlined /> },
          { key: 'clone', label: t('拷贝到…', 'Copy to…'), icon: <BlockOutlined /> },
          { key: 'move', label: t('移动到…', 'Move to…'), icon: <FolderOpenOutlined /> },
          {
            key: 'cart',
            label: inCart
              ? t('已在购物车', 'In cart')
              : adding
                ? t('正在加入…', 'Adding…')
                : t('加入购物车', 'Add to cart'),
            icon: <ShoppingCartOutlined />,
            disabled: inCart || adding || cart.loading || !!cart.error,
          },
          { key: 'rename', label: t('重命名', 'Rename'), icon: <FormOutlined /> },
          { key: 'delete', label: t('删除', 'Delete'), icon: <DeleteOutlined />, danger: true },
        ],
        onClick: ({ key }) => {
          onClose();
          if (key === 'edit') onEdit(target.icon);
          if (key === 'clone') onClone(target.icon);
          if (key === 'move') onMove(target.icon);
          if (key === 'cart')
            void cart.add({
              remoteId: cartId,
              name: target.icon.name,
              fontClass: target.icon.slug,
              svg: target.icon.svg,
            });
          if (key === 'rename') onRename(target.icon);
          if (key === 'delete') onDelete(target.icon);
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
