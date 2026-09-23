import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Flex, Modal, Typography } from 'antd';
import { RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { cleanSvg } from '../../components/SvgPreview';
import { usePreferences } from '../../preferences';
import type { Icon } from '../../types';
import { EditorCanvas } from './EditorCanvas';
import { EditorInspector } from './EditorInspector';
import {
  editableSelector,
  elementPaint,
  identity,
  transformedSvg,
  type EditState,
} from './transforms';
import {
  centeringDelta,
  elementMatrix,
  matrixText,
  transformElement,
  type TransformAction,
} from './elementTransforms';
import { EditorProperties } from './EditorProperties';
import { EditorAppearance, type LayerAction } from './EditorAppearance';

export function SvgEditor({
  icon,
  projectId,
  onClose,
  onSaved,
}: {
  icon: Icon;
  projectId: number;
  onClose: () => void;
  onSaved: (icon: Icon) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const source = useMemo(() => cleanSvg(icon.svg), [icon.svg]);
  const [state, setState] = useState<EditState>({
    ...identity,
    elementTransforms: {},
    elementColors: {},
    elementOrders: {},
    name: icon.name,
    slug: icon.slug,
    codepoint: String(icon.codepoint ?? ''),
    colorMode: icon.color_mode || 'preserve',
  });
  const history = useRef<EditState[]>([]);
  const canvas = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string>();
  const elements = useMemo(() => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return [...doc.querySelectorAll(editableSelector)].map((element, index) => ({
      value: String(index),
      label: `${element.tagName} ${element.id ? `#${element.id}` : index + 1}`,
    }));
  }, [source]);
  const future = useRef<EditState[]>([]);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [dirty, setDirty] = useState(false);
  const change = (patch: Partial<EditState>) => {
    history.current = [...history.current.slice(-79), state];
    future.current = [];
    setState({ ...state, ...patch });
    setDirty(true);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (previous) {
      future.current.push(state);
      setState(previous);
      setDirty(true);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      history.current.push(state);
      setState(next);
      setDirty(true);
    }
  };
  const svg = transformedSvg(source, state);
  const preview = transformedSvg(source, state, true);
  const selectedNode = new DOMParser()
    .parseFromString(preview, 'image/svg+xml')
    .querySelector(`[data-editor-node="${selected}"]`);
  const siblings = selectedNode?.parentElement
    ? [...selectedNode.parentElement.children].filter((node) =>
        node.hasAttribute('data-editor-node'),
      )
    : [];
  const position = siblings.indexOf(selectedNode!);
  function layer(action: LayerAction) {
    if (!selectedNode || selected === undefined) return;
    const order = siblings.map((node) => node.getAttribute('data-editor-node')!);
    order.splice(position, 1);
    const next =
      action === 'front'
        ? order.length
        : action === 'back'
          ? 0
          : position + (action === 'up' ? 1 : -1);
    order.splice(Math.max(0, Math.min(order.length, next)), 0, selected);
    const parent = selectedNode.parentElement?.getAttribute('data-editor-node') ?? 'root';
    change({ elementOrders: { ...state.elementOrders, [parent]: order } });
  }
  function color(attribute: 'fill' | 'stroke' | 'opacity', value: string) {
    if (selected === undefined) return;
    change({
      colorMode: attribute === 'opacity' ? state.colorMode : 'preserve',
      elementColors: {
        ...state.elementColors,
        [selected]: { ...state.elementColors[selected], [attribute]: value },
      },
    });
  }
  function center(axis: 'horizontal' | 'vertical') {
    const root = canvas.current?.querySelector<SVGSVGElement>('.svg-preview > svg');
    const element =
      selected === undefined
        ? (root?.firstElementChild as SVGGraphicsElement | undefined)
        : root?.querySelector<SVGGraphicsElement>(`[data-editor-node="${selected}"]`);
    if (!root || !element) return;
    try {
      const delta = centeringDelta(element, root, axis);
      if (selected === undefined) change({ tx: state.tx + delta.x, ty: state.ty + delta.y });
      else
        changeElement(
          selected,
          matrixText(new DOMMatrix().translate(delta.x, delta.y).multiply(elementMatrix(element))),
        );
    } catch {
      message.error(t('此元素无法居中', 'This element cannot be centered'));
    }
  }
  const changeElement = (key: string, transform: string) =>
    change({ elementTransforms: { ...state.elementTransforms, [key]: transform } });
  function operate(action: TransformAction, amount: number) {
    if (selected !== undefined) {
      const element = canvas.current?.querySelector<SVGGraphicsElement>(
        `[data-editor-node="${selected}"]`,
      );
      if (element) {
        try {
          changeElement(selected, transformElement(element, action, amount));
        } catch {
          message.error(t('此元素无法变换', 'This element cannot be transformed'));
        }
      }
    } else if (action === 'scale')
      change({ scale: Math.min(8, Math.max(0.01, state.scale * amount)) });
    else if (action === 'flipX' || action === 'flipY') change({ [action]: -state[action] });
    else change({ [action]: state[action] + amount });
  }
  async function save() {
    if (saving.current) return;
    if (!state.name.trim() || !state.slug.trim()) {
      message.error(t('名称和 Slug 不能为空', 'Name and slug are required'));
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const result = await api<{ icon: Icon }>(`/projects/${projectId}/icons/${icon.id}`, 'PATCH', {
        name: state.name.trim(),
        slug: state.slug,
        codepoint: state.codepoint,
        colorMode: state.colorMode,
        svg,
        baseRevision: icon.revision,
      });
      onSaved(result.icon);
      onClose();
      message.success(t('图标已保存', 'Icon saved'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      const typing =
        e.target instanceof HTMLElement && e.target.closest('input,textarea,[contenteditable]');
      if (!typing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (!typing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <Modal
      open
      width={1080}
      title={icon.name}
      onCancel={onClose}
      footer={
        <Flex justify="space-between" align="center" className="editor-footer">
          <Typography.Text type="secondary">
            {dirty ? t('有未保存修改', 'Unsaved changes') : t('已保存', 'Saved')}
          </Typography.Text>
          <Flex gap={8}>
            <Button onClick={onClose}>{t('关闭', 'Close')}</Button>
            <Button type="primary" loading={busy} onClick={() => void save()}>
              {t('保存并关闭', 'Save and close')}
            </Button>
          </Flex>
        </Flex>
      }
      className="svg-editor"
      centered
    >
      <Flex align="center" gap={8} className="editor-header">
        <Typography.Text type="secondary" style={{ marginRight: 'auto' }}>
          {selected === undefined
            ? t('编辑整个图标', 'Editing whole icon')
            : t('编辑选中元素', 'Editing selection')}
        </Typography.Text>
        <Button
          icon={<UndoOutlined />}
          aria-label={t('撤销', 'Undo')}
          disabled={!history.current.length}
          onClick={undo}
        />
        <Button
          icon={<RedoOutlined />}
          aria-label={t('重做', 'Redo')}
          disabled={!future.current.length}
          onClick={redo}
        />
        <Button onClick={() => change({ ...identity, elementTransforms: {} })}>
          {t('重置本次变换', 'Reset transforms')}
        </Button>
      </Flex>
      <Flex className="editor-layout">
        <EditorCanvas
          svg={preview}
          selected={selected}
          onSelect={setSelected}
          canvasRef={canvas}
          onElementChange={changeElement}
        />
        <EditorInspector
          selected={selected}
          onSelect={setSelected}
          elements={elements}
          operate={operate}
          center={center}
        >
          <EditorAppearance
            opacity={Number(selectedNode?.getAttribute('opacity') ?? 1)}
            onOpacity={(value) => color('opacity', String(value))}
            disabled={selected === undefined}
            fill={elementPaint(selectedNode, 'fill')}
            stroke={elementPaint(selectedNode, 'stroke')}
            canRaise={position >= 0 && position < siblings.length - 1}
            canLower={position > 0}
            onLayer={layer}
            onColor={color}
          />
        </EditorInspector>
      </Flex>
      <EditorProperties state={state} change={change} />
      <Typography.Text type="secondary" className="editor-status">
        {t(
          '左键选择/移动元素 · 右键或空格拖动画布 · 滚轮缩放 · Ctrl/Cmd+Z 撤销 · Shift 加大步长',
          'Left-drag: move element · Right/Space-drag: pan · Wheel: zoom · Ctrl/Cmd+Z: undo · Shift: larger steps',
        )}
      </Typography.Text>
    </Modal>
  );
}
