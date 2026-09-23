import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Empty,
  Flex,
  Input,
  Pagination,
  Radio,
  Select,
  Spin,
  Typography,
} from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { RemoteIcon } from '../../types';
import { useCart } from '../cart/CartProvider';
import { StoreIconCard } from './StoreIconCard';

export function IconfontDrawer({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences();
  const cart = useCart();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated_at');
  const [fills, setFills] = useState('');
  const [items, setItems] = useState<RemoteIcon[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const lastQuery = useRef({ q: '', sortType: 'updated_at', fills: '' });
  useEffect(() => () => request.current?.abort(), []);
  async function search(nextPage: number, filters = lastQuery.current) {
    if (!filters.q) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ items: RemoteIcon[]; total: number }>(
        '/iconfont/search',
        'POST',
        { ...filters, page: nextPage, pageSize: 54, sType: '', fromCollection: '-1', ctoken: null },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      lastQuery.current = filters;
      setItems(result.items);
      setTotal(result.total);
      setPage(nextPage);
      setSearched(true);
      scroll.current?.scrollTo({ top: 0 });
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Drawer
      open
      size={760}
      title={t('图标商店', 'Icon store')}
      onClose={onClose}
      extra={
        <Badge count={cart.items.length} overflowCount={999}>
          <Button icon={<ShoppingCartOutlined />} onClick={cart.openCart}>
            {t('购物车', 'Cart')}
          </Button>
        </Badge>
      }
      styles={{
        body: { display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 22 },
      }}
      footer={
        <Flex justify="center">
          <Pagination
            current={page}
            total={total}
            pageSize={54}
            showSizeChanger={false}
            disabled={busy}
            onChange={(p) => void search(p)}
          />
        </Flex>
      }
    >
      <Flex vertical gap={14} className="remote-filters">
        <Flex gap={8}>
          <Input.Search
            allowClear
            autoFocus
            placeholder={t('搜索 iconfont 图标', 'Search iconfont icons')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={() => void search(1, { q: query.trim(), sortType: sort, fills })}
            enterButton={t('搜索', 'Search')}
            loading={busy}
          />
          <Select
            aria-label={t('排序', 'Sort')}
            value={sort}
            onChange={(value) => {
              setSort(value);
              if (searched) void search(1, { q: query.trim(), sortType: value, fills });
            }}
            style={{ minWidth: 130 }}
            options={[
              { value: 'updated_at', label: t('最近更新', 'Latest updated') },
              { value: 'download', label: t('下载最多', 'Most downloads') },
              { value: 'name', label: t('名称', 'Name') },
            ]}
          />
        </Flex>
        <Flex gap={8} align="center" wrap>
          <Radio.Group
            aria-label={t('颜色类型', 'Color type')}
            optionType="button"
            buttonStyle="solid"
            value={fills}
            onChange={(e) => {
              setFills(e.target.value);
              if (searched)
                void search(1, { q: query.trim(), sortType: sort, fills: e.target.value });
            }}
            options={[
              { value: '', label: t('全部', 'All') },
              { value: '0', label: t('单色', 'Monochrome') },
              { value: '1', label: t('多色', 'Multicolor') },
            ]}
          />
          <Typography.Text type="secondary" className="push-right">
            iconfont.cn
          </Typography.Text>
        </Flex>
        {(error || cart.error) && <Alert type="error" title={error || cart.error} />}
      </Flex>
      <div className="remote-results" ref={scroll}>
        <Spin spinning={busy}>
          <div className="remote-grid">
            {items.map((item) => (
              <StoreIconCard
                key={item.remoteId}
                item={item}
                inCart={cart.ids.has(String(item.remoteId))}
                pending={cart.pending.has(String(item.remoteId))}
                disabled={cart.loading || !!cart.error}
                onAdd={cart.add}
              />
            ))}
          </div>
          {!items.length && !busy && (
            <Empty
              description={
                searched
                  ? t('没有找到图标', 'No icons found')
                  : t(
                      '搜索图标，加入购物车后统一添加到项目。',
                      'Search icons and collect them in your cart before adding to projects.',
                    )
              }
            />
          )}
        </Spin>
      </div>
    </Drawer>
  );
}
