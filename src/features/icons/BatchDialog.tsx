import { useState } from 'react';
import { App, ColorPicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Project } from '../../types';

export type BatchType = 'fitMargin' | 'color' | 'stripPrefix' | 'delete';
export function BatchDialog({
  type,
  project,
  ids,
  onClose,
  onSaved,
}: {
  type: BatchType;
  project: Project;
  ids: number[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const mode = Form.useWatch('mode', form);
  const title = {
    fitMargin: t('整体调整边距', 'Adjust margins'),
    color: t('批量去色', 'Recolor icons'),
    stripPrefix: t('移除前缀', 'Remove prefix'),
    delete: t('删除图标', 'Delete icons'),
  }[type];
  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      confirmLoading={busy}
      okButtonProps={{ danger: type === 'delete' }}
      onOk={() => form.submit()}
    >
      <Typography.Paragraph>
        {t(`将应用于 ${ids.length} 个选中图标。`, `Applies to ${ids.length} selected icons.`)}
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          margin: project.settings.margin ?? 100,
          mode: 'currentColor',
          color: '#1677ff',
          prefix: project.prefix,
        }}
        onFinish={async (values) => {
          setBusy(true);
          try {
            await api(`/projects/${project.id}/icons/batch`, 'POST', {
              iconIds: ids,
              operation: { ...values, type },
            });
            await onSaved();
            onClose();
            message.success(t('已更新', 'Updated'));
          } catch (e) {
            message.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {type === 'fitMargin' && (
          <Form.Item
            name="margin"
            label={t('项目边距', 'Project margin')}
            extra={t(
              '同时更新项目默认边距，用于以后导入的图标。',
              'Also updates the default margin for future imports.',
            )}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={512} step={0.1} />
          </Form.Item>
        )}
        {type === 'stripPrefix' && (
          <Form.Item
            name="prefix"
            label={t('要移除的前缀', 'Prefix to remove')}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input autoFocus />
          </Form.Item>
        )}
        {type === 'color' && (
          <>
            <Form.Item name="mode" label={t('颜色模式', 'Color mode')}>
              <Select
                options={[
                  { value: 'currentColor', label: 'currentColor' },
                  { value: 'custom', label: t('自定义颜色', 'Custom color') },
                ]}
              />
            </Form.Item>
            {mode === 'custom' && (
              <Form.Item
                name="color"
                label={t('颜色', 'Color')}
                getValueFromEvent={(_, hex: string) => hex}
              >
                <ColorPicker showText />
              </Form.Item>
            )}
          </>
        )}
      </Form>
    </Modal>
  );
}
