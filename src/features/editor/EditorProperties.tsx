import { Form, Input, Select } from 'antd';
import { usePreferences } from '../../preferences';
import type { EditState } from './transforms';

export function EditorProperties({
  state,
  change,
}: {
  state: EditState;
  change: (patch: Partial<EditState>) => void;
}) {
  const { t } = usePreferences();
  return (
    <>
      <Form layout="inline" className="editor-properties">
        <Form.Item label={t('名称', 'Name')} htmlFor="editor-name">
          <Input
            id="editor-name"
            value={state.name}
            onChange={(event) => change({ name: event.target.value })}
          />
        </Form.Item>
        <Form.Item label={t('代码', 'Code')} htmlFor="editor-slug">
          <Input
            id="editor-slug"
            value={state.slug}
            onChange={(event) => change({ slug: event.target.value })}
          />
        </Form.Item>
        <Form.Item label="Unicode" htmlFor="editor-unicode">
          <Input
            id="editor-unicode"
            value={state.codepoint}
            placeholder="U+E900"
            title={t('同一项目内唯一，例如 U+E900', 'Unique within this project, e.g. U+E900')}
            onChange={(event) => change({ codepoint: event.target.value })}
          />
        </Form.Item>
        <Form.Item label={t('颜色模式', 'Color mode')} htmlFor="editor-color">
          <Select
            id="editor-color"
            value={state.colorMode}
            onChange={(colorMode) => change({ colorMode })}
            options={[
              { value: 'preserve', label: t('保留原色', 'Original colors') },
              { value: 'currentColor', label: 'currentColor' },
            ]}
          />
        </Form.Item>
      </Form>
    </>
  );
}
