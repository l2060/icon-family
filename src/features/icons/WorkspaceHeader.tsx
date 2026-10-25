import { App, Breadcrumb, Button, Flex, Radio, Typography } from 'antd';
import {
  DownloadOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { api, copyText } from '../../api';
import { usePreferences } from '../../preferences';
import type { IconFormat, Project } from '../../types';
import { ProjectColorBar } from '../projects/ProjectTheme';
import { folderPath } from '../folders/folderUtils';

export function WorkspaceHeader({
  project,
  format,
  onFormatChange,
  count,
  onSettings,
  onRefresh,
  folderId,
  showAll,
  onFolderSelect,
}: {
  project: Project;
  format: IconFormat;
  onFormatChange: (format: IconFormat) => void;
  count: number;
  onSettings?: () => void;
  onRefresh: () => Promise<void>;
  folderId?: string;
  showAll: boolean;
  onFolderSelect: (id?: string) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [busy, setBusy] = useState('');
  const url = `/api/projects/${project.id}/${format === 'ttf' ? 'ttf' : 'javascript'}`;
  async function perform(action: 'build' | 'download' | 'copy') {
    setBusy(action);
    try {
      if (action === 'copy') {
        await copyText(new URL(url, location.origin).toString());
        message.success(t('已复制', 'Copied'));
      } else if (action === 'build') {
        await api(`/projects/${project.id}/${format === 'ttf' ? 'ttf' : 'build'}`, 'POST', {});
        await onRefresh();
        message.success(t(`已生成 iconfont.${format}`, `iconfont.${format} generated`));
      } else {
        const response = await fetch(url);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || t('下载失败', 'Download failed'));
        }
        const blob = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blob;
        link.download = `${(project.settings.jsFilename || 'iconfont').replace(/\.(js|ttf)$/i, '')}.${format}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blob), 1000);
        await onRefresh();
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <Flex align="center" justify="space-between" gap={16} wrap className="workspace-header">
      <div className="workspace-title">
        <Flex align="center" gap={10}>
          <Typography.Title level={3} ellipsis className="workspace-project-name">
            <ProjectColorBar project={project} /> {project.name}
          </Typography.Title>
          <Typography.Text type="secondary" className="workspace-icon-count">
            {count} {t('个图标', 'icons')}
          </Typography.Text>
        </Flex>
        <Breadcrumb
          className="folder-breadcrumb"
          items={[
            { title: <a onClick={() => onFolderSelect()}>{project.name}</a> },
            ...(folderId
              ? folderPath(project.settings.folders || [], folderId).map((folder, index, path) => ({
                  title:
                    index === path.length - 1 ? (
                      folder.name
                    ) : (
                      <a onClick={() => onFolderSelect(folder.id)}>{folder.name}</a>
                    ),
                }))
              : [{ title: showAll ? t('全部图标', 'All icons') : t('根目录', 'Root folder') }]),
          ]}
        />
      </div>
      <Flex gap={8} wrap>
        <Radio.Group
          role="radiogroup"
          aria-label={t('导出格式', 'Export format')}
          value={format}
          onChange={(event) => onFormatChange(event.target.value)}
          optionType="button"
          buttonStyle="solid"
          disabled={!!busy}
          options={[
            { value: 'js', label: 'JavaScript' },
            { value: 'ttf', label: 'TrueType Font' },
          ]}
        />
        {onSettings && (
          <Button icon={<SettingOutlined />} onClick={onSettings}>
            {t('设置', 'Settings')}
          </Button>
        )}
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={busy === 'build'}
          disabled={!!busy}
          onClick={() => void perform('build')}
        >
          {t(`生成 iconfont.${format}`, `Build iconfont.${format}`)}
        </Button>
        <Button
          icon={<DownloadOutlined />}
          loading={busy === 'download'}
          disabled={!!busy}
          onClick={() => void perform('download')}
        >
          {t(`下载iconfont.${format}`, 'Download latest')}
        </Button>
        <Button icon={<LinkOutlined />} disabled={!!busy} onClick={() => void perform('copy')}>
          {t('复制 URL', 'Copy URL')}
        </Button>
      </Flex>
    </Flex>
  );
}
