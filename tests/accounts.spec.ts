import { test, expect } from '@playwright/test';

test('member password change and administrator reset with permissions', async ({
  page,
  playwright,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const member = (
    await (
      await page.request.post('/api/users', {
        data: { username: 'password-member', password: 'original-password' },
      })
    ).json()
  ).user;
  const client = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3109' });
  await client.post('/api/auth/login', {
    data: { username: member.username, password: 'original-password' },
  });
  expect((await client.get('/api/users')).status()).toBe(403);
  expect(
    (await client.post('/api/users/1/password', { data: { password: 'forbidden' } })).status(),
  ).toBe(403);
  expect(
    (
      await client.post('/api/auth/password', {
        data: { currentPassword: 'wrong', password: 'new-password' },
      })
    ).status(),
  ).toBe(400);
  await page.goto('/');
  await page.locator('.sidebar-footer button').filter({ hasText: 'admin' }).click();
  const accountHeight = await page.locator('.account-dialog .ant-modal-body').evaluate((element) => element.clientHeight);
  await page.getByRole('tab', { name: '用户管理' }).click();
  expect(await page.locator('.account-dialog .ant-modal-body').evaluate((element) => element.clientHeight)).toBe(accountHeight);
  await expect(page.locator('.user-management-table .ant-table-body')).toBeVisible();
  expect(await page.locator('.user-management-table .ant-table-body').evaluate((element) => element.clientHeight)).toBe(360);
  await page.getByPlaceholder('搜索用户名').fill('no-matching-user');
  await expect(page.locator('.user-management-table .ant-table-row')).toHaveCount(0);
  expect(await page.locator('.user-management-table .ant-table-body').evaluate((element) => element.clientHeight)).toBe(360);
  await page.getByPlaceholder('搜索用户名').fill(member.username);
  await page.getByRole('button', { name: '重置密码', exact: true }).click();
  const reset = page.getByRole('dialog', { name: `重置密码：${member.username}` });
  await reset.getByLabel('新密码', { exact: true }).fill('reset-password');
  await reset.getByLabel('确认新密码').fill('reset-password');
  await reset.getByRole('button', { name: '重置密码', exact: true }).click();
  await expect(reset).toHaveCount(0);
  expect((await client.get('/api/auth/me')).status()).toBe(401);
  expect(
    (
      await client.post('/api/auth/login', {
        data: { username: member.username, password: 'original-password' },
      })
    ).status(),
  ).toBe(401);
  await page.request.post('/api/auth/login', {
    data: { username: member.username, password: 'reset-password' },
  });
  await page.reload();
  await page.locator('.sidebar-footer button').filter({ hasText: member.username }).click();
  await expect(page.getByRole('tab', { name: '用户管理' })).toHaveCount(0);
  await page.getByLabel('当前密码').fill('reset-password');
  await page.getByLabel('新密码', { exact: true }).fill('final-password');
  await page.getByLabel('确认新密码').fill('final-password');
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect(page.getByText('密码已修改', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect(
    (
      await client.post('/api/auth/login', {
        data: { username: member.username, password: 'final-password' },
      })
    ).status(),
  ).toBe(200);
  await client.dispose();
});
