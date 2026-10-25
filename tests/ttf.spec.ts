import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('TTF download, Unicode editing, public caching and updates', async ({ page, playwright }) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const { project } = await (
    await page.request.post('/api/projects', {
      data: { name: 'TTF regression', prefix: 'ttf' },
    })
  ).json();
  const endpoint = `/api/projects/${project.id}`;
  await page.request.post(`${endpoint}/icons/import`, {
    data: {
      items: [
        {
          name: 'square',
          unicode: 'U+E900',
          svg: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="red"/></svg>',
        },
        {
          name: 'circle',
          unicode: 'U+E900',
          svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>',
        },
      ],
    },
  });
  const { icons } = await (await page.request.get(endpoint)).json();
  expect(icons).toHaveLength(2);
  expect(new Set(icons.map((icon: { codepoint: number }) => icon.codepoint)).size).toBe(2);
  const square = icons.find((icon: { name: string }) => icon.name === 'square');
  await page.goto(`/#/projects/${project.id}`);
  await page.getByRole('button', { name: '选择 square', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '编辑' }).click();
  await expect(page.getByLabel('Unicode', { exact: true })).toHaveValue('U+E900');
  await page.getByLabel('Unicode', { exact: true }).fill('U+EA00');
  await page.getByRole('button', { name: '保存并关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = (await (await page.request.get(endpoint)).json()).icons.find(
    (icon: { id: number }) => icon.id === square.id,
  );
  expect(saved.codepoint).toBe(0xea00);
  const conflict = await page.request.patch(`${endpoint}/icons/${square.id}`, {
    data: { codepoint: icons.find((icon: { id: number }) => icon.id !== square.id).codepoint },
  });
  expect(conflict.status()).toBe(409);

  await page.getByRole('button', { name: /设\s*置/ }).click();
  await page.getByLabel('导出文件名').fill('team-icons.ttf');
  await expect(
    page.getByText('下载文件：team-icons.js / team-icons.ttf', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page
    .getByRole('radiogroup', { name: '导出格式' })
    .getByText('TrueType Font', { exact: true })
    .click();
  await page.getByRole('button', { name: '生成 iconfont.ttf' }).click();
  await expect(page.getByText('已生成 iconfont.ttf', { exact: true })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载iconfont.ttf' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('team-icons.ttf');
  expect((await readFile((await download.path())!)).readUInt32BE(0)).toBe(0x00010000);

  const anonymous = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3109' });
  try {
    const first = await anonymous.get(`${endpoint}/ttf`);
    expect(first.status()).toBe(200);
    expect(first.headers()['content-type']).toBe('font/ttf');
    expect(first.headers()['content-disposition']).toContain('filename="team-icons.ttf"');
    const etag = first.headers().etag;
    expect(
      (await anonymous.get(`${endpoint}/ttf`, { headers: { 'If-None-Match': etag } })).status(),
    ).toBe(304);
    const patch = await page.request.patch(`${endpoint}/icons/${square.id}`, {
      data: { codepoint: 'U+EA01' },
    });
    expect(patch.status()).toBe(200);
    const latest = await anonymous.get(`${endpoint}/ttf`, { headers: { 'If-None-Match': etag } });
    expect(latest.status()).toBe(200);
    expect(latest.headers().etag).not.toBe(etag);
    expect((await latest.body()).readUInt32BE(0)).toBe(0x00010000);
    const js = await anonymous.get(`${endpoint}/javascript`);
    expect(js.status()).toBe(200);
    expect(js.headers()['content-disposition']).toContain('filename="team-icons.js"');
    expect(await js.text()).toContain('59905');
    expect((await anonymous.post(`${endpoint}/ttf`)).status()).toBe(401);
    expect((await anonymous.get('/api/projects/999999/ttf')).status()).toBe(404);
    expect((await anonymous.get('/api/projects/nope/ttf')).status()).toBe(400);
  } finally {
    await anonymous.dispose();
  }
});
