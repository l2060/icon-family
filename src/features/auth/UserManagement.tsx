import { useCallback, useEffect, useState } from 'react';
import { App, Button, Flex, Input, Modal, Popconfirm, Table, Tag } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { User } from '../../types';
import { PasswordForm } from './PasswordForm';
import { CreateUserDialog } from './CreateUserDialog';

export function UserManagement({ user }: { user: User }) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User>();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await api<{ users: User[] }>('/users')).users);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load().catch((error) => message.error(error.message));
  }, [load, message]);
  return (
    <>
      <Flex gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder={t('搜索用户名', 'Search users')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Button type="primary" onClick={() => setCreating(true)}>
          {t('添加用户', 'Add user')}
        </Button>
      </Flex>
      <Table<User>
        className="user-management-table"
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 600, y: 360 }}
        pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: false }}
        dataSource={users.filter((item) =>
          item.username.toLowerCase().includes(search.toLowerCase()),
        )}
        columns={[
          {
            title: t('用户名', 'Username'),
            dataIndex: 'username',
            render: (name, item) => (
              <>
                {name} {item.id === user.id && <Tag>{t('我', 'Me')}</Tag>}
              </>
            ),
          },
          {
            title: t('角色', 'Role'),
            render: (_, item) => (
              <Tag color={item.role === 'admin' ? 'purple' : 'default'}>
                {item.role === 'admin' ? t('管理员', 'Admin') : t('用户', 'Member')}
              </Tag>
            ),
          },
          {
            title: t('状态', 'Status'),
            render: (_, item) => (
              <Tag color={item.status === 'active' ? 'green' : 'default'}>
                {item.status === 'active' ? t('正常', 'Active') : t('已删除', 'Deleted')}
              </Tag>
            ),
          },
          {
            title: t('操作', 'Actions'),
            render: (_, item) =>
              item.id !== user.id && item.status === 'active' ? (
                <Flex gap={8}>
                  <Button size="small" onClick={() => setResetting(item)}>
                    {t('重置密码', 'Reset password')}
                  </Button>
                  <Popconfirm
                    title={t('确认删除该用户？', 'Delete this user?')}
                    onConfirm={async () => {
                      try {
                        await api(`/users/${item.id}`, 'DELETE');
                        await load();
                      } catch (error) {
                        message.error((error as Error).message);
                      }
                    }}
                  >
                    <Button danger size="small">
                      {t('删除', 'Delete')}
                    </Button>
                  </Popconfirm>
                </Flex>
              ) : (
                '—'
              ),
          },
        ]}
      />
      {creating && <CreateUserDialog onClose={() => setCreating(false)} onSaved={load} />}
      {resetting && (
        <Modal
          open
          width={480}
          title={t(`重置密码：${resetting.username}`, `Reset password: ${resetting.username}`)}
          footer={null}
          onCancel={() => setResetting(undefined)}
        >
          <PasswordForm target={resetting} onSaved={() => setResetting(undefined)} />
        </Modal>
      )}
    </>
  );
}
