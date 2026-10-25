import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('copy code, hexadecimal Unicode and SVG, download SVG and every PNG size', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', { data: { name: 'Exports', prefix: 'export' } })
    ).json()
  ).project;
  await page.request.post(`/api/projects/${project.id}/icons/import`, {
    data: {
      items: [
        {
          name: 'sample',
          svg: '<svg viewBox="0 0 1024 1024"><path fill="#ff0000" d="M100 100H900V900H100Z"/></svg>',
        },
      ],
    },
  });
  await page.goto(`/#/projects/${project.id}`);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const card = page.locator('.project-icon-card').first();
  await card.getByRole('button', { name: '复制代码', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('export-sample');
  await expect(page.getByText('已复制代码：export-sample', { exact: true })).toBeVisible();
  const format = page.getByRole('radiogroup', { name: '导出格式' });
  await format.getByText('TrueType Font', { exact: true }).click();
  await expect(format.getByRole('radio', { name: 'TrueType Font', exact: true })).toBeChecked();
  await card.getByRole('button', { name: '复制 Unicode', exact: true }).click();
  await expect(page.getByText('已复制 Unicode：0xE900', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0xE900');
  await expect(card.getByRole('button', { name: '复制代码', exact: true })).toHaveCount(0);
  await format.getByText('JavaScript', { exact: true }).click();
  await expect(format.getByRole('radio', { name: 'JavaScript', exact: true })).toBeChecked();
  await card.getByRole('button', { name: '复制代码', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('export-sample');
  await expect(card.getByRole('checkbox')).not.toBeChecked();
  const open = () => card.getByRole('button', { name: '导出图标 sample' }).click();
  await open();
  await page.getByRole('menuitem', { name: '复制 Unicode (0xE900)' }).click();
  await expect(page.getByText('已复制 Unicode：0xE900', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0xE900');
  await open();
  await page.getByRole('menuitem', { name: '复制 SVG' }).click();
  const svg = await page.evaluate(() => navigator.clipboard.readText());
  expect(svg).toContain('<svg');
  expect(svg).toContain('http://www.w3.org/2000/svg');
  await open();
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '下载 SVG' }).click();
  const downloadedSvg = await svgDownload;
  expect(downloadedSvg.suggestedFilename()).toBe('export-sample.svg');
  expect(await readFile((await downloadedSvg.path())!, 'utf8')).toBe(svg);
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    await open();
    const pngMenu = page.getByRole('menuitem', { name: '下载 PNG' });
    await pngMenu.focus();
    await pngMenu.press('ArrowRight');
    await expect(
      page.getByRole('menuitem', { name: `${size} × ${size} px`, exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent('download', { timeout: 5000 }).catch(async (error) => {
      throw new Error(`${error.message}\n${await page.locator('body').innerText()}`);
    });
    const sizeOption = page.getByRole('menuitem', { name: `${size} × ${size} px`, exact: true });
    // Keep the pointer on the parent while selecting the portalled submenu by
    // keyboard, so its hover animation cannot close it during pointer travel.
    await sizeOption.focus();
    await sizeOption.press('Enter');
    const file = await download;
    expect(file.suggestedFilename()).toBe(`export-sample-${size}.png`);
    const png = await readFile((await file.path())!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  await expect(card.getByRole('checkbox')).not.toBeChecked();
});
