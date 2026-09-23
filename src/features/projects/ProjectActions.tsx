import { useState } from 'react';
import { App, Input, Modal, Typography } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Project } from '../../types';

export function DeleteProject({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={t('删除项目', 'Delete project')}
      onCancel={onClose}
      okButtonProps={{ danger: true, disabled: name !== project.name }}
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          await api(`/projects/${project.id}`, 'DELETE');
          await onDeleted();
          onClose();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Typography.Paragraph>
        {t('输入项目名称确认删除：', 'Enter the project name to confirm deletion: ')}
        <strong>{project.name}</strong>
      </Typography.Paragraph>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t('项目名称', 'Project name')}
      />
    </Modal>
  );
}
