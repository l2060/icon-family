import { test, expect } from '@playwright/test';

for (const populated of [false, true]) {
  test(`cart drawer mounts and reopens without ResizeObserver errors (${populated ? 'populated' : 'empty'})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      await route.fulfill({
        json:
          endpoint === '/api/auth/me'
            ? { user: { id: 1, username: 'admin', role: 'admin' } }
            : endpoint === '/api/projects'
              ? { projects: [] }
              : {
                  items: populated
                    ? [
                        {
                          id: 1,
                          remoteId: 'one',
                          name: 'Saved icon',
                          createdAt: '',
                          svg: '<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>',
                        },
                      ]
                    : [],
                },
      });
    });
    await page.goto('/');
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole('button', { name: '购物车' }).click();
      const drawer = page.getByRole('dialog', { name: /购物车/ });
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByText(populated ? 'Saved icon' : '购物车为空，去商店挑选图标吧。', {
          exact: true,
        }),
      ).toBeVisible();
      if (populated) {
        await expect(drawer.locator('.cart-card')).toHaveCount(1);
        await expect(drawer.getByText('one', { exact: true })).toHaveCount(0);
        await drawer.getByRole('button', { name: '选择 Saved icon', exact: true }).click();
        await expect(drawer.getByRole('checkbox', { name: '选择 Saved icon' })).toBeChecked();
      }
      await drawer.getByRole('button', { name: '购物车说明', exact: true }).hover();
      await expect(page.getByRole('tooltip')).toContainText('图标已保存到你的账号');
      await drawer.locator('.ant-drawer-close').click();
      await expect(drawer).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('cart project popup stays inside the viewport and all cards use normal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  const projects = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    name: `Project ${i + 1}`,
    prefix: 'test',
    settings: {},
  }));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === '/api/auth/me'
          ? { user: { id: 1, username: 'admin', role: 'admin' } }
          : path === '/api/projects'
            ? { projects }
            : path.startsWith('/api/projects/')
              ? { project: projects[0], icons: [] }
              : {
                  items: Array.from({ length: 100 }, (_, i) => ({
                    id: i + 1,
                    remoteId: `remote-${i}`,
                    name: `Icon ${i + 1}`,
                    svg: '<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>',
                  })),
                },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '购物车' }).click();
  const drawer = page.getByRole('dialog', { name: /购物车/ });
  await expect(drawer.locator('.cart-card').first()).toBeVisible();
  expect(await drawer.locator('.cart-card').count()).toBe(100);
  await drawer.getByRole('checkbox', { name: '全选', exact: true }).check();
  await expect(drawer.getByText('已选 100 个', { exact: true })).toBeVisible();
  await drawer.getByRole('combobox', { name: '目标项目' }).click();
  const popup = drawer.locator('.ant-select-dropdown');
  await expect(popup).toBeVisible();
  const box = (await popup.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1000);
  await page.getByTitle('Project 2', { exact: true }).last().click();
  await page.keyboard.press('Escape');
  await expect(drawer.getByRole('button', { name: '将 100 个图标添加到 2 个项目' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/cart-matrix.png', fullPage: true });
});
