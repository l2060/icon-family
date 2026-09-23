import { useState } from 'react';
import { App, Modal, TreeSelect, Typography } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Project } from '../../types';
import { folderNodes } from './folderUtils';
export interface MoveResult {
  iconIds: number[];
  folderId: string | null;
}
export function MoveIconsDialog({
  project,
  ids,
  onClose,
  onMoved,
}: {
  project: Project;
  ids: number[];
  onClose: () => void;
  onMoved: (result: MoveResult) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [target, setTarget] = useState('root');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      centered
      title={t('移动图标', 'Move icons')}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          const result = await api<MoveResult>(`/projects/${project.id}/icons/move`, 'POST', {
            iconIds: ids,
            folderId: target === 'root' ? null : target,
          });
          onMoved(result);
          onClose();
        } catch (error) {
          message.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Typography.Paragraph>
        {t(`将选中的 ${ids.length} 个图标移动到：`, `Move ${ids.length} selected icons to:`)}
      </Typography.Paragraph>
      <TreeSelect
        aria-label={t('目标目录', 'Destination folder')}
        style={{ width: '100%' }}
        virtual={false}
        treeDefaultExpandAll
        showSearch
        treeNodeFilterProp="title"
        value={target}
        onChange={setTarget}
        treeData={[
          {
            value: 'root',
            title: t('项目根目录', 'Project root'),
            children: folderNodes(project.settings.folders || []),
          },
        ]}
      />
    </Modal>
  );
}
