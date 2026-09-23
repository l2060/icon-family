import { Table, Tag } from 'antd';
import { usePreferences } from '../../preferences';
import type { User } from '../../types';

export function ProjectCollaborators({
  users,
  ownerId,
  value = [],
  onChange,
  disabled,
  loading,
  everyoneCanEdit,
}: {
  users: User[];
  ownerId?: number;
  value?: number[];
  onChange?: (ids: number[]) => void;
  disabled?: boolean;
  loading?: boolean;
  everyoneCanEdit?: boolean;
}) {
  const { t } = usePreferences();
  return (
    <Table<User>
      className="project-member-table"
      size="small"
      rowKey="id"
      dataSource={[...users].sort((a, b) => Number(b.id === ownerId) - Number(a.id === ownerId))}
      loading={loading}
      scroll={{ y: '100%' }}
      pagination={{ pageSize: 6, showSizeChanger: false, hideOnSinglePage: false }}
      rowSelection={
        everyoneCanEdit
          ? undefined
          : {
              selectedRowKeys: [
                ...new Set([
                  ...value,
                  ...users
                    .filter((user) => user.role === 'admin' || user.id === ownerId)
                    .map((user) => user.id),
                ]),
              ],
              preserveSelectedRowKeys: true,
              onChange: (keys) =>
                onChange?.(
                  keys
                    .map(Number)
                    .filter((id) =>
                      users.some(
                        (user) => user.id === id && user.role !== 'admin' && user.id !== ownerId,
                      ),
                    ),
                ),
              getCheckboxProps: (user) => ({
                disabled:
                  disabled || everyoneCanEdit || user.role === 'admin' || user.id === ownerId,
              }),
            }
      }
      columns={[
        { title: t('用户名', 'Username'), dataIndex: 'username' },
        {
          title: t('角色', 'Role'),
          render: (_, user) => (
            <Tag>{user.role === 'admin' ? t('管理员', 'Admin') : t('用户', 'Member')}</Tag>
          ),
        },
        {
          title: t('项目权限', 'Project access'),
          render: (_, user) =>
            user.id === ownerId
              ? t('创建者 · 固有权限', 'Owner · Built-in access')
              : user.role === 'admin'
                ? t('管理员 · 固有权限', 'Admin · Built-in access')
                : everyoneCanEdit
                  ? t('所有人可修改', 'Everyone can edit')
                  : value.includes(user.id)
                    ? t('协作者', 'Collaborator')
                    : t('未授权', 'No access'),
        },
      ]}
    />
  );
}
