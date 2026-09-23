import { test, expect } from '@playwright/test';

test('card selection, shift range, marquee, context actions and clone persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Card actions', prefix: 'actions' },
      })
    ).json()
  ).project;
  await page.request.post(`/api/projects/${project.id}/icons/import`, {
    data: {
      items: Array.from({ length: 8 }, (_, i) => ({
        name: `Item ${i}`,
        svg: `<svg viewBox="0 0 1024 1024"><path d="M100 100H900V${200 + i * 70}H100Z"/></svg>`,
      })),
    },
  });
  await page.goto('/');
  const cards = page.locator('.project-icon-card');
  await expect(cards).toHaveCount(8);
  const first = cards.first();
  const fourth = cards.nth(3);
  await first.locator('.icon-open').click();
  await expect(first.getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await cards.nth(1).locator('.icon-open').click();
  await expect(first.getByRole('checkbox')).not.toBeChecked();
  await first.locator('.icon-open').click({ modifiers: ['Control'] });
  await expect(cards.nth(1).getByRole('checkbox')).toBeChecked();
  await expect(first.getByRole('checkbox')).toBeChecked();
  await cards
    .nth(1)
    .locator('.icon-open')
    .click({ modifiers: ['Control'] });
  await expect(cards.nth(1).getByRole('checkbox')).not.toBeChecked();
  await first.locator('.icon-open').click();
  await fourth.locator('.icon-open').click({ modifiers: ['Shift'] });
  await expect(page.getByText('已选 4 个', { exact: true })).toBeVisible();
  await fourth.click({ button: 'right' });
  await expect(page.getByText('已选 4 个', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await cards.nth(5).click({ button: 'right' });
  await expect(page.getByText('已选 1 个', { exact: true })).toBeVisible();
  await expect(cards.nth(5).getByRole('checkbox')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^全\s*选$/ }).click();
  await page.getByRole('button', { name: '取消全选' }).click();
  const start = (await first.boundingBox())!;
  const end = (await cards.nth(2).boundingBox())!;
  await page.mouse.move(start.x + 8, start.y + 40);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText('已选 3 个', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const id = await first.getAttribute('data-icon-id');
  const original = (
    await (await page.request.get(`/api/projects/${project.id}`)).json()
  ).icons.find((icon: { id: number }) => String(icon.id) === id);
  await expect(first.locator('.icon-copy-button')).toHaveAttribute(
    'title',
    `复制代码: actions-${original.slug}`,
  );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await first.click({ button: 'right' });
  await expect(page.locator('[data-icon-menu]').getByRole('menuitem')).toHaveCount(6);
  await page.getByRole('menuitem', { name: '加入购物车' }).click();
  await expect
    .poll(async () => {
      const cart = await (await page.request.get('/api/cart')).json();
      return cart.items.some(
        (item: { remoteId: string; svg: string }) =>
          item.remoteId === `project-icon:${id}` && !!item.svg,
      );
    })
    .toBe(true);
  await page.reload();
  await first.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '已在购物车' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('menuitem', { name: '重命名' }).click();
  const projectReads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && /\/api\/projects(?:\?|\/|$)/.test(request.url()))
      projectReads.push(request.url());
  });
  await page.getByLabel('图标代码后缀').fill('renamed-icon');
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first.locator('.icon-copy-button')).toHaveAttribute(
    'title',
    '复制代码: actions-renamed-icon',
  );
  await expect(first.getByRole('checkbox')).toBeChecked();
  await first.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '编辑' }).click();
  await page.locator('#editor-slug').fill('edited-icon');
  await page.getByRole('button', { name: '保存并关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first.locator('.icon-copy-button')).toHaveAttribute(
    'title',
    '复制代码: actions-edited-icon',
  );
  await expect(first.getByRole('checkbox')).toBeChecked();
  expect(projectReads).toEqual([]);
  const updated = (await (await page.request.get(`/api/projects/${project.id}`)).json()).icons.find(
    (icon: { id: number }) => String(icon.id) === id,
  );
  expect(updated.slug).toBe('edited-icon');
  expect(updated.name).toBe(original.name);
  expect(String(updated.codepoint)).toBe(String(original.codepoint));
  await first.locator('.icon-copy-button').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('actions-edited-icon');
  await first.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '拷贝到…' }).click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(cards).toHaveCount(9);
  const clone = (await (await page.request.get(`/api/projects/${project.id}`)).json()).icons[0];
  expect(clone.svg).toBe(updated.svg);
  expect(clone.slug).not.toBe(original.slug);
  expect(clone.codepoint).not.toBe(original.codepoint);
  await cards.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除' }).click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(cards).toHaveCount(8);
  expect(errors).toEqual([]);
});
