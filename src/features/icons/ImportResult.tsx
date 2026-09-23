import { Alert, Modal, Typography } from 'antd';
import { usePreferences } from '../../preferences';
import type { ImportJob } from '../../types';

export function ImportResult({ job, onClose }: { job: ImportJob; onClose: () => void }) {
  const { t } = usePreferences();
  return (
    <Modal
      open
      title={t('导入结果', 'Import results')}
      footer={null}
      onCancel={onClose}
      modalRender={(node) => <div onClick={onClose}>{node}</div>}
    >
      <Alert
        showIcon
        type={job.failed ? 'warning' : 'success'}
        title={t(
          `成功 ${job.succeeded}，跳过 ${job.skipped}，失败 ${job.failed}`,
          `Imported ${job.succeeded}, skipped ${job.skipped}, failed ${job.failed}`,
        )}
      />
      <Typography.Paragraph type="secondary" className="login-hint">
        {t('点击任意位置关闭', 'Click anywhere to close')}
      </Typography.Paragraph>
    </Modal>
  );
}
