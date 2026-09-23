import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Checkbox,
  Flex,
  Popconfirm,
  Select,
  Tooltip,
  Typography,
} from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { usePreferences } from '../../preferences';
import type { CheckoutResult, Project } from '../../types';
import { useCart } from './CartProvider';
import { CartGrid } from './CartGrid';

export function CartDrawer({
  projects,
  activeId,
  onClose,
}: {
  projects: Project[];
  activeId?: number;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const { items, pending, loading, error, refresh, remove, checkout } = useCart();
  const [selected, setSelected] = useState<number[]>([]);
  const [targets, setTargets] = useState<number[]>(activeId ? [activeId] : []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResult>();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = useCallback(
    (id: number) =>
      setSelected((previous) =>
        previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
      ),
    [],
  );
  useEffect(() => {
    setSelected((previous) => previous.filter((id) => items.some((item) => item.id === id)));
  }, [items]);
  return (
    <Drawer
      open
      size={760}
      zIndex={1100}
      title={
        <Flex align="center" gap={8}>
          <span>{t(`购物车（${items.length}）`, `Cart (${items.length})`)}</span>
          <Tooltip
            placement="bottomLeft"
            trigger={['hover', 'focus']}
            title={t(
              '图标已保存到你的账号，可选择多个项目批量添加。成功添加到所有目标项目后自动移出购物车，已有图标会跳过，失败项保留以便重试。',
              'Icons are saved to your account. Select multiple projects to add them in one step. Icons leave the cart after all destinations succeed; existing icons are skipped and failed items stay for retry.',
            )}
          >
            <Button
              type="text"
              size="small"
              icon={<QuestionCircleOutlined />}
              aria-label={t('购物车说明', 'About the cart')}
            />
          </Tooltip>
        </Flex>
      }
      onClose={onClose}
      styles={{ body: { display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 16 } }}
      footer={
        <Flex vertical gap={12}>
          <Button
            type="primary"
            loading={busy}
            disabled={!selected.length || !targets.length || !!pending.size}
            onClick={async () => {
              setBusy(true);
              setResult(undefined);
              try {
                const response = await checkout(selected, targets);
                setResult(response);
                setSelected((previous) =>
                  previous.filter((id) => !response.removedIds.includes(id)),
                );
              } catch (e) {
                message.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(
              `将 ${selected.length} 个图标添加到 ${targets.length} 个项目`,
              `Add ${selected.length} icons to ${targets.length} projects`,
            )}
          </Button>
        </Flex>
      }
    >
      <Flex vertical gap={8} className="cart-project-picker">
        <Typography.Text>
          {t('添加到项目（可多选）', 'Add to projects (select multiple)')}
        </Typography.Text>
        <Select
          mode="multiple"
          aria-label={t('目标项目', 'Target projects')}
          placeholder={t('选择目标项目', 'Choose projects')}
          value={targets}
          onChange={setTargets}
          disabled={busy}
          optionFilterProp="label"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          maxTagCount="responsive"
          placement="bottomLeft"
          listHeight={192}
          getPopupContainer={(trigger) => trigger.parentElement!}
        />
        {!projects.length && (
          <Typography.Text type="secondary">
            {t(
              '请先创建项目。购物车内容会保留。',
              'Create a project first. Your cart will be kept.',
            )}
          </Typography.Text>
        )}
      </Flex>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button size="small" onClick={() => void refresh()}>
              {t('重试', 'Retry')}
            </Button>
          }
        />
      )}
      {result && (
        <Alert
          type={result.failures.length ? 'warning' : 'success'}
          closable
          onClose={() => setResult(undefined)}
          title={t(
            `已完成 ${result.removedIds.length} 个图标，保留 ${new Set(result.failures.map((f) => f.itemId)).size} 个待重试图标`,
            `${result.removedIds.length} icons completed; ${new Set(result.failures.map((f) => f.itemId)).size} retained for retry`,
          )}
          description={
            result.failures.length
              ? result.failures
                  .slice(0, 3)
                  .map((f) => `${f.name} → ${f.projectName}: ${f.reason}`)
                  .join('；')
              : t(
                  '已添加到所有目标项目（已有图标自动跳过）。',
                  'Added to all target projects. Existing icons were skipped.',
                )
          }
        />
      )}
      <Flex align="center" justify="space-between">
        <Flex gap={12} align="center">
          <Checkbox
            checked={items.length > 0 && selected.length === items.length}
            indeterminate={selected.length > 0 && selected.length < items.length}
            disabled={busy || !items.length}
            onChange={(event) =>
              setSelected(event.target.checked ? items.map((item) => item.id) : [])
            }
          >
            {t('全选', 'Select all')}
          </Checkbox>
          <Typography.Text>
            {t(`已选 ${selected.length} 个`, `${selected.length} selected`)}
          </Typography.Text>
        </Flex>
        <Popconfirm
          title={t('从购物车移除选中的图标？', 'Remove selected icons from the cart?')}
          onConfirm={async () => {
            setBusy(true);
            try {
              await remove(selected);
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Button danger disabled={!selected.length || busy || !!pending.size}>
            {t('移除选中', 'Remove selected')}
          </Button>
        </Popconfirm>
      </Flex>
      <CartGrid
        items={items}
        selected={selectedSet}
        loading={loading}
        disabled={busy}
        onToggle={toggle}
      />
    </Drawer>
  );
}
