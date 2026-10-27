import { test, expect } from '@playwright/test';

test('icon sorting supports both fields/directions, filtering, selection and per-user persistence', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Sorting library', prefix: 'sort', everyoneCanEdit: true },
      })
    ).json()
  ).project;
  for (const [index, name] of ['Icon 10', 'Icon 1', 'Icon 2'].entries()) {
    const response = await page.request.post(`/api/projects/${project.id}/icons/import`, {
      data: {
        items: [
          { name, svg: `<svg viewBox="0 0 24 24"><rect width="${index + 5}" height="10"/></svg>` },
        ],
      },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto(`/#/projects/${project.id}`);
  const names = page.locator('.project-icon-card .icon-card-name');
  await expect(names).toHaveText(['Icon 2', 'Icon 1', 'Icon 10']);
  await expect(page.getByRole('radio', { name: '按创建时间排序', exact: true })).toBeChecked();
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '升序', exact: true }) })
    .click();
  await expect(names).toHaveText(['Icon 10', 'Icon 1', 'Icon 2']);
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '按名称排序', exact: true }) })
    .click();
  await expect(names).toHaveText(['Icon 1', 'Icon 2', 'Icon 10']);
  // Range selection must follow the visible sorted order, not the API order.
  await page.getByRole('button', { name: '选择 Icon 1', exact: true }).click();
  await page
    .getByRole('button', { name: '选择 Icon 2', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.project-icon-card.selected .icon-card-name')).toHaveText([
    'Icon 1',
    'Icon 2',
  ]);
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '降序', exact: true }) })
    .click();
  await expect(names).toHaveText(['Icon 10', 'Icon 2', 'Icon 1']);
  const search = page.getByPlaceholder('搜索项目内图标');
  await search.fill('Icon 1');
  await expect(names).toHaveText(['Icon 10', 'Icon 1']);
  await search.clear();
  const controlsBox = await page.locator('.icon-sort-controls').boundingBox();
  const searchBox = await search.boundingBox();
  expect(controlsBox!.x + controlsBox!.width).toBeLessThanOrEqual(searchBox!.x);
  await page.reload();
  await expect(names).toHaveText(['Icon 10', 'Icon 2', 'Icon 1']);
  await expect(page.getByRole('radio', { name: '按名称排序', exact: true })).toBeChecked();
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '升序', exact: true }) })
    .click();
  await expect(names).toHaveText(['Icon 1', 'Icon 2', 'Icon 10']);
  await page.screenshot({ path: 'test-results/icon-sort.png', fullPage: true, animations: 'disabled' });
  // A newly opened page restores the same user's preference.
  const reopened = await context.newPage();
  await reopened.goto(`/#/projects/${project.id}`);
  await expect(reopened.locator('.project-icon-card .icon-card-name')).toHaveText([
    'Icon 1',
    'Icon 2',
    'Icon 10',
  ]);
  await reopened.close();
  await page.request.post('/api/users', {
    data: { username: 'sort-member', password: 'member-password' },
  });
  await page.request.post('/api/auth/logout');
  await page.request.post('/api/auth/login', {
    data: { username: 'sort-member', password: 'member-password' },
  });
  await page.reload();
  await expect(page.getByRole('radio', { name: '按创建时间排序', exact: true })).toBeChecked();
  await expect(names).toHaveText(['Icon 2', 'Icon 1', 'Icon 10']);
  await page.request.post('/api/auth/logout');
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  await page.reload();
  await expect(names).toHaveText(['Icon 1', 'Icon 2', 'Icon 10']);
  expect(errors).toEqual([]);
});
