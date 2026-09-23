import { useState } from 'react';
import { App, Form, Input, Modal, Radio } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';

export function CreateUserDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={t('添加用户', 'Add user')}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={busy}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ role: 'member' }}
        onFinish={async (values) => {
          setBusy(true);
          try {
            await api('/users', 'POST', values);
            await onSaved();
            onClose();
          } catch (error) {
            message.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form.Item
          name="username"
          label={t('用户名', 'Username')}
          rules={[
            {
              required: true,
              pattern: /^[\w.@-]{2,80}$/,
              message: t('2–80 位字母、数字或 . @ _ -', '2–80 letters, digits or . @ _ -'),
            },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label={t('初始密码', 'Initial password')}
          rules={[{ required: true, min: 6, max: 128 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="role" label={t('角色', 'Role')}>
          <Radio.Group
            options={[
              { value: 'member', label: t('用户', 'Member') },
              { value: 'admin', label: t('管理员', 'Admin') },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
