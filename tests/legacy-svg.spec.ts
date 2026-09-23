import { test, expect } from '@playwright/test';

test('project switching renders legacy escaped SVG without invalid attributes', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'test-password' },
  });
  const project = (
    await (
      await page.request.post('/api/projects', { data: { name: 'Legacy SVG', prefix: 'legacy' } })
    ).json()
  ).project;
  await page.request.post(`/api/projects/${project.id}/icons/import`, {
    data: {
      items: [
        {
          name: 'legacy',
          svg: '<svg viewBox="0 0 1024 1024"><path d="M100 100H900V900H100Z"/></svg>',
        },
      ],
    },
  });
  await page.route(`**/api/projects/${project.id}?view=workspace`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.icons[0].svg = String.raw`<svg viewBox=\"0 0 1024 1024\"><g transform=\"translate(0 0)\"><path d=\"M100 100H900V900H100Z\"/></g></svg>`;
    await route.fulfill({ response, json: data });
  });
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(`/#/projects/${project.id}`);
  await expect(page.locator('.project-icon-card .svg-preview path')).toHaveAttribute(
    'd',
    'M100 100H900V900H100Z',
  );
  await expect(page.locator('.project-icon-card g')).toHaveAttribute('transform', 'translate(0 0)');
  expect(
    errors.filter((error) => /attribute|Expected moveto|Expected transform/.test(error)),
  ).toEqual([]);
});
