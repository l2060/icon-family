import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { App, Button, ConfigProvider, theme, Flex, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined, TranslationOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';

type Language = 'zh' | 'en';
type Translate = (zh: string, en: string) => string;
const Preferences = createContext<{
  language: Language;
  dark: boolean;
  setLanguage: (v: Language) => void;
  setDark: (v: boolean) => void;
  t: Translate;
}>(null!);
function saved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(saved('if-language') === 'en' ? 'en' : 'zh');
  const [dark, setDark] = useState(() =>
    saved('if-theme')
      ? saved('if-theme') === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('if-language', language);
      localStorage.setItem('if-theme', dark ? 'dark' : 'light');
    } catch {
      /* Storage may be disabled. */
    }
  }, [language, dark]);
  return (
    <Preferences.Provider
      value={{ language, dark, setLanguage, setDark, t: (zh, en) => (language === 'zh' ? zh : en) }}
    >
      <ConfigProvider
        locale={language === 'zh' ? zhCN : enUS}
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            motionDurationFast: '0.08s',
            motionDurationMid: '0.12s',
            motionDurationSlow: '0.16s',
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </Preferences.Provider>
  );
}
export const usePreferences = () => useContext(Preferences);
export function PreferenceControls() {
  const { language, setLanguage, dark, setDark, t } = usePreferences();
  return (
    <Flex align="center" gap={8} className="preference-controls">
      <Tooltip title={language === 'zh' ? 'Switch to English' : '切换为中文'}>
        <Button
          className="preference-button"
          icon={<TranslationOutlined />}
          aria-label={language === 'zh' ? 'Switch to English' : '切换为中文'}
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
        >
          {language === 'zh' ? '中文' : 'EN'}
        </Button>
      </Tooltip>
      <Tooltip
        title={
          dark
            ? t('切换为亮色主题', 'Switch to light theme')
            : t('切换为暗色主题', 'Switch to dark theme')
        }
      >
        <Button
          className="preference-button"
          icon={dark ? <MoonOutlined /> : <SunOutlined />}
          aria-label={t('暗色主题', 'Dark theme')}
          aria-pressed={dark}
          onClick={() => setDark(!dark)}
        >
          {dark ? t('暗色', 'Dark') : t('亮色', 'Light')}
        </Button>
      </Tooltip>
    </Flex>
  );
}
