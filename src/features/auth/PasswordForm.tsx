import { useState } from 'react';
import { Alert, App, Button, Form, Input } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { User } from '../../types';

export function PasswordForm({ target, onSaved }: { target?: User; onSaved?: () => void }) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Form
      form={form}
      layout="vertical"
      style={{ width: '100%' }}
      onFinish={async (values) => {
        setBusy(true);
        try {
          await api(target ? `/users/${target.id}/password` : '/auth/password', 'POST', {
            password: values.password,
            ...(!target ? { currentPassword: values.currentPassword } : {}),
          });
          form.resetFields();
          message.success(
            target ? t('密码已重置', 'Password reset') : t('密码已修改', 'Password changed'),
          );
          onSaved?.();
        } catch (error) {
          message.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={
          target
            ? t(
                '重置后，该用户需要使用新密码重新登录。',
                'This user will need to sign in again with the new password.',
              )
            : t(
                '修改后保留当前登录，其他设备需重新登录。',
                'This session stays signed in. Other devices must sign in again.',
              )
        }
      />
      {!target && (
        <Form.Item
          name="currentPassword"
          label={t('当前密码', 'Current password')}
          rules={[{ required: true }]}
        >
          <Input.Password autoComplete="current-password" disabled={busy} />
        </Form.Item>
      )}
      <Form.Item
        name="password"
        label={t('新密码', 'New password')}
        rules={[{ required: true, min: 6, max: 128 }]}
      >
        <Input.Password autoComplete="new-password" disabled={busy} />
      </Form.Item>
      <Form.Item
        name="confirm"
        label={t('确认新密码', 'Confirm new password')}
        dependencies={['password']}
        rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              value === getFieldValue('password')
                ? Promise.resolve()
                : Promise.reject(new Error(t('两次密码不一致', 'Passwords do not match'))),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" disabled={busy} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={busy}>
        {target ? t('重置密码', 'Reset password') : t('修改密码', 'Change password')}
      </Button>
    </Form>
  );
}
