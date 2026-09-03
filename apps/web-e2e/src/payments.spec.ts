import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed payments flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+pay-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Pay Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
}

test('create a recurring payment, see it, mark it paid, edit it', async ({
  page,
}) => {
  await signUp(page);

  // a brand-new account has no payments — the calendar shows just the CTA
  await expect(
    page.getByRole('heading', { name: 'Nothing planned yet' }),
  ).toBeVisible();

  // create
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('1450');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByRole('button', { name: 'Direct debit' }).click();

  // the Bank field is always shown — add one on the fly and pick it
  await expect(page.getByText('Bank', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New bank' }).click();
  await page.getByLabel('Name').fill('Monzo');
  await page.getByRole('button', { name: 'Add bank' }).click();
  await expect(page.getByRole('button', { name: 'Monzo' })).toBeVisible();

  // recurring payments show a Provider field (no subscription toggle any more)
  await page.getByLabel('Provider').fill('https://provider.invalid');
  await page.getByLabel('Notes (optional)').fill('Paid to the letting agent');

  await page.getByPlaceholder('Add tags…').fill('Home');
  await page.getByPlaceholder('Add tags…').press('Enter');
  await page.getByRole('button', { name: 'Add payment' }).click();

  // list view shows it, grouped
  await page.getByRole('button', { name: 'list' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Rent' }).first(),
  ).toBeVisible();
  await expect(page.getByText('€1,450.00').first()).toBeVisible();

  // mark paid
  await page
    .getByRole('button', { name: /Mark Rent paid/ })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: /Mark Rent unpaid/ }).first(),
  ).toBeVisible();

  // edit — the pencil opens the form pre-filled
  await page.getByRole('button', { name: 'Edit Rent' }).first().click();
  const amount = page.getByLabel('Amount');
  await expect(amount).toHaveValue('1450.00');
  await expect(page.getByLabel('Notes (optional)')).toHaveValue(
    'Paid to the letting agent',
  );
  await expect(page.getByLabel('Provider')).toHaveValue(
    'https://provider.invalid',
  );
  await amount.fill('1500');
  await page.getByRole('button', { name: 'Save changes' }).click();
  // recurring payment → confirm the scope (default: this & following)
  await page
    .getByRole('dialog', { name: 'Save changes' })
    .getByRole('button', { name: 'Save changes' })
    .click();
  await expect(page.getByText('€1,500.00').first()).toBeVisible();
});
