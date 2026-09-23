import { CheckCircleOutlined, AppstoreOutlined } from '@ant-design/icons';
import { Flex, Typography } from 'antd';
import { usePreferences } from '../../preferences';

export function LoginBrand() {
  const { t } = usePreferences();
  return (
    <Flex vertical justify="space-between" className="login-brand-panel">
      <div>
        <Flex align="center" gap={12} className="login-brand-eyebrow">
          <AppstoreOutlined className="login-brand-mark" />
          <span>{t('团队图标工作区', 'YOUR TEAM ICON WORKSPACE')}</span>
        </Flex>
        <Typography.Title className="login-brand-title">IconFamily</Typography.Title>
        <Typography.Paragraph className="login-brand-subtitle">
          {t('图标有规范，协作有章法', 'Consistent icons. Connected teams.')}
        </Typography.Paragraph>
        <Typography.Paragraph className="login-brand-description">
          {t(
            '本地部署的团队图标库，管理与协作一步到位。',
            'Self-hosted icon libraries for your team.',
          )}
        </Typography.Paragraph>
        <Flex vertical gap={22}>
          {[
            [
              t('本地部署，规范管理', 'Host and organize'),
              t(
                '数据自主掌控，项目规范统一。',
                'Own your data. Standardize your icons.',
              ),
            ],
            [
              t('多人协作，资源汇集', 'Import and collaborate'),
              t(
                '按项目授权，导入 SVG、JS、ZIP。',
                'Share projects. Import SVG, JS and ZIP.',
              ),
            ],
            [
              t('在线编辑，更新即用', 'Edit and update'),
              t(
                '在线编辑图标，下载最新 JS。',
                'Edit icons online. Download updated JS.',
              ),
            ],
          ].map(([title, description]) => (
            <Flex gap={10} align="start" key={title}>
              <CheckCircleOutlined className="login-feature-check" />
              <div>
                <Typography.Text className="login-feature-title">{title}</Typography.Text>
                <Typography.Paragraph className="login-feature-description">
                  {description}
                </Typography.Paragraph>
              </div>
            </Flex>
          ))}
        </Flex>
      </div>
      <Flex justify="space-between" className="login-brand-footer">
        <span>{t('团队共建 · 持续更新', 'Build together. Stay current.')}</span>
        <span>IconFamily</span>
      </Flex>
    </Flex>
  );
}
