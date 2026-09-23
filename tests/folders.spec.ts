import { test, expect } from '@playwright/test';

test('optional folders, direct filtering, moves, copy destinations and restored routes', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Folder library', prefix: 'folder', themeColor: '#c34682' },
      })
    ).json()
  ).project;
  const destination = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Copy destination', prefix: 'dest' },
      })
    ).json()
  ).project;
  await page.request.post(`/api/projects/${project.id}/icons/import`, {
    data: {
      items: [
        { name: 'one', svg: '<svg viewBox="0 0 1024 1024"><path d="M0 0H200V200Z"/></svg>' },
        {
          name: 'two',
          svg: '<svg viewBox="0 0 1024 1024"><circle cx="500" cy="500" r="200"/></svg>',
        },
      ],
    },
  });
  const read = async () => await (await page.request.get(`/api/projects/${project.id}`)).json();
  const original = await read();
  expect(
    original.icons.every((icon: { folder_id: unknown }) => icon.folder_id == null),
  ).toBeTruthy();
  await page.goto(`/#/projects/${project.id}`);
  await expect(page.locator('.project-icon-card')).toHaveCount(2);
  await page
    .locator('.project-name')
    .filter({ hasText: /^Folder library$/ })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: '新建目录', exact: true }).click();
  await page.getByLabel('目录名称').fill('Parent');
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const parent = (await read()).project.settings.folders[0];
  const parentRow = page.locator('.folder-row').filter({ hasText: 'Parent' });
  await expect(parentRow.locator('.anticon-folder')).toHaveCSS('color', 'rgb(195, 70, 130)');
  await parentRow.locator('.folder-name').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '新建子目录' }).click();
  await page.getByLabel('目录名称').fill('Child');
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const child = (await read()).project.settings.folders.find(
    (folder: { name: string }) => folder.name === 'Child',
  );
  const one = original.icons.find((icon: { name: string }) => icon.name === 'one');
  await page.locator(`[data-icon-id="${one.id}"]`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /移动到…/ }).click();
  await page.getByRole('combobox', { name: '目标目录' }).click();
  await page.locator('.ant-select-dropdown').getByText('Child', { exact: true }).click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .locator('.project-folder-tree .folder-name')
    .filter({ hasText: /^Parent$/ })
    .click();
  await expect(page.locator('.project-icon-card')).toHaveCount(0);
  // Deep links expand their ancestors and survive refresh/back/forward.
  await page.goto(`/#/projects/${project.id}/folders/${child.id}`);
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page
    .locator('.project-name')
    .filter({ hasText: /^Folder library$/ })
    .click();
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page.locator('.workspace-toolbar').getByText('全部图标', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/projects/${project.id}/all$`));
  await expect(page.locator('.project-icon-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.project-icon-card')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/folders/${child.id}$`));
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page.goForward();
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page.goBack();
  await page.locator('.project-icon-card').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '拷贝到…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Folder library');
  await expect(dialog).toContainText('Child');
  await dialog.getByRole('combobox', { name: '目标项目' }).click();
  await page.locator('.ant-select-dropdown').getByText('Copy destination', { exact: true }).click();
  await expect(dialog).toContainText('项目根目录');
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(dialog).toHaveCount(0);
  const copied = (await (await page.request.get(`/api/projects/${destination.id}`)).json()).icons;
  expect(copied).toHaveLength(1);
  expect(copied[0].folder_id).toBeNull();
  expect((await read()).icons).toHaveLength(2);
  await page.request.post('/api/auth/logout');
  await page.reload();
  await expect(page).toHaveURL(/#\/login\?redirect=/);
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/folders/${child.id}$`));
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await page.getByRole('button', { name: '目录操作 Parent', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除目录' }).click();
  await expect(page.getByRole('dialog')).toContainText('1 个子目录和 1 个图标');
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/projects/${project.id}/all$`));
  await expect(page.locator('.project-icon-card')).toHaveCount(1);
  await expect(page.getByText('目录已删除或不存在，已返回项目全部视图')).toBeVisible();
  await page.goto(`/#/projects/${project.id}/folders/${child.id}`);
  await expect(page).toHaveURL(new RegExp(`#/projects/${project.id}/all$`));
});

test('project-level folder and copy permissions cannot cross unauthorized projects', async ({
  page,
  playwright,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const user = (
    await (
      await page.request.post('/api/users', {
        data: { username: 'folder-member', password: 'password' },
      })
    ).json()
  ).user;
  const source = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Shared folders', collaboratorIds: [user.id] },
      })
    ).json()
  ).project;
  const privateProject = (
    await (await page.request.post('/api/projects', { data: { name: 'Private folders' } })).json()
  ).project;
  await page.request.post(`/api/projects/${source.id}/icons/import`, {
    data: {
      items: [{ name: 'x', svg: '<svg viewBox="0 0 1024 1024"><path d="M0 0H10V10Z"/></svg>' }],
    },
  });
  const icon = (await (await page.request.get(`/api/projects/${source.id}`)).json()).icons[0];
  const client = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3109' });
  try {
    await client.post('/api/auth/login', {
      data: { username: user.username, password: 'password' },
    });
    const folderResponse = await client.post(`/api/projects/${source.id}/folders`, {
      data: { name: 'Member folder' },
    });
    expect(folderResponse.status()).toBe(201);
    const folder = (await folderResponse.json()).folder;
    expect(
      (
        await client.post(`/api/projects/${source.id}/icons/move`, {
          data: { iconIds: [icon.id], folderId: folder.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await client.post(`/api/projects/${source.id}/icons/${icon.id}/clone`, {
          data: { targetProjectId: privateProject.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await client.post(`/api/projects/${privateProject.id}/folders`, {
          data: { name: 'Forbidden' },
        })
      ).status(),
    ).toBe(403);
    await page.request.patch(`/api/projects/${source.id}`, { data: { settings: { folders: [] } } });
    expect(
      (await (await page.request.get(`/api/projects/${source.id}`)).json()).project.settings
        .folders,
    ).toHaveLength(1);
  } finally {
    await client.dispose();
  }
});
