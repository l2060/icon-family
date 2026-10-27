import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Flex, Input, Segmented, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { api, copyText } from '../../api';
import { usePreferences } from '../../preferences';
import { useUserPreferences } from '../../userPreferences';
import { IconSortControls } from './IconSortControls';
import type { Icon, IconFormat, ImportJob, Project, ProjectDetail } from '../../types';
import { MoveIconsDialog, type MoveResult } from '../folders/MoveIconsDialog';
import { CopyIconDialog } from './CopyIconDialog';
import { IconGrid } from './IconGrid';
import { WorkspaceHeader } from './WorkspaceHeader';
import { LocalImport } from './LocalImport';
import { ShoppingButtons } from '../cart/ShoppingButtons';
import { ImportResult } from './ImportResult';
import { BatchDialog, type BatchType } from './BatchDialog';
import { useIconSelection } from './useIconSelection';
import { RenameIconDialog } from './RenameIconDialog';
import { ProjectThemeContext, projectColor } from '../projects/ProjectTheme';
const SvgEditor = lazy(() =>
  import('../editor/SvgEditor').then((module) => ({ default: module.SvgEditor })),
);

export const IconWorkspace = memo(function IconWorkspace({
  detail,
  onRefresh,
  onIconSaved,
  onSettings,
  projects,
  folderId,
  showAll,
  onViewChange,
  onFolderSelect,
  onOrganizationChange,
}: {
  detail: ProjectDetail;
  onRefresh: () => Promise<void>;
  onIconSaved: (projectId: number, icon: Icon) => void;
  onSettings?: () => void;
  projects: Project[];
  folderId?: string;
  showAll: boolean;
  onViewChange: (all: boolean) => void;
  onFolderSelect: (id?: string) => void;
  onOrganizationChange: (project: Project, removed?: number[], moved?: MoveResult) => void;
}) {
  const { t, language } = usePreferences();
  const { iconSort } = useUserPreferences();
  const nameCollator = useMemo(
    () => new Intl.Collator(language, { numeric: true, sensitivity: 'base' }),
    [language],
  );
  const { message, modal } = App.useApp();
  const { project, icons } = detail;
  const iconSaved = useCallback(
    (icon: Icon) => onIconSaved(project.id, icon),
    [project.id, onIconSaved],
  );
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<IconFormat>('js');
  const [report, setReport] = useState<ImportJob>();
  const [batch, setBatch] = useState<BatchType>();
  const [editing, setEditing] = useState<Icon>();
  const [renaming, setRenaming] = useState<Icon>();
  const [copying, setCopying] = useState<Icon>();
  const [moving, setMoving] = useState<number[]>();
  const visible = useMemo(
    () =>
      icons
        .filter(
          (icon) =>
            (folderId ? icon.folder_id === folderId : showAll || !icon.folder_id) &&
            `${icon.name} ${icon.slug}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          const direction = iconSort.direction === 'asc' ? 1 : -1;
          if (iconSort.field === 'name') {
            return direction * (nameCollator.compare(a.name, b.name) || a.id - b.id);
          }
          const aTime = Date.parse(a.created_at);
          const bTime = Date.parse(b.created_at);
          // Legacy records without a valid timestamp stay at the end in either direction.
          if (!Number.isFinite(aTime)) return Number.isFinite(bTime) ? 1 : a.id - b.id;
          if (!Number.isFinite(bTime)) return -1;
          return direction * (aTime - bTime || a.id - b.id);
        }),
    [icons, search, folderId, showAll, iconSort, nameCollator],
  );
  const { selected, setSelected, toggle } = useIconSelection(icons, visible);
  useEffect(() => {
    setSelected(new Set());
    setSearch('');
  }, [folderId, showAll, setSelected]);
  const moveIcon = useCallback(
    (icon: Icon) => setMoving(selected.has(icon.id) ? [...selected] : [icon.id]),
    [selected],
  );
  const deleteIcon = useCallback(
    (icon: Icon) => {
      modal.confirm({
        title: t('删除图标', 'Delete icon'),
        content: t(`确认删除“${icon.name}”？`, `Delete “${icon.name}”?`),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await api(`/projects/${project.id}/icons/${icon.id}`, 'DELETE');
            await onRefresh();
          } catch (e) {
            message.error((e as Error).message);
            throw e;
          }
        },
      });
    },
    [project.id, onRefresh, message, modal, t],
  );
  const copy = useCallback(
    (name: string) => {
      void copyText(name)
        .then(() =>
          message.success(
            format === 'ttf'
              ? t(`已复制 Unicode：${name}`, `Copied Unicode: ${name}`)
              : t(`已复制代码：${name}`, `Copied code: ${name}`),
          ),
        )
        .catch((e) => message.error(e.message));
    },
    [message, t, format],
  );
  const all = visible.length > 0 && visible.every((icon) => selected.has(icon.id));
  async function imported(job: ImportJob) {
    setReport(job);
    await onRefresh();
    setSelected(new Set());
  }
  return (
    <ProjectThemeContext.Provider value={projectColor(project)}>
      <Flex vertical className="workspace">
        <WorkspaceHeader
          project={project}
          format={format}
          onFormatChange={setFormat}
          count={icons.length}
          onSettings={onSettings}
          onRefresh={onRefresh}
          folderId={folderId}
          showAll={showAll}
          onFolderSelect={onFolderSelect}
        />
        <Flex gap={8} align="center" wrap className="workspace-toolbar">
          {!folderId && (
            <Segmented
              aria-label={t('图标显示范围', 'Icon scope')}
              value={showAll ? 'all' : 'root'}
              options={[
                { value: 'root', label: t('根目录', 'Root folder') },
                { value: 'all', label: t('全部图标', 'All icons') },
              ]}
              onChange={(value) => onViewChange(value === 'all')}
            />
          )}
          <IconSortControls />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            className="icon-search"
            placeholder={t('搜索项目内图标', 'Search project icons')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <LocalImport projectId={project.id} onImported={imported} />
          <ShoppingButtons />
          <Flex gap={8} align="center" wrap className="push-right">
            {!!selected.size && (
              <>
                <Button onClick={() => setMoving([...selected])}>
                  {t('移动到目录', 'Move to folder')}
                </Button>
                <Typography.Text>
                  {t(`已选 ${selected.size} 个`, `${selected.size} selected`)}
                </Typography.Text>
                <Button size="small" onClick={() => setBatch('fitMargin')}>
                  {t('整体调整边距', 'Adjust margins')}
                </Button>
                <Button size="small" onClick={() => setBatch('color')}>
                  {t('批量去色', 'Recolor')}
                </Button>
                <Button size="small" onClick={() => setBatch('stripPrefix')}>
                  {t('移除前缀', 'Remove prefix')}
                </Button>
                <Button danger size="small" onClick={() => setBatch('delete')}>
                  {t('删除', 'Delete')}
                </Button>
              </>
            )}
            <Button
              size="small"
              disabled={!visible.length}
              onClick={() =>
                setSelected((previous) => {
                  const next = new Set(previous);
                  for (const icon of visible) {
                    if (all) next.delete(icon.id);
                    else next.add(icon.id);
                  }
                  return next;
                })
              }
            >
              {all ? t('取消全选', 'Deselect all') : t('全选', 'Select all')}
            </Button>
          </Flex>
        </Flex>
        <IconGrid
          icons={visible}
          format={format}
          prefix={project.prefix}
          selected={selected}
          onToggle={toggle}
          onEdit={setEditing}
          onCopy={copy}
          onClone={setCopying}
          onMove={moveIcon}
          onRename={setRenaming}
          onDelete={deleteIcon}
          onSelect={setSelected}
        />
        {moving && (
          <MoveIconsDialog
            project={project}
            ids={moving}
            onClose={() => setMoving(undefined)}
            onMoved={(result) => {
              onOrganizationChange(project, [], result);
              setSelected(new Set());
            }}
          />
        )}
        {copying && (
          <CopyIconDialog
            project={project}
            projects={projects}
            icon={copying}
            folderId={folderId}
            onClose={() => setCopying(undefined)}
            onCopied={onRefresh}
          />
        )}
        {report && <ImportResult job={report} onClose={() => setReport(undefined)} />}
        {renaming && (
          <RenameIconDialog
            icon={renaming}
            project={project}
            onClose={() => setRenaming(undefined)}
            onSaved={iconSaved}
          />
        )}
        {batch && (
          <BatchDialog
            type={batch}
            project={project}
            ids={[...selected]}
            onClose={() => setBatch(undefined)}
            onSaved={async () => {
              await onRefresh();
              setSelected(new Set());
            }}
          />
        )}
        {editing && (
          <Suspense fallback={null}>
            <SvgEditor
              icon={editing}
              projectId={project.id}
              onClose={() => setEditing(undefined)}
              onSaved={iconSaved}
            />
          </Suspense>
        )}
      </Flex>
    </ProjectThemeContext.Provider>
  );
});
