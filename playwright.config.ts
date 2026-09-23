import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3109',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'node --use-system-ca scripts/test-server.mjs',
    url: 'http://127.0.0.1:3109/api/health',
    reuseExistingServer: false,
  },
});
