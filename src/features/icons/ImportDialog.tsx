import { useRef, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Empty, Flex, Modal, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { api, base64 } from '../../api';
import { usePreferences } from '../../preferences';
import { SvgPreview } from '../../components/SvgPreview';
import type { ImportJob } from '../../types';

interface PreviewItem {
  key: number;
  name: string;
  svg: string;
}
export function ImportDialog({
  projectId,
  onClose,
  onImported,
}: {
  projectId: number;
  onClose: () => void;
  onImported: (job: ImportJob) => Promise<void>;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [selected, setSelected] = useState(new Set<number>());
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const running = useRef(false);
  const nextKey = useRef(0);
  async function preview(files: File[]) {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    const next: PreviewItem[] = [],
      failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!/\.(svg|js|zip)$/i.test(file.name) || file.size > 20 * 1024 * 1024)
            throw new Error(
              t('仅支持 20 MB 以内的 SVG、JS、ZIP', 'Use SVG, JS or ZIP files up to 20 MB'),
            );
          const result = await api<{
            items: Omit<PreviewItem, 'key'>[];
            rejected: { name: string; reason: string }[];
          }>(`/projects/${projectId}/icons/import-preview`, 'POST', {
            fileName: file.name,
            ...(/\.zip$/i.test(file.name)
              ? { data: await base64(file) }
              : { text: await file.text() }),
          });
          if (items.length + next.length + result.items.length > 2000)
            throw new Error(t('单次最多预览 2000 个图标', 'Preview up to 2000 icons at a time'));
          next.push(...result.items.map((item) => ({ ...item, key: nextKey.current++ })));
          failures.push(
            ...result.rejected.map((item) => `${file.name} / ${item.name}: ${item.reason}`),
          );
        } catch (error) {
          failures.push(`${file.name}: ${(error as Error).message}`);
        }
      }
      setItems((previous) => [...previous, ...next]);
      setErrors((previous) => [...previous, ...failures]);
    } finally {
      running.current = false;
      setLoading(false);
    }
  }
  const busy = loading || saving;
  return (
    <Modal
      open
      width={840}
      className="import-dialog"
      centered
      title={t('导入图标', 'Import icons')}
      onCancel={onClose}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      styles={{
        body: {
          height: 'min(66vh, 620px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
      footer={
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Typography.Text>
            {t(
              `已选 ${selected.size} / ${items.length} 个`,
              `${selected.size} / ${items.length} selected`,
            )}
          </Typography.Text>
          <Flex gap={8}>
            <Button disabled={busy} onClick={onClose}>
              {t('取消', 'Cancel')}
            </Button>
            <Button
              type="primary"
              disabled={!selected.size || loading}
              loading={saving}
              onClick={async () => {
                if (running.current) return;
                running.current = true;
                setSaving(true);
                try {
                  const { job } = await api<{ job: ImportJob }>(
                    `/projects/${projectId}/icons/import`,
                    'POST',
                    {
                      items: items
                        .filter((item) => selected.has(item.key))
                        .map(({ name, svg }) => ({ name, svg })),
                    },
                  );
                  await onImported(job);
                  onClose();
                } catch (error) {
                  message.error((error as Error).message);
                } finally {
                  running.current = false;
                  setSaving(false);
                }
              }}
            >
              {t('确认导入', 'Confirm import')}
            </Button>
          </Flex>
        </Flex>
      }
    >
      <div className="import-upload">
        <Upload.Dragger
          accept=".svg,.js,.zip"
          multiple
          showUploadList={false}
          disabled={busy}
          beforeUpload={(file, files) => {
            if (file === files[0]) void preview(files);
            return Upload.LIST_IGNORE;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {t('拖入文件，或点击选择文件', 'Drop files here or click to browse')}
          </p>
          <p className="ant-upload-hint">
            {t(
              '支持 SVG、iconfont.js 和 ZIP。确认后导入项目根目录。',
              'SVG, iconfont.js and ZIP. Review and select icons before importing.',
            )}
          </p>
        </Upload.Dragger>
      </div>
      {!!errors.length && (
        <Alert
          style={{ marginTop: 8, flexShrink: 0 }}
          type="warning"
          showIcon
          title={t(`${errors.length} 项未通过校验`, `${errors.length} items rejected`)}
          description={
            <Typography.Paragraph
              ellipsis={{ rows: 1 }}
              style={{ margin: 0 }}
              title={errors.join('\n')}
            >
              {errors.join('; ')}
            </Typography.Paragraph>
          }
        />
      )}
      <Flex gap={8} style={{ marginBlock: 12, flexShrink: 0 }}>
        <Button
          disabled={busy || !items.length}
          onClick={() =>
            setSelected(
              selected.size === items.length ? new Set() : new Set(items.map((item) => item.key)),
            )
          }
        >
          {selected.size === items.length && items.length
            ? t('取消全选', 'Deselect all')
            : t('全选', 'Select all')}
        </Button>
        <Button
          disabled={busy || !items.length}
          onClick={() => {
            setItems([]);
            setSelected(new Set());
            setErrors([]);
          }}
        >
          {t('清空', 'Clear')}
        </Button>
        {loading && <Typography.Text>{t('正在校验文件…', 'Validating files…')}</Typography.Text>}
      </Flex>
      <div className="import-results">
        {items.length ? (
          <div className="import-preview-grid">
            {items.map((item) => (
              <Card key={item.key} size="small" styles={{ body: { padding: 8 } }}>
                <Checkbox
                  disabled={busy}
                  checked={selected.has(item.key)}
                  onChange={() =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (next.has(item.key)) next.delete(item.key);
                      else next.add(item.key);
                      return next;
                    })
                  }
                >
                  <Flex vertical align="center" gap={4}>
                    <SvgPreview svg={item.svg} />
                    <Typography.Text
                      ellipsis
                      style={{ maxWidth: 76, fontSize: 12 }}
                      title={item.name}
                    >
                      {item.name}
                    </Typography.Text>
                  </Flex>
                </Checkbox>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description={t('添加文件以预览图标', 'Add files to preview icons')} />
        )}
      </div>
    </Modal>
  );
}
