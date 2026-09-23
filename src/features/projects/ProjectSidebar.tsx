import { useState } from 'react';
import { Avatar, Button, Empty, Flex, Input, Layout, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { PreferenceControls, usePreferences } from '../../preferences';
import type { Project, ProjectDetail, User } from '../../types';
import { ShoppingButtons } from '../cart/ShoppingButtons';
import { FolderTree } from '../folders/FolderTree';

export function ProjectSidebar({
  projects,
  activeId,
  user,
  onSelect,
  onCreate,
  onAction,
  onAccount,
  detail,
  folderId,
  onOrganizationChange,
}: {
  projects: Project[];
  activeId?: number;
  user: User;
  onSelect: (id: number, folderId?: string) => void;
  onCreate: () => void;
  onAction: (action: string, project: Project) => void;
  onAccount: () => void;
  detail?: ProjectDetail;
  folderId?: string;
  onOrganizationChange: (project: Project, removed?: number[]) => void;
}) {
  const { t } = usePreferences();
  const [search, setSearch] = useState('');
  const visible = projects.filter((project) =>
    `${project.name} ${project.prefix}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Layout.Sider width={248} theme="light" className="project-sidebar">
      <Flex vertical className="sidebar-content">
        <Flex vertical gap={16} className="sidebar-header">
          <Typography.Title level={3}>IconFamily</Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} block onClick={onCreate}>
            {t('新建项目', 'New project')}
          </Button>
          {!activeId && <ShoppingButtons />}
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('搜索项目', 'Search projects')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Flex>
        <div className="project-list">
          {visible.length ? (
            <FolderTree
              projects={visible}
              activeId={activeId}
              detail={detail}
              selected={folderId}
              user={user}
              onSelect={onSelect}
              onChanged={onOrganizationChange}
              onProjectAction={onAction}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('没有项目', 'No projects')}
            />
          )}
        </div>
        <Flex vertical gap={16} className="sidebar-footer">
          <PreferenceControls />
          <Button type="text" block onClick={onAccount}>
            <Flex align="center" gap={8}>
              <Avatar size="small">{user.username.slice(0, 1).toUpperCase()}</Avatar>
              {user.username}
              <Typography.Text type="secondary">
                {user.role === 'admin' ? t('管理员', 'Admin') : t('用户', 'Member')}
              </Typography.Text>
            </Flex>
          </Button>
        </Flex>
      </Flex>
    </Layout.Sider>
  );
}
