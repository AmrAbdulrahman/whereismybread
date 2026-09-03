import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the payment-flag flow',
);

async function signUp(page: Page) {
  const email = `e2e+flag-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Flag Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

/** The amber note strip under a flagged occurrence (a button, named by its text). */
const strip = (page: Page, text: string | RegExp) =>
  page.getByRole('button', { name: text }).first();

test('a one-time payment flags without a scope choice', async ({ page }) => {
  await signUp(page);

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Laptop');
  await page.getByLabel('Amount').fill('1200');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();
  await page.getByRole('button', { name: 'list' }).click();

  await page.getByRole('button', { name: 'Flag Laptop' }).click();
  const dialog = page.getByRole('dialog', { name: 'Flag Laptop' });
  await expect(dialog.getByRole('radio')).toHaveCount(0); // one-time → no scope
  await dialog.getByLabel('Note').fill('check the warranty terms');
  await dialog.getByRole('button', { name: 'Flag', exact: true }).click();

  await expect(strip(page, /check the warranty terms/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit flag on Laptop' }).click();
  await page
    .getByRole('dialog', { name: 'Flag Laptop' })
    .getByRole('button', { name: 'Remove flag' })
    .click();
  await expect(strip(page, /check the warranty terms/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Flag Laptop' })).toBeVisible();
});

test('a recurring payment flags the series or the occurrence', async ({
  page,
}) => {
  await signUp(page);

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('1000');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Day of the month').fill('5');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();
  await page.getByRole('button', { name: 'list' }).click();

  // flag the whole series
  await page.getByRole('button', { name: 'Flag Rent' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Flag Rent' });
  await dialog.getByRole('radio', { name: 'The whole series' }).click();
  await dialog.getByLabel('Note').fill('rent review due in spring');
  await dialog.getByRole('button', { name: 'Flag', exact: true }).click();

  await expect(strip(page, /rent review due in spring/)).toBeVisible();
  await expect(page.getByText('· whole series').first()).toBeVisible();

  // then flag just this occurrence — the instance note wins on that row
  await page.getByRole('button', { name: 'Edit flag on Rent' }).first().click();
  dialog = page.getByRole('dialog', { name: 'Flag Rent' });
  await dialog.getByRole('radio', { name: 'This occurrence' }).click();
  await dialog.getByLabel('Note').fill('landlord raising it this month');
  await dialog
    .getByRole('button', { name: /^(Flag|Update flag)$/ })
    .click();

  await expect(strip(page, /landlord raising it this month/)).toBeVisible();
  await expect(page.getByText('· this occurrence').first()).toBeVisible();
});
