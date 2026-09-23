import { test, expect } from '@playwright/test';

test('project colors persist, label projects and color previews', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'test-password' } });
  const project = (await (await page.request.post('/api/projects', { data: { name: 'Project colors', prefix: 'colors', themeColor: '#e54b4b' } })).json()).project;
  expect(project.settings.themeColor).toBe('#e54b4b');
  await page.request.post(`/api/projects/${project.id}/icons/import`, { data: { items: [{ name: 'colored', svg: '<svg viewBox="0 0 1024 1024"><path fill="currentColor" d="M100 100H900V900H100Z"/></svg>' }] } });
  await page.goto(`/#/projects/${project.id}`);
  await expect(page.locator('.workspace-title .project-color-bar')).toHaveCSS('background-color', 'rgb(229, 75, 75)');
  await expect(page.locator('.project-icon-card .svg-preview path')).toHaveCSS('fill', 'rgb(229, 75, 75)');
  await page.getByRole('button', { name: /设置/ }).click();
  await expect(page.getByText('项目主题色', { exact: true })).toBeVisible();
  await expect(page.locator('.project-settings-dialog')).toContainText(/#e54b4b/i);
  await page.getByRole('button', { name: /取\s*消/ }).click();
  const changed = await page.request.patch(`/api/projects/${project.id}`, { data: { settings: { themeColor: '#22aa88' } } });
  expect(changed.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('.project-icon-card .svg-preview path')).toHaveCSS('fill', 'rgb(34, 170, 136)');
  const invalid = await page.request.patch(`/api/projects/${project.id}`, { data: { settings: { themeColor: 'url(https://example.com)' } } });
  expect(invalid.status()).toBe(400);
});
