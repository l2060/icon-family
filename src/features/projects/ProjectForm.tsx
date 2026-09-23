import { useEffect, useState } from 'react';
import {
  App,
  Checkbox,
  ColorPicker,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Tabs,
} from 'antd';
import { projectColor } from './ProjectTheme';
import { api } from '../../api';
import { usePreferences } from '../../preferences';
import type { Project, User } from '../../types';
import { ProjectCollaborators } from './ProjectCollaborators';

interface Values {
  themeColor: string;
  jsFilename: string;
  collaboratorIds: number[];
  everyoneCanEdit: boolean;
  name: string;
  prefix: string;
  margin: number;
}

export function ProjectForm({
  project,
  admin = false,
  creatorId,
  onClose,
  onSaved,
}: {
  project?: Project;
  admin?: boolean;
  creatorId?: number;
  onClose: () => void;
  onSaved: (id: number) => Promise<void>;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const everyoneCanEdit = Form.useWatch('everyoneCanEdit', form);
  const filename = Form.useWatch('jsFilename', form) || 'iconfont';
  const downloadName = /\.js$/i.test(filename) ? filename : `${filename}.js`;
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('settings');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    if (admin) {
      setLoadingUsers(true);
      void api<{ users: User[] }>('/users')
        .then((result) => setUsers(result.users.filter((user) => user.status === 'active')))
        .catch((error) => message.error(error.message))
        .finally(() => setLoadingUsers(false));
    }
  }, [admin, project, message]);
  return (
    <Modal
      open
      width={640}
      centered
      className="project-settings-dialog"
      styles={{ body: { height: 460 } }}
      title={project ? t('项目设置', 'Project settings') : t('新建项目', 'New project')}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      maskClosable={!busy}
    >
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        onFinishFailed={() => setTab('settings')}
        initialValues={{
          themeColor: project ? projectColor(project) : '#1677ff',
          name: project?.name,
          prefix: project?.prefix,
          jsFilename: project?.settings.jsFilename || '',
          collaboratorIds: project?.settings.collaboratorIds || [],
          everyoneCanEdit: project?.settings.everyoneCanEdit === true,
          margin: project?.settings.margin ?? 100,
        }}
        onFinish={async (values) => {
          setBusy(true);
          try {
            const result = await api<{ project: Project }>(
              project ? `/projects/${project.id}` : '/projects',
              project ? 'PATCH' : 'POST',
              project
                ? {
                    name: values.name,
                    prefix: values.prefix,
                    settings: {
                      ...project.settings,
                      jsFilename: values.jsFilename || '',
                      ...(admin
                        ? {
                            collaboratorIds: values.collaboratorIds,
                            everyoneCanEdit: values.everyoneCanEdit,
                          }
                        : {}),
                      margin: values.margin,
                      themeColor: values.themeColor,
                    },
                  }
                : values,
            );
            await onSaved(result.project.id);
            onClose();
            message.success(t('项目已保存', 'Project saved'));
          } catch (error) {
            message.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'settings',
              label: t('项目设置', 'Project settings'),
              forceRender: true,
              children: (
                <>
                  <div className="project-fields project-fields-readable">
                    <Form.Item
                      name="name"
                      label={t('项目名称', 'Project name')}
                      extra={t('显示在项目列表中', 'Shown in the project list')}
                      rules={[{ required: true, whitespace: true }]}
                    >
                      <Input autoFocus />
                    </Form.Item>
                    <Form.Item
                      name="prefix"
                      label={t('项目前缀', 'Project prefix')}
                      extra={t('图标代码前缀，如 app-home', 'Icon code prefix, e.g. app-home')}
                      rules={[{ required: true, whitespace: true }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="jsFilename"
                      label={t('JS 文件名', 'JS filename')}
                      className="project-filename-field"
                      extra={t(
                        `下载文件：${downloadName}（自动补 .js）`,
                        `Download: ${downloadName} (.js added automatically)`,
                      )}
                      tooltip={t(
                        '原样用于下载，不添加前缀；留空使用 iconfont.js。',
                        'Used as entered, without a prefix. Defaults to iconfont.js.',
                      )}
                      rules={[
                        {
                          pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}(?:\.js)?$/,
                          message: t(
                            '使用字母、数字、点、横线或下划线',
                            'Use letters, numbers, dots, hyphens or underscores',
                          ),
                        },
                      ]}
                    >
                      <Input placeholder="iconfont" style={{ maxWidth: 280 }} />
                    </Form.Item>
                  <Form.Item
                    name="themeColor"
                    label={t('项目主题色', 'Project color')}
                    getValueFromEvent={(color) => color.toHexString()}
                  >
                    <ColorPicker disabledAlpha showText />
                  </Form.Item>
                  </div>
                  <Divider titlePlacement="start">{t('图标默认值', 'Icon defaults')}</Divider>
                  <Flex gap={20} wrap>
                    <Form.Item
                      name="margin"
                      label={t('默认边距', 'Default margin')}
                      extra={t(
                        '新导入图标四周留白，0–512；不会改变已有图标。',
                        'Padding for new imports, 0–512. Existing icons stay unchanged.',
                      )}
                      tooltip={t(
                        '用于以后导入的图标，范围 0–512。',
                        'Applied to future imports. Range: 0–512.',
                      )}
                      rules={[{ required: true, type: 'number', min: 0, max: 512 }]}
                    >
                      <InputNumber
                        min={0}
                        max={512}
                        step={0.1}
                        precision={1}
                        style={{ width: 108 }}
                      />
                    </Form.Item>
                  </Flex>
                </>
              ),
            },
            ...(admin
              ? [
                  {
                    key: 'collaboration',
                    label: t('协作权限', 'Collaboration'),
                    forceRender: true,
                    children: (
                      <div className="project-collaboration-pane">
                        <Form.Item
                          name="everyoneCanEdit"
                          valuePropName="checked"
                          extra={t(
                            '作为访问策略生效，包含以后新增的用户，不会勾选或改变指定协作者。',
                            'Applies to current and future users without changing individual collaborator selections.',
                          )}
                        >
                          <Checkbox>{t('所有人可修改', 'Everyone can edit')}</Checkbox>
                        </Form.Item>
                        <Form.Item
                          name="collaboratorIds"
                          className="project-member-field"
                          label={t('项目协作者', 'Project collaborators')}
                          tooltip={t(
                            '协作者可查看、导入和编辑图标；仅管理员可分配权限。',
                            'Collaborators can view, import and edit icons. Only admins can grant access.',
                          )}
                        >
                          <ProjectCollaborators
                            everyoneCanEdit={everyoneCanEdit}
                            users={users}
                            ownerId={project?.owner_id ?? creatorId}
                            disabled={busy || loadingUsers}
                            loading={loadingUsers}
                          />
                        </Form.Item>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Form>
    </Modal>
  );
}
