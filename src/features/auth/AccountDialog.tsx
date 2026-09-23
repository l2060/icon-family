import { Button, Card, Col, Descriptions, Modal, Row, Tabs } from 'antd';
import { usePreferences } from '../../preferences';
import type { User } from '../../types';
import { PasswordForm } from './PasswordForm';
import { UserManagement } from './UserManagement';

export function AccountDialog({
  user,
  onClose,
  onLogout,
}: {
  user: User;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = usePreferences();
  return (
    <Modal
      open
      width={820}
      centered
      className="account-dialog"
      styles={{ body: { height: 560 } }}
      title={t('账号与用户', 'Account and users')}
      onCancel={onClose}
      footer={
        <Button danger onClick={onLogout}>
          {t('退出登录', 'Sign out')}
        </Button>
      }
    >
      <Tabs
        destroyOnHidden
        items={[
          {
            key: 'account',
            label: t('我的账号', 'My account'),
            children: (
              <Row gutter={[24, 16]}>
                <Col xs={24} md={9}>
                  <Card title={t('账号信息', 'Account details')}>
                    <Descriptions
                      column={1}
                      items={[
                        { key: 'name', label: t('用户名', 'Username'), children: user.username },
                        {
                          key: 'role',
                          label: t('角色', 'Role'),
                          children:
                            user.role === 'admin' ? t('管理员', 'Admin') : t('用户', 'Member'),
                        },
                      ]}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={15}>
                  <Card title={t('修改密码', 'Change password')}>
                    <PasswordForm />
                  </Card>
                </Col>
              </Row>
            ),
          },
          ...(user.role === 'admin'
            ? [
                {
                  key: 'users',
                  label: t('用户管理', 'User management'),
                  children: <UserManagement user={user} />,
                },
              ]
            : []),
        ]}
      />
    </Modal>
  );
}
