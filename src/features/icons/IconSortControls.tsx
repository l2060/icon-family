import { Flex, Radio, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { usePreferences } from '../../preferences';
import { useUserPreferences } from '../../userPreferences';

export function IconSortControls() {
  const { t } = usePreferences();
  const { iconSort, setIconSort } = useUserPreferences();
  return (
    <Flex gap={8} align="center" className="icon-sort-controls">
      <Radio.Group
        aria-label={t('排序依据', 'Sort by')}
        value={iconSort.field}
        buttonStyle="solid"
        onChange={(event) => setIconSort({ ...iconSort, field: event.target.value })}
      >
        <Radio.Button value="name" aria-label={t('按名称排序', 'Sort by name')}>
          <SortAscendingOutlined /> {t('名称', 'Name')}
        </Radio.Button>
        <Radio.Button value="created_at" aria-label={t('按创建时间排序', 'Sort by creation time')}>
          <ClockCircleOutlined /> {t('创建时间', 'Created')}
        </Radio.Button>
      </Radio.Group>
      <Radio.Group
        aria-label={t('排序方向', 'Sort direction')}
        value={iconSort.direction}
        buttonStyle="solid"
        onChange={(event) => setIconSort({ ...iconSort, direction: event.target.value })}
      >
        <Tooltip title={t('升序', 'Ascending')}>
          <Radio.Button value="asc" aria-label={t('升序', 'Ascending')}>
            <ArrowUpOutlined />
          </Radio.Button>
        </Tooltip>
        <Tooltip title={t('降序', 'Descending')}>
          <Radio.Button value="desc" aria-label={t('降序', 'Descending')}>
            <ArrowDownOutlined />
          </Radio.Button>
        </Tooltip>
      </Radio.Group>
    </Flex>
  );
}
