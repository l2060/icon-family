import { test, expect } from '@playwright/test';

test('new projects save collaboration choices and enforce grant permissions', async ({ page, playwright }) => {
  await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'test-password' } });
  const member = (await (await page.request.post('/api/users', { data: { username: 'create-guest', password: 'password' } })).json()).user;
  await page.goto('/#/projects');
  await page.getByRole('button', { name: /新建项目/ }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('Shared from creation');
  await page.getByLabel('项目前缀', { exact: true }).fill('created');
  await page.getByRole('tab', { name: '协作权限' }).click();
  const rows = page.locator('.project-member-table .ant-table-row');
  await expect(rows.first()).toContainText('创建者');
  await rows.filter({ hasText: member.username }).getByRole('checkbox').check();
  const created = page.waitForResponse(response => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  const project = (await (await created).json()).project;
  expect(project.settings.collaboratorIds).toContain(member.id);
  const client = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3109' });
  try {
    await client.post('/api/auth/login', { data: { username: member.username, password: 'password' } });
    expect((await client.get(`/api/projects/${project.id}`)).status()).toBe(200);
    expect((await client.post('/api/projects', { data: { name: 'Unauthorized shared', everyoneCanEdit: true } })).status()).toBe(403);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /新建项目/ }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('Everyone from creation');
    await page.getByLabel('项目前缀', { exact: true }).fill('everyone');
    await page.getByRole('tab', { name: '协作权限' }).click();
    await page.getByRole('checkbox', { name: '所有人可修改' }).check();
    const publicCreated = page.waitForResponse(response => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /^确\s*定$/ }).click();
    const shared = (await (await publicCreated).json()).project;
    expect(shared.settings.everyoneCanEdit).toBe(true);
    expect(shared.settings.collaboratorIds).toEqual([]);
    expect((await client.get(`/api/projects/${shared.id}`)).status()).toBe(200);
  } finally { await client.dispose(); }
});

test('admin grants collaboration, members edit without granting access, JS uses custom filename', async ({
  page,
  playwright,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const member = (
    await (
      await page.request.post('/api/users', {
        data: { username: 'collaborator', password: 'password' },
      })
    ).json()
  ).user;
  const outsider = (
    await (
      await page.request.post('/api/users', {
        data: { username: 'outsider', password: 'password' },
      })
    ).json()
  ).user;
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Shared library', prefix: 'shared' },
      })
    ).json()
  ).project;
  const client = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3109' });
  await client.post('/api/auth/login', {
    data: { username: member.username, password: 'password' },
  });
  expect((await client.get(`/api/projects/${project.id}`)).status()).toBe(403);
  await page.goto(`/#/projects/${project.id}`);
  await page.getByRole('button', { name: /设\s*置/ }).click();
  await page.setViewportSize({ width: 1000, height: 700 });
  expect(
    await page
      .locator('.project-settings-dialog .ant-modal-body')
      .evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1,
      ),
  ).toBe(true);
  await page.getByLabel('JS 文件名').fill('team-icons');
  await expect(page.getByLabel('em 尺寸', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Codepoint 起始值', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByLabel('说明', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '协作权限' }).click();
  await expect(page.locator('.project-member-table .ant-table-body')).toBeVisible();
  await page.screenshot({ path: 'test-results/project-collaboration-layout.png' });
  expect(await page.locator('.project-member-table .ant-table-body').evaluate((element) => element.clientHeight)).toBeGreaterThan(160);
  await page.getByRole('row').filter({ hasText: member.username }).getByRole('checkbox').check();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await (await client.get('/api/projects')).json()).projects.some(
      (item: { id: number }) => item.id === project.id,
    ),
  ).toBe(true);
  expect(
    (
      await client.post(`/api/projects/${project.id}/icons/import`, {
        data: {
          items: [
            { name: 'shared', svg: '<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>' },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  expect((await client.delete(`/api/projects/${project.id}`)).status()).toBe(403);
  const beforeBatch = await (await client.get(`/api/projects/${project.id}`)).json();
  expect(
    (
      await client.post(`/api/projects/${project.id}/icons/batch`, {
        data: { iconIds: [beforeBatch.icons[0].id], operation: { type: 'fitMargin', margin: 150 } },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await client.get(`/api/projects/${project.id}`)).json()).project.settings.margin,
  ).toBe(beforeBatch.project.settings.margin);
  await client.patch(`/api/projects/${project.id}`, {
    data: { settings: { collaboratorIds: [outsider.id] } },
  });
  expect(
    (await (await client.get(`/api/projects/${project.id}`)).json()).project.settings
      .collaboratorIds,
  ).toEqual([member.id]);
  expect(
    (
      await page.request.patch(`/api/projects/${project.id}`, {
        data: { settings: { jsFilename: '../bad.js' } },
      })
    ).status(),
  ).toBe(400);
  const anonymous = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3109' });
  const js = await anonymous.get(`/api/projects/${project.id}/javascript`);
  expect(js.status()).toBe(200);
  expect(js.headers()['content-disposition']).toBe('attachment; filename="team-icons.js"');
  const directDownload = page.waitForEvent('download');
  await page.evaluate((url) => {
    const link = document.createElement('a');
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
  }, `/api/projects/${project.id}/javascript`);
  expect((await directDownload).suggestedFilename()).toBe('team-icons.js');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载/ }).click();
  expect((await download).suggestedFilename()).toBe('team-icons.js');
  await page.request.patch(`/api/projects/${project.id}`, {
    data: { settings: { collaboratorIds: [] } },
  });
  expect((await client.get(`/api/projects/${project.id}`)).status()).toBe(403);
  await page.getByRole('button', { name: /设\s*置/ }).click();
  const body = page.locator('.project-settings-dialog .ant-modal-body');
  const height = await body.evaluate((element) => element.clientHeight);
  await page.getByRole('tab', { name: '协作权限' }).click();
  expect(await body.evaluate((element) => element.clientHeight)).toBe(height);
  await expect(page.locator('.project-settings-dialog .ant-table-row').first()).toContainText(
    '创建者',
  );
  await page.getByRole('checkbox', { name: '所有人可修改', exact: true }).check();
  await expect(
    page.getByRole('row').filter({ hasText: member.username }).getByRole('checkbox'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await client.get(`/api/projects/${project.id}`)).status()).toBe(200);
  expect(
    (await (await client.get('/api/projects')).json()).projects.some(
      (item: { id: number }) => item.id === project.id,
    ),
  ).toBe(true);
  expect(
    (
      await client.patch(`/api/projects/${project.id}`, {
        data: { name: 'Everyone edited', settings: { everyoneCanEdit: false } },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await (await client.get(`/api/projects/${project.id}`)).json()).project.settings
      .everyoneCanEdit,
  ).toBe(true);
  expect((await client.delete(`/api/projects/${project.id}`)).status()).toBe(403);
  expect((await anonymous.get(`/api/projects/${project.id}`)).status()).toBe(401);
  const future = (
    await (
      await page.request.post('/api/users', {
        data: { username: 'future-member', password: 'password' },
      })
    ).json()
  ).user;
  await anonymous.post('/api/auth/login', {
    data: { username: future.username, password: 'password' },
  });
  expect((await anonymous.get(`/api/projects/${project.id}`)).status()).toBe(200);
  expect(
    (
      await anonymous.patch(`/api/projects/${project.id}`, { data: { name: 'Forbidden' } })
    ).status(),
  ).toBe(403);
  expect((await anonymous.delete(`/api/projects/${project.id}`)).status()).toBe(403);
  await page.request.patch(`/api/projects/${project.id}`, {
    data: { settings: { everyoneCanEdit: false, collaboratorIds: [] } },
  });
  expect((await client.get(`/api/projects/${project.id}`)).status()).toBe(403);
  await client.dispose();
  await anonymous.dispose();
});
