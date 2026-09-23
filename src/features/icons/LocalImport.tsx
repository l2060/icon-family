import { useState } from 'react';
import { Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { usePreferences } from '../../preferences';
import type { ImportJob } from '../../types';
import { ImportDialog } from './ImportDialog';

export function LocalImport({
  projectId,
  onImported,
}: {
  projectId: number;
  onImported: (job: ImportJob) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={<UploadOutlined />} onClick={() => setOpen(true)}>
        {t('导入', 'Import')}
      </Button>
      {open && (
        <ImportDialog
          projectId={projectId}
          onClose={() => setOpen(false)}
          onImported={onImported}
        />
      )}
    </>
  );
}
