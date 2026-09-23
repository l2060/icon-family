import { test, expect } from '@playwright/test';

test('688 icons remain responsive when opening dialogs', async ({ page }) => {
  const project = {
    id: 1,
    name: '688 icons',
    prefix: 'perf',
    description: '',
    settings: { margin: 100 },
    icon_count: 688,
  };
  const icons = Array.from({ length: 688 }, (_, i) => ({
    id: i + 1,
    name: `icon-${i}`,
    slug: `icon-${i}`,
    revision: 0,
    color_mode: 'preserve',
    codepoint: null,
    created_at: '2026-09-23T00:00:00.000Z',
    svg: `<svg viewBox="0 0 1024 1024">${Array.from({ length: 12 }, (_, n) => `<circle cx="${100 + n * 65}" cy="${100 + (i % 700)}" r="40" fill="currentColor"/>`).join('')}</svg>`,
  }));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === '/api/auth/me'
          ? { user: { id: 1, username: 'admin', role: 'admin' } }
          : path === '/api/projects'
            ? { projects: [project] }
            : path === '/api/cart'
              ? { items: [] }
              : { project, icons },
    });
  });
  const start = Date.now();
  await page.goto('/');
  await expect(page.locator('.icon-grid .icon-card').first()).toBeVisible();
  const loaded = Date.now() - start;
  await page
    .locator('.icon-grid .icon-card')
    .first()
    .getByRole('button', { name: '复制代码', exact: true })
    .click();
  await expect(page.getByText('已复制代码：perf-icon-0', { exact: true })).toBeVisible();
  await expect(page.locator('.icon-grid .icon-card')).toHaveCount(688);
  const complete = Date.now() - start;
  const count = await page.locator('.icon-grid .icon-card').count();
  expect(count).toBe(688);
  await page.evaluate(() => performance.mark('dialog-start'));
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialogMs = await page.evaluate(
    () => performance.now() - performance.getEntriesByName('dialog-start')[0].startTime,
  );
  console.log(
    JSON.stringify({
      icons: 688,
      mountedCards: count,
      firstVisibleMs: loaded,
      allCardsMountedMs: complete,
      dialogMs: Math.round(dialogMs),
    }),
  );
  await page.getByRole('button', { name: /^取\s*消$/ }).click();
  const holder = page.locator('.icon-scroll');
  await holder.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(page.getByRole('button', { name: '选择 icon-687', exact: true })).toBeVisible();
  await page.getByPlaceholder('搜索项目内图标').fill('icon-500');
  await expect(page.getByRole('button', { name: '选择 icon-500', exact: true })).toBeVisible();
  await expect(page.locator('.icon-grid .icon-card')).toHaveCount(1);
});
