import { test, expect } from '@playwright/test';

test('project workflow, SVG editing, theme and language persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByLabel('项目名称').fill('UI regression');
  await page.getByLabel('项目前缀').fill('test');
  await page.getByRole('button', { name: '确 定' }).click();
  await expect(page.getByRole('heading', { name: 'UI regression' })).toBeVisible();
  const svg = '<svg viewBox="0 0 1024 1024"><path fill="#ff0000" d="M100 100H900V900H100Z"/></svg>';
  await page.getByRole('button', { name: /导\s*入/ }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'square.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) }]);
  await page.getByRole('dialog', { name: '导入图标' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('成功 1，跳过 0，失败 0')).toBeVisible();
  await page.getByText('成功 1，跳过 0，失败 0').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '选择 square', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '编辑' }).click();
  await page.getByLabel('名称', { exact: true }).fill('square edited');
  await page.getByRole('button', { name: /^放\s*大$/ }).click();
  await page.getByRole('button', { name: '保存并关闭' }).click();
  await expect(page.getByRole('button', { name: '选择 square edited', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '选择 square edited', exact: true }).check();
  await page.getByRole('button', { name: '整体调整边距' }).click();
  await page.getByLabel('项目边距', { exact: true }).fill('120');
  await page.getByRole('button', { name: '确 定' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '选择 square edited', exact: true }).check();
  await page.getByRole('button', { name: '整体调整边距' }).click();
  await expect(page.getByLabel('项目边距', { exact: true })).toHaveAttribute('aria-valuenow', '120');
  await page.getByRole('button', { name: /^取\s*消$/ }).click();
  await page.getByRole('button', { name: '生成 iconfont.js' }).click();
  await expect(page.getByText('已生成 iconfont.js', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载/ }).click();
  expect((await download).suggestedFilename()).toBe('iconfont.js');
  const themeButton = page.getByRole('button', { name: '暗色主题' });
  if ((await themeButton.getAttribute('aria-pressed')) !== 'true') await themeButton.click();
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.screenshot({ path: 'test-results/workspace-dark-en.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('store scroll, cart persistence and multi-project checkout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByLabel('项目名称').fill('Remote regression');
  await page.getByLabel('项目前缀').fill('remote');
  await page.getByRole('button', { name: '确 定' }).click();
  await expect(page.getByRole('heading', { name: 'Remote regression' })).toBeVisible();
  await page.route('**/api/iconfont/search', async (route) => {
    const { page: index } = route.request().postDataJSON();
    await route.fulfill({
      json: {
        items: Array.from({ length: 54 }, (_, i) => ({
          remoteId: `${index}-${i}`,
          name: `remote-${index}-${i}`,
          svg: '<svg style="width:1em;height:1em" viewBox="0 0 1024 1024"><path d="M0 0H1024V1024H0Z"/></svg>',
        })),
        total: 108,
      },
    });
  });
  await page.getByRole('button', { name: '图标商店' }).click();
  await page.getByPlaceholder('搜索 iconfont 图标').fill('test');
  await page.getByRole('button', { name: /^搜\s*索$/ }).click();
  await expect(page.getByText('remote-1-0', { exact: true })).toBeVisible();
  const svg = page.locator('.remote-grid svg').first();
  expect(await svg.getAttribute('style')).toBeNull();
  expect((await svg.boundingBox())?.width).toBe(46);
  const filter = page.locator('.remote-filters');
  const pagination = page.locator('.ant-drawer-footer');
  const topBefore = await filter.boundingBox();
  const bottomBefore = await pagination.boundingBox();
  await page.locator('.remote-results').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await page.locator('.remote-results').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await filter.boundingBox()).toEqual(topBefore);
  expect(await pagination.boundingBox()).toEqual(bottomBefore);
  await page.locator('.ant-pagination-item-2').click();
  await expect(page.getByText('remote-2-0', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.remote-results').evaluate((el) => el.scrollTop)).toBe(0);
  await page.locator('.store-card').first().getByRole('button', { name: '加入购物车' }).click();
  await expect(
    page.locator('.store-card').first().getByRole('button', { name: '已在购物车' }),
  ).toBeDisabled();
  await expect(page.getByText('单色', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /添加选中/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/iconfont-drawer.png', fullPage: true });
  const firstProjects = await (await page.request.get('/api/projects')).json();
  const firstProject = firstProjects.projects.find(
    (p: { name: string }) => p.name === 'Remote regression',
  );
  const secondProject = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Second destination', prefix: 'second' },
      })
    ).json()
  ).project;
  await page.reload();
  await page.getByRole('button', { name: '购物车', exact: false }).click();
  await expect(page.getByText('remote-2-0', { exact: true })).toBeVisible();
  const drawer = page.getByRole('dialog', { name: /购物车/ });
  await drawer.getByRole('checkbox').last().check();
  await drawer.getByRole('combobox', { name: '目标项目' }).click();
  await page.getByTitle('Second destination', { exact: true }).last().click();
  await page.keyboard.press('Escape');
  await drawer.getByRole('button', { name: '将 1 个图标添加到 2 个项目' }).click();
  await expect(drawer.getByText('已完成 1 个图标，保留 0 个待重试图标')).toBeVisible();
  await expect(drawer.getByText('购物车为空，去商店挑选图标吧。')).toBeVisible();
  for (const id of [firstProject.id, secondProject.id]) {
    const payload = await (await page.request.get(`/api/projects/${id}`)).json();
    expect(
      payload.icons.some((icon: { source_remote_id: string }) => icon.source_remote_id === '2-0'),
    ).toBe(true);
  }
  expect((await (await page.request.get('/api/cart')).json()).items).toEqual([]);
  await page.screenshot({ path: 'test-results/cart-drawer.png', fullPage: true });
  expect(errors).toEqual([]);
});
