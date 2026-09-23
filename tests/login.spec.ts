import { test, expect } from '@playwright/test';

test('login reference layout, themes and mobile language controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'IconFamily' })).toBeVisible();
  const brand = await page.locator('.login-brand-panel').boundingBox();
  const form = await page.locator('.login-form-panel').boundingBox();
  expect(brand!.x + brand!.width).toBeCloseTo(form!.x, 0);
  await page.screenshot({ path: 'test-results/login-light.png', fullPage: true });
  await page.getByRole('switch', { name: '暗色主题' }).setChecked(true);
  await page.getByRole('combobox', { name: '语言', exact: true }).click();
  await page.getByText('English', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/login-dark-en.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
});
