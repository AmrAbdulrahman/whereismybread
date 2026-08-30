import { expect, test } from '@playwright/test';

/**
 * Full local auth flow against the real database. Skipped unless AUTH_E2E=1
 * (needs POSTGRES_URL / AUTH_SECRET / RESEND_API_KEY in the dev server's env).
 * Leaves a throwaway user behind — fine for a dev database.
 */
// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed auth flow',
);

test('sign up, sign out, sign back in', async ({ page }) => {
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a-strong-enough-password';
  const name = 'E2E Tester';

  // sign up -> lands in the app
  await page.goto('/signup');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/calendar$/);

  // account page shows the profile
  await page.goto('/account');
  await expect(page.getByLabel('Name')).toHaveValue(name);
  await expect(page.getByLabel('Email')).toHaveValue(email);

  // sign out -> guard blocks the app
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Sign out' })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/login/);

  // wrong password is rejected generically
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('the-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();

  // correct password gets back in
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/calendar$/);
});

test('forgot-password always reports the generic message', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('nobody-here@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
});
