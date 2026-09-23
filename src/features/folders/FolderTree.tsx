import { useEffect, useState, type Key } from 'react';
import { App, Button, Dropdown, Flex, Tree, Typography, type MenuProps } from 'antd';
import { FolderOutlined, MoreOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Project, ProjectDetail, ProjectFolder, User } from '../../types';
import { ProjectColorBar, projectColor } from '../projects/ProjectTheme';
import { FolderForm } from './FolderForm';
import { descendantIds, folderNodes, folderPath, type FolderNode } from './folderUtils';

interface NavigationNode {
  key: string;
  title: string;
  projectId: number;
  folderId?: string;
  children: NavigationNode[];
}
const projectKey = (id: number) => `project-${id}`;
export function FolderTree({
  projects,
  activeId,
  detail,
  selected,
  user,
  onSelect,
  onChanged,
  onProjectAction,
}: {
  projects: Project[];
  activeId?: number;
  detail?: ProjectDetail;
  selected?: string;
  user: User;
  onSelect: (projectId: number, folderId?: string) => void;
  onChanged: (project: Project, removed?: number[]) => void;
  onProjectAction: (action: string, project: Project) => void;
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();
  const [form, setForm] = useState<{
    project: Project;
    folder?: ProjectFolder;
    parentId?: string;
  }>();
  const [expanded, setExpanded] = useState<Key[]>([]);
  useEffect(() => {
    if (!activeId) return;
    setExpanded((previous) => [
      ...new Set([
        ...previous,
        projectKey(activeId),
        ...folderPath(detail?.project.settings.folders || [], selected).map((folder) => folder.id),
      ]),
    ]);
  }, [activeId, selected, detail?.project.settings.folders]);
  async function remove(project: Project, folder: ProjectFolder) {
    try {
      const latest = await api<ProjectDetail>(`/projects/${project.id}?view=workspace`);
      const descendants = descendantIds(latest.project.settings.folders || [], folder.id);
      const count = latest.icons.filter(
        (icon) => icon.folder_id && descendants.has(icon.folder_id),
      ).length;
      modal.confirm({
        title: t(`删除目录“${folder.name}”？`, `Delete folder “${folder.name}”?`),
        content: t(
          `将删除 ${Math.max(0, descendants.size - 1)} 个子目录和 ${count} 个图标。`,
          `This deletes ${Math.max(0, descendants.size - 1)} subfolders and ${count} icons.`,
        ),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            const result = await api<{ project: Project; removedIconIds: number[] }>(
              `/projects/${project.id}/folders/${folder.id}`,
              'DELETE',
            );
            onChanged(result.project, result.removedIconIds);
          } catch (error) {
            message.error((error as Error).message);
            throw error;
          }
        },
      });
    } catch (error) {
      message.error((error as Error).message);
    }
  }
  const nodes: NavigationNode[] = projects.map((project) => {
    const decorate = (nodes: FolderNode[]): NavigationNode[] =>
      nodes.map((node) => ({
        ...node,
        projectId: project.id,
        folderId: node.key,
        children: decorate(node.children),
      }));
    return {
      key: projectKey(project.id),
      title: project.name,
      projectId: project.id,
      children: decorate(folderNodes(project.settings.folders || [])),
    };
  });
  return (
    <div className="project-folder-tree">
      <Tree
        blockNode
        virtual={false}
        expandedKeys={expanded}
        onExpand={setExpanded}
        selectedKeys={activeId ? [selected || projectKey(activeId)] : []}
        onSelect={(_, info) => onSelect(info.node.projectId, info.node.folderId)}
        treeData={nodes}
        titleRender={(node) => {
          const project = projects.find((project) => project.id === node.projectId);
          if (!project) return null;
          const folder = node.folderId
            ? project.settings.folders?.find((folder) => folder.id === node.folderId)
            : undefined;
          if (node.folderId && !folder) return null;
          const canSettings = user.role === 'admin' || project.owner_id === user.id;
          const count = folder
            ? detail?.project.id === project.id
              ? detail.icons.filter((icon) => icon.folder_id === folder.id).length
              : undefined
            : project.icon_count;
          const menu: MenuProps = {
            items: folder
              ? [
                  { key: 'create', label: t('新建子目录', 'New subfolder') },
                  { key: 'folder-edit', label: t('重命名 / 移动', 'Rename / Move') },
                  {
                    key: 'folder-delete',
                    label: t('删除目录', 'Delete folder'),
                    danger: true,
                  },
                ]
              : [
                  { key: 'create', label: t('新建目录', 'New folder') },
                  ...(canSettings
                    ? [
                        { key: 'edit', label: t('项目设置', 'Settings') },
                        {
                          key: 'delete',
                          label: t('删除项目', 'Delete project'),
                          danger: true,
                        },
                      ]
                    : []),
                ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              if (key === 'create') setForm({ project, parentId: folder?.id });
              else if (key === 'folder-edit') setForm({ project, folder });
              else if (key === 'folder-delete' && folder) void remove(project, folder);
              else onProjectAction(key, project);
            },
          };
          return (
            <Dropdown trigger={['contextMenu']} menu={menu}>
              <Flex align="center" gap={4} className={folder ? 'folder-row' : 'project-row'}>
                {folder ? (
                  <FolderOutlined style={{ color: projectColor(project) }} />
                ) : (
                  <ProjectColorBar project={project} />
                )}
                <span className={folder ? 'folder-name' : 'project-name'} title={node.title}>
                  {node.title}
                </span>
                {count !== undefined && (
                  <Typography.Text type="secondary" className="folder-count">
                    {count}
                  </Typography.Text>
                )}
                <span onClick={(event) => event.stopPropagation()}>
                  <Dropdown trigger={['click']} menu={menu}>
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreOutlined />}
                      aria-label={
                        folder
                          ? `${t('目录操作', 'Folder actions')} ${folder.name}`
                          : `${t('项目操作', 'Project actions')} ${project.name}`
                      }
                    />
                  </Dropdown>
                </span>
              </Flex>
            </Dropdown>
          );
        }}
      />
      {form && <FolderForm {...form} onClose={() => setForm(undefined)} onSaved={onChanged} />}
    </div>
  );
}
