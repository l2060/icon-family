import { useRef, useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { api, iconName } from '../../api';
import { usePreferences } from '../../preferences';
import type { Icon, ProjectDetail } from '../../types';

export function RenameIconDialog({
  icon,
  project,
  onClose,
  onSaved,
}: {
  icon: Icon;
  project: ProjectDetail['project'];
  onClose: () => void;
  onSaved: (icon: Icon) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ slug: string }>();
  const slug = Form.useWatch('slug', form) ?? icon.slug;
  const [saving, setSaving] = useState(false);
  const input = useRef<InputRef>(null);
  async function save({ slug }: { slug: string }) {
    if (saving) return;
    if (slug.trim() === icon.slug) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ icon: Icon }>(
        `/projects/${project.id}/icons/${icon.id}`,
        'PATCH',
        {
          slug: slug.trim(),
          baseRevision: icon.revision,
        },
      );
      onSaved(result.icon);
      message.success(t('代码已重命名', 'Code renamed'));
      onClose();
    } catch (error) {
      form.setFields([{ name: 'slug', errors: [(error as Error).message] }]);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      title={t('重命名', 'Rename')}
      width={420}
      okText={t('保存', 'Save')}
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      cancelButtonProps={{ disabled: saving }}
      afterOpenChange={(open) => {
        if (open) input.current?.focus({ cursor: 'all' });
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ slug: icon.slug }} onFinish={save}>
        <Form.Item
          name="slug"
          label={t('图标代码后缀', 'Icon code suffix')}
          extra={`${t('完整代码', 'Full code')}: ${iconName(project.prefix, slug)}`}
          rules={[
            { required: true, whitespace: true, message: t('请输入代码', 'Enter a code') },
            {
              pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
              message: t(
                '使用小写字母、数字和连字符',
                'Use lowercase letters, numbers and hyphens',
              ),
            },
          ]}
        >
          <Input ref={input} disabled={saving} autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
