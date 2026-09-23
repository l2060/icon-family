import { test, expect } from '@playwright/test';

test('login route preserves protected destination, handles logout and session expiry', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Login destination', prefix: 'login' },
      })
    ).json()
  ).project;
  await page.request.post('/api/auth/logout');
  await page.goto(`/#/projects/${project.id}`);
  await expect(page).toHaveURL(new RegExp(`#/login\\?redirect=%2Fprojects%2F${project.id}$`));
  await page.reload();
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/projects/${project.id}$`));
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.locator('.sidebar-footer button').filter({ hasText: 'admin' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByLabel('用户名')).toBeVisible();
  await page.goto('/#/login?redirect=https%3A%2F%2Fevil.example');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3109\/#\/projects(?:\/\d+)?$/);
  await page.goto(`/#/login?redirect=${encodeURIComponent(`/projects/${project.id}`)}`);
  await expect(page).toHaveURL(new RegExp(`#/projects/${project.id}$`));
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.request.post('/api/auth/logout');
  await page.getByRole('button', { name: /设\s*置/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/login\\?redirect=%2Fprojects%2F${project.id}$`));
  await expect(page.getByLabel('用户名')).toBeVisible();
});

test('hash route restores projects and supports navigation and invalid links', async ({ page }) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const create = async (name: string) =>
    (
      await (
        await page.request.post('/api/projects', {
          data: { name, prefix: name },
        })
      ).json()
    ).project;
  const first = await create('RouteOne');
  const second = await create('RouteTwo');
  await page.goto(`/#/projects/${first.id}`);
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
  await page.locator('.project-name').filter({ hasText: second.name }).click();
  await expect(page).toHaveURL(new RegExp(`#\/projects\/${second.id}$`));
  await expect(page.getByRole('heading', { name: second.name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: second.name, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: second.name, exact: true })).toBeVisible();
  await page.request.delete(`/api/projects/${second.id}`);
  await page.reload();
  await expect(page).not.toHaveURL(new RegExp(`#\/projects\/${second.id}$`));
  await expect(page.locator('.workspace h3')).toBeVisible();
  await page.goto('/#/projects/999999999');
  await expect(page).not.toHaveURL(/999999999/);
  await expect(page.locator('.workspace h3')).toBeVisible();
});
