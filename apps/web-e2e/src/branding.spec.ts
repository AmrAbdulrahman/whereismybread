import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB + outbound network
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the branding fetch (calls monzo.com)',
);

test('a payment pulls its logo and name from the service website', async ({
  page,
}) => {
  const email = `e2e+brand-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Brand Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Amount').fill('9');
  // a recurring payment shows a Provider field
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Provider').fill('https://monzo.com');

  // the logo previews next to the URL field, and the name auto-fills
  await expect(page.locator('form img').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel('Description')).toHaveValue(/monzo/i);

  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.getByRole('button', { name: 'list' }).click();
  await expect(
    page.getByRole('button', { name: /Edit .*monzo/i }),
  ).toBeVisible();
});
