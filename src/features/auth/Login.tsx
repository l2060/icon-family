import { useState } from 'react';
import { Alert, Button, ConfigProvider, Flex, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginBrand } from './LoginBrand';
import './login.css';
import { api } from '../../api';
import { PreferenceControls, usePreferences } from '../../preferences';
import type { User } from '../../types';

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const { t } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <ConfigProvider
      theme={{ token: { colorPrimary: '#7060ef', borderRadius: 8, controlHeight: 42 } }}
    >
      <Flex className="login-page" align="center" justify="center">
        <Flex className="login-panel">
          <LoginBrand />
          <Flex vertical className="login-form-panel">
            <Flex justify="end" className="login-preferences">
              <PreferenceControls />
            </Flex>
            <Typography.Title level={2}>
              {t('登录图标库', 'Welcome to your library')}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              {t(
                '登录你的账号，让每一个图标井然有序。',
                'Sign in and give every icon a place to call home.',
              )}
            </Typography.Paragraph>
            <Form
              layout="vertical"
              onFinish={async (values: { username: string; password: string }) => {
                setBusy(true);
                setError('');
                try {
                  onLogin((await api<{ user: User }>('/auth/login', 'POST', values)).user);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Form.Item
                name="username"
                label={t('用户名', 'Username')}
                rules={[{ required: true }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder={t('请输入用户名', 'Enter your username')}
                  autoFocus
                  autoComplete="username"
                />
              </Form.Item>
              <Form.Item name="password" label={t('密码', 'Password')} rules={[{ required: true }]}>
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder={t('请输入密码', 'Enter your password')}
                  autoComplete="current-password"
                />
              </Form.Item>
              {error && <Alert type="error" title={error} showIcon className="form-alert" />}
              <Button
                className="login-submit"
                block
                type="primary"
                htmlType="submit"
                loading={busy}
              >
                {t('登录', 'Sign in')}
              </Button>
            </Form>
            <Typography.Paragraph type="secondary" className="login-account-hint">
              {t('首次启动默认账号：admin / adminadmin', 'Initial account: admin / adminadmin')}
            </Typography.Paragraph>
          </Flex>
        </Flex>
      </Flex>
    </ConfigProvider>
  );
}
