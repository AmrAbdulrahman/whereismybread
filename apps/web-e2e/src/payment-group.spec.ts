import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed payment-group flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+group-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Group Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
}

test('a group payment sums its records and can be overridden per month', async ({
  page,
}) => {
  await signUp(page);

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Streaming');
  await page.getByRole('button', { name: 'Group', exact: true }).click();

  // two records, same currency → an exact sum (no FX rate needed)
  await page.getByRole('button', { name: 'Add a record' }).click();
  await page.getByLabel('Record 1 name').fill('Netflix');
  await page.locator('#li-value-0').fill('12.99');

  await page.getByRole('button', { name: 'Add a record' }).click();
  await page.getByLabel('Record 2 name').fill('Spotify');
  await page.locator('#li-value-1').fill('11.00');

  // live total in the editor
  await expect(page.getByText('€23.99')).toBeVisible();

  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByRole('button', { name: 'Add payment' }).click();

  // list view: the occurrence shows the summed charge and a records chip
  await page.getByRole('button', { name: 'list' }).click();
  await expect(page.getByText('€23.99').first()).toBeVisible();

  const chip = page.getByRole('button', { name: '2 records' }).first();
  await chip.click();
  await expect(page.getByText('Netflix')).toBeVisible();
  await expect(page.getByText('Spotify')).toBeVisible();

  // bump one record for this month only → new total, later months unchanged
  await page.getByRole('button', { name: 'Edit Streaming' }).first().click();
  await page.locator('#li-value-0').fill('15.99');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save changes' });
  await dialog.getByRole('radio', { name: /This month only/ }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('€26.99').first()).toBeVisible();
  await expect(page.getByText('€23.99').first()).toBeVisible(); // later months
});
