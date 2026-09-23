import { test, expect } from '@playwright/test';

test('JS preview does not execute code or write icons before manual confirmation', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Preview test', prefix: 'preview' },
      })
    ).json()
  ).project;
  await page.goto(`/#/projects/${project.id}`);
  await page.getByRole('button', { name: /导\s*入/ }).click();
  const sprite =
    '<svg><symbol id="icon-safe" viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></symbol><symbol id="icon-unsafe"><path onload="alert(1)"/></symbol></svg>';
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'iconfont.js',
      mimeType: 'application/javascript',
      buffer: Buffer.from(`window.importExecuted=true;var sprite=${JSON.stringify(sprite)};`),
    });
  const dialog = page.getByRole('dialog', { name: '导入图标' });
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect(dialog.getByText('1 项未通过校验')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认导入' })).toBeDisabled();
  expect(await page.evaluate(() => 'importExecuted' in window)).toBe(false);
  expect((await (await page.request.get(`/api/projects/${project.id}`)).json()).icons).toHaveLength(
    0,
  );
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('成功 1，跳过 0，失败 0')).toBeVisible();
  const payload = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(payload.icons).toHaveLength(1);
  expect(payload.icons[0].svg).not.toContain('onload');
  const rejected = await (
    await page.request.post(`/api/projects/${project.id}/icons/import`, {
      data: { items: [{ name: 'bad', svg: '<svg><script>alert(1)</script></svg>' }] },
    })
  ).json();
  expect(rejected.job.failed).toBe(1);
  expect((await (await page.request.get(`/api/projects/${project.id}`)).json()).icons).toHaveLength(
    1,
  );
  await page.getByText('成功 1，跳过 0，失败 0').click();
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.getByRole('button', { name: /导\s*入/ }).click();
  const many = `<svg>${Array.from({ length: 120 }, (_, index) => `<symbol id="item-${index}"><path d="M0 0H10V10Z"/></symbol>`).join('')}</svg>`;
  await page.locator('input[type=file]').setInputFiles({ name: 'many.js', mimeType: 'application/javascript', buffer: Buffer.from(`var s=${JSON.stringify(many)};`) });
  await expect(dialog.getByRole('checkbox')).toHaveCount(120);
  await page.locator('.import-dialog').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const upload = page.locator('.import-upload');
  const before = await upload.boundingBox();
  await page.locator('.import-results').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await page.locator('.import-results').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await upload.boundingBox()).toEqual(before);
  expect(await page.locator('.import-dialog .ant-modal-body').evaluate((element) => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/import-preview.png' });
});
