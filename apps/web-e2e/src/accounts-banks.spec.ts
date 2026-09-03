import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the accounts / banks management flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+acctbank-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Acct Bank');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('accounts: list, add, dedupe, rename, count, delete', async ({ page }) => {
  await signUp(page);

  await page.goto('/accounts');
  await expect(
    page.getByRole('heading', { name: 'Accounts', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('No accounts yet.')).toBeVisible();

  await page.getByRole('button', { name: 'New account' }).click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await dialog.getByLabel('Name').fill('Utilities');
  await dialog.getByRole('button', { name: 'Add account' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Utilities' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Not used yet')).toBeVisible();

  // duplicate rejected
  await page.getByRole('button', { name: 'New account' }).click();
  await page
    .getByRole('dialog', { name: 'New account' })
    .getByLabel('Name')
    .fill('utilities');
  await page
    .getByRole('dialog', { name: 'New account' })
    .getByRole('button', { name: 'Add account' })
    .click();
  await expect(
    page.getByText('You already have an account with that name'),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'New account' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  // rename
  await page.getByRole('button', { name: 'Edit Utilities' }).click();
  await page
    .getByRole('dialog', { name: 'Edit account' })
    .getByLabel('Name')
    .fill('Household bills');
  await page
    .getByRole('dialog', { name: 'Edit account' })
    .getByRole('button', { name: 'Save changes' })
    .click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Household bills' }),
  ).toBeVisible();

  // attach to a payment → count reflects it
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Water');
  await page.getByLabel('Amount').fill('45');
  await page
    .getByRole('button', { name: 'Household bills', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.goto('/accounts');
  await expect(page.getByText('Used in 1 payment')).toBeVisible();

  // a referenced account → confirmation modal with the usage count + unlink note
  await page.getByRole('button', { name: 'Delete Household bills' }).click();
  const del = page.getByRole('dialog', { name: 'Delete account?' });
  await expect(del.getByText(/used by\s*1\s*payment/)).toBeVisible();
  await expect(del.getByText(/won't have an account/)).toBeVisible();
  await del.getByRole('button', { name: 'Delete anyway' }).click();
  await expect(page.getByText('No accounts yet.')).toBeVisible();
  await page.goto('/plan');
  await page.getByRole('button', { name: 'list' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Water' }).first(),
  ).toBeVisible();
});

test('banks: add and delete', async ({ page }) => {
  await signUp(page);

  await page.goto('/banks');
  await expect(
    page.getByRole('heading', { name: 'Banks', level: 1 }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New bank' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bank' });
  await dialog.getByLabel('Name').fill('Monzo');
  await dialog.getByRole('button', { name: 'Add bank' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Monzo' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Delete Monzo' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Monzo' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('No banks yet.')).toBeVisible();
});
