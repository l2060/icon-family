import { useState } from 'react';
import { App, Form, Modal, Select, TreeSelect } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Icon, Project } from '../../types';
import { folderNodes } from '../folders/folderUtils';

export function CopyIconDialog({
  project,
  projects,
  icon,
  folderId,
  onClose,
  onCopied,
}: {
  project: Project;
  projects: Project[];
  icon: Icon;
  folderId?: string;
  onClose: () => void;
  onCopied: () => Promise<void>;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [target, setTarget] = useState(project.id);
  const [folder, setFolder] = useState(folderId || 'root');
  const [busy, setBusy] = useState(false);
  const destination = projects.find((item) => item.id === target);
  return (
    <Modal
      open
      centered
      title={t('拷贝到…', 'Copy to…')}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          await api(`/projects/${project.id}/icons/${icon.id}/clone`, 'POST', {
            targetProjectId: target,
            folderId: folder === 'root' ? null : folder,
            name: `${icon.name} ${t('副本', 'copy')}`,
          });
          await onCopied();
          onClose();
          message.success(t('图标已拷贝', 'Icon copied'));
        } catch (error) {
          message.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form layout="vertical">
        <Form.Item label={t('目标项目', 'Destination project')}>
          <Select
            aria-label={t('目标项目', 'Destination project')}
            showSearch
            optionFilterProp="label"
            value={target}
            onChange={(id) => {
              setTarget(id);
              setFolder('root');
            }}
            options={projects.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Form.Item>
        <Form.Item label={t('目标目录', 'Destination folder')}>
          <TreeSelect
            aria-label={t('目标目录', 'Destination folder')}
            virtual={false}
            showSearch
            treeNodeFilterProp="title"
            treeDefaultExpandAll
            value={folder}
            onChange={setFolder}
            treeData={[
              {
                value: 'root',
                title: t('项目根目录', 'Project root'),
                children: folderNodes(destination?.settings.folders || []),
              },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
