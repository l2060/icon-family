import { useState } from 'react';
import { App, Form, Input, Modal, TreeSelect } from 'antd';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Project, ProjectFolder } from '../../types';
import { descendantIds, folderNodes } from './folderUtils';

export function FolderForm({
  project,
  folder,
  parentId,
  onClose,
  onSaved,
}: {
  project: Project;
  folder?: ProjectFolder;
  parentId?: string;
  onClose: () => void;
  onSaved: (project: Project) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const folders = project.settings.folders || [];
  const excluded = folder ? descendantIds(folders, folder.id) : new Set();
  return (
    <Modal
      open
      centered
      title={folder ? t('编辑目录', 'Edit folder') : t('新建目录', 'New folder')}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={busy}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: folder?.name || '',
          parentId: folder?.parentId ?? parentId ?? 'root',
        }}
        onFinish={async (values) => {
          setBusy(true);
          try {
            const result = await api<{ project: Project }>(
              `/projects/${project.id}/folders${folder ? `/${folder.id}` : ''}`,
              folder ? 'PATCH' : 'POST',
              { name: values.name, parentId: values.parentId === 'root' ? null : values.parentId },
            );
            onSaved(result.project);
            onClose();
          } catch (error) {
            message.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form.Item
          name="name"
          label={t('目录名称', 'Folder name')}
          rules={[{ required: true, whitespace: true, max: 80 }]}
        >
          <Input autoFocus maxLength={80} />
        </Form.Item>
        <Form.Item name="parentId" label={t('上级目录', 'Parent folder')}>
          <TreeSelect
            virtual={false}
            treeDefaultExpandAll
            showSearch
            treeNodeFilterProp="title"
            treeData={[
              {
                value: 'root',
                title: t('项目根目录', 'Project root'),
                children: folderNodes(folders.filter((item) => !excluded.has(item.id))),
              },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
