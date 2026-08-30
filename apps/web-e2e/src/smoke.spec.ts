import { expect, test } from '@playwright/test';

test('the root redirects to the calendar screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole('heading', { name: 'Upcoming payments' }),
  ).toBeVisible();
});

test('the app shell exposes the primary navigation', async ({ page }) => {
  await page.goto('/calendar');
  for (const label of [
    'Calendar',
    'Subscriptions',
    'Installments',
    'Checklist',
    'Debts',
  ]) {
    await expect(page.getByRole('link', { name: label }).first()).toBeVisible();
  }
});

test('the version endpoint reports a build id', async ({ request }) => {
  const res = await request.get('/api/version');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { buildId: string };
  expect(typeof body.buildId).toBe('string');
  expect(body.buildId.length).toBeGreaterThan(0);
  expect(res.headers()['cache-control']).toContain('no-store');
});
