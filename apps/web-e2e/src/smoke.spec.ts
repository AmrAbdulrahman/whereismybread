import { expect, test } from '@playwright/test';

test('a signed-out visitor is sent to the login screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('the app guards its routes', async ({ page }) => {
  await page.goto('/plan');
  await expect(page).toHaveURL(/\/login\?next=%2Fplan/);
});

test('the login screen links to sign-up and password reset', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(
    page.getByRole('link', { name: 'Create an account' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Forgot your password?' }),
  ).toBeVisible();
});

test('the version endpoint reports a build id', async ({ request }) => {
  const res = await request.get('/api/version');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { buildId: string };
  expect(typeof body.buildId).toBe('string');
  expect(body.buildId.length).toBeGreaterThan(0);
  expect(res.headers()['cache-control']).toContain('no-store');
});
