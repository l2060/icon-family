import { useCallback, useState } from 'react';
import { Button, Empty, Layout, Spin } from 'antd';
import { usePreferences } from '../preferences';
import { useProjects } from '../hooks/useProjects';
import type { Project, User } from '../types';
import { ProjectSidebar } from '../features/projects/ProjectSidebar';
import { ProjectForm } from '../features/projects/ProjectForm';
import { DeleteProject } from '../features/projects/ProjectActions';
import { AccountDialog } from '../features/auth/AccountDialog';
import { IconWorkspace } from '../features/icons/IconWorkspace';
import { CartProvider } from '../features/cart/CartProvider';

export function ApplicationLayout({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = usePreferences();
  const {
    projects,
    activeId,
    folderId,
    showAll,
    selectView,
    selectFolder,
    updateOrganization,
    detail,
    loading,
    select,
    refresh,
    updateIcon,
  } = useProjects();
  const [form, setForm] = useState<{ project?: Project }>();
  const [deleting, setDeleting] = useState<Project>();
  const [account, setAccount] = useState(false);
  const refreshCurrent = useCallback(() => refresh(activeId), [refresh, activeId]);
  const openSettings = useCallback(() => {
    if (detail) setForm({ project: detail.project });
  }, [detail]);
  async function action(action: string, project: Project) {
    if (action === 'edit') setForm({ project });
    if (action === 'delete') setDeleting(project);
  }
  return (
    <CartProvider projects={projects} activeId={activeId} onImported={refreshCurrent}>
      <Layout className="app-shell">
        <ProjectSidebar
          projects={projects}
          activeId={activeId}
          user={user}
          onSelect={(id, folder) => {
            if (id === activeId) selectFolder(folder);
            else void select(id, false, folder);
          }}
          onCreate={() => setForm({})}
          onAction={(a, p) => void action(a, p)}
          onAccount={() => setAccount(true)}
          detail={detail}
          folderId={folderId}
          onOrganizationChange={updateOrganization}
        />
        <Layout.Content className="workspace-container">
          <Spin spinning={loading} classNames={{ root: 'workspace-spinner' }}>
            {detail && detail.project.id === activeId ? (
              <IconWorkspace
                key={detail.project.id}
                detail={detail}
                projects={projects}
                folderId={folderId}
                showAll={showAll}
                onViewChange={selectView}
                onFolderSelect={selectFolder}
                onOrganizationChange={updateOrganization}
                onRefresh={refreshCurrent}
                onIconSaved={updateIcon}
                onSettings={
                  user.role === 'admin' || detail.project.owner_id === user.id
                    ? openSettings
                    : undefined
                }
              />
            ) : (
              <Empty
                className="workspace-empty"
                description={t(
                  '创建或选择项目，开始管理图标。',
                  'Create or select a project to manage icons.',
                )}
              >
                <Button type="primary" onClick={() => setForm({})}>
                  {t('创建项目', 'Create project')}
                </Button>
              </Empty>
            )}
          </Spin>
        </Layout.Content>
        {form && (
          <ProjectForm
            admin={user.role === 'admin'}
            creatorId={user.id}
            project={form.project}
            onClose={() => setForm(undefined)}
            onSaved={refresh}
          />
        )}
        {deleting && (
          <DeleteProject
            project={deleting}
            onClose={() => setDeleting(undefined)}
            onDeleted={() => refresh()}
          />
        )}
        {account && (
          <AccountDialog user={user} onClose={() => setAccount(false)} onLogout={onLogout} />
        )}
      </Layout>
    </CartProvider>
  );
}
