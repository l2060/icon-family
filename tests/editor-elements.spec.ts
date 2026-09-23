import { test, expect } from '@playwright/test';

test('select, drag, rotate and scale one SVG element, undo and persist', async ({ page }) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', {
        data: { name: 'Element editor', prefix: 'elements' },
      })
    ).json()
  ).project;
  await page.request.post(`/api/projects/${project.id}/icons/import`, {
    data: {
      items: [
        {
          name: 'pair',
          svg: '<svg viewBox="0 0 1024 1024"><g transform="translate(20 10)"><rect id="left" opacity="0.4" x="100" y="200" width="200" height="200"/><circle id="right" cx="700" cy="500" r="100"/></g></svg>',
        },
      ],
    },
  });
  await page.goto(`/#/projects/${project.id}`);
  await page.locator('.project-icon-card').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '编辑' }).click();
  const left = page.locator('.editor-stage #left');
  const right = page.locator('.editor-stage #right');
  await left.click();
  await expect(page.getByRole('spinbutton', { name: '透明度百分比' })).toHaveValue('40');
  await expect(left).toHaveAttribute('data-editor-selected', '');
  await page.getByRole('button', { name: '+15°', exact: true }).click();
  await expect(left).toHaveAttribute('transform', /matrix/);
  expect(await right.getAttribute('transform')).toBeNull();
  await expect(page.locator('.editor-selection-box')).toBeVisible();
  const stage = page.locator('.editor-stage');
  const initialStage = (await stage.boundingBox())!;
  await page.mouse.move(initialStage.x + 20, initialStage.y + 20);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(initialStage.x + 60, initialStage.y + 45, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => Math.round((await stage.boundingBox())!.x - initialStage.x)).toBe(40);
  await expect(left).toHaveAttribute('data-editor-selected', '');
  const rotated = await left.getAttribute('transform');
  await page.getByRole('button', { name: /^放\s*大$/ }).click();
  await expect(left).not.toHaveAttribute('transform', rotated!);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(left).toHaveAttribute('transform', rotated!);
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 15, { steps: 6 });
  await page.mouse.up();
  await expect(left).not.toHaveAttribute('transform', rotated!);
  const moved = await left.getAttribute('transform');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(left).toHaveAttribute('transform', rotated!);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(left).toHaveAttribute('transform', moved!);
  await page.getByRole('combobox', { name: '选择 SVG 元素' }).click();
  await page.getByText('g 1', { exact: true }).click();
  await page.getByRole('button', { name: '+15°', exact: true }).click();
  await expect(page.locator('.editor-stage [data-editor-node="0"]')).toHaveAttribute(
    'transform',
    /matrix/,
  );
  expect(await right.getAttribute('transform')).toBeNull();
  await page.getByRole('combobox', { name: '选择 SVG 元素' }).click();
  await page.getByText('rect #left', { exact: true }).click();
  await page.getByRole('button', { name: '水平居中', exact: true }).click();
  await page.getByRole('button', { name: '垂直居中', exact: true }).click();
  const root = page.locator('.editor-stage .svg-preview > svg');
  const centered = (await left.boundingBox())!, canvas = (await root.boundingBox())!;
  expect(Math.abs(centered.x + centered.width / 2 - canvas.x - canvas.width / 2)).toBeLessThan(1);
  expect(Math.abs(centered.y + centered.height / 2 - canvas.y - canvas.height / 2)).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/editor-redesign.png' });
  await page.getByRole('button', { name: '取消元素选择' }).click();
  await page.getByRole('button', { name: '水平居中', exact: true }).click();
  await page.getByRole('button', { name: '垂直居中', exact: true }).click();
  const whole = (await page.locator('.editor-stage .svg-preview > svg > g').boundingBox())!;
  expect(Math.abs(whole.x + whole.width / 2 - canvas.x - canvas.width / 2)).toBeLessThan(1);
  expect(Math.abs(whole.y + whole.height / 2 - canvas.y - canvas.height / 2)).toBeLessThan(1);
  const centeredTransform = await left.getAttribute('transform');
  await left.click();
  await page.getByRole('button', { name: '置顶', exact: true }).click();
  expect(await left.evaluate(el => el.parentElement?.lastElementChild?.id)).toBe('left');
  await expect(left).toHaveAttribute('data-editor-selected', '');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await left.evaluate(el => el.parentElement?.lastElementChild?.id)).toBe('right');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await left.evaluate(el => el.parentElement?.lastElementChild?.id)).toBe('left');
  await page.getByRole('combobox', { name: '填充', exact: true }).click();
  await page.getByText('自定义', { exact: true }).click();
  await expect(left).toHaveAttribute('fill', '#1677ff');
  expect(await right.getAttribute('fill')).not.toBe('#1677ff');
  await page.getByRole('combobox', { name: '描边', exact: true }).click();
  await page.locator('.editor-stroke-options').getByText('跟随文字', { exact: true }).click();
  await expect(left).toHaveAttribute('stroke', 'currentColor');
  await page.getByRole('spinbutton', { name: '透明度百分比' }).fill('65');
  await page.getByRole('spinbutton', { name: '透明度百分比' }).press('Tab');
  await expect(left).toHaveAttribute('opacity', '0.65');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => page.locator('.editor-inspector').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/editor-compact.png' });
  await page.getByRole('button', { name: '保存并关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = (await (await page.request.get(`/api/projects/${project.id}`)).json()).icons[0].svg;
  expect(saved).toContain(centeredTransform);
  expect(saved).not.toContain('data-editor');
  expect(saved).toContain('id="right"');
  expect(saved).toContain('fill="#1677ff"');
  expect(saved).toContain('opacity="0.65"');
  expect(saved.indexOf('id="right"')).toBeLessThan(saved.indexOf('id="left"'));
});
