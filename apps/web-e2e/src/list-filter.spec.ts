import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed list filter flow',
);

test('the list view search + day total span currencies', async ({ page }) => {
  const email = `e2e+filter-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Filter Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });

  // two monthly payments on the same day, in different currencies
  const addMonthly = async (
    name: string,
    amount: string,
    currency: string,
    account?: string,
  ) => {
    await page
      .getByRole('button', { name: /^(Add a payment|New payment)$/ })
      .click();
    await page.getByRole('button', { name: 'Monthly', exact: true }).click();
    await page.getByLabel('Description').fill(name);
    await page.getByLabel('Amount').fill(amount);
    await page.getByRole('button', { name: /▾$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose currency' });
    await dialog.getByPlaceholder('Search currencies…').fill(currency);
    await dialog
      .getByRole('button', { name: new RegExp(`\\b${currency}\\b`) })
      .first()
      .click();
    if (account) {
      await page.getByRole('button', { name: 'New account' }).click();
      await page.getByLabel('Name').fill(account);
      await page.getByRole('button', { name: 'Add account' }).click();
      await expect(
        page.getByRole('button', { name: account, exact: true }),
      ).toBeVisible();
    }
    await page.getByLabel('Day of the month').fill('12');
    await page.getByRole('button', { name: 'Add payment' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  };

  await addMonthly('Rent', '1000', 'EUR', 'Home');
  await addMonthly('Gym membership', '150', 'GBP');

  await page.getByRole('button', { name: 'list' }).click();

  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit Gym membership' }).first(),
  ).toBeVisible();

  // Both recurring payments land on the same day of every month, so a month's
  // one day group carries the whole month. The day total must span both
  // currencies — €1000 + (£150 ≈ €150–200) — never just one of them (which
  // would read €1,000.00, or ~€175 for the GBP row alone).
  await expect(page.getByText(/€1,1\d\d\.\d\d/).first()).toBeVisible();

  // free-text search narrows to the matching payment
  await page.getByLabel('Search payments').fill('gym');
  await expect(
    page.getByRole('button', { name: 'Edit Gym membership' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Rent' })).toHaveCount(0);

  // clearing brings everything back
  await page.getByRole('button', { name: /Clear filter/ }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();

  // the account filter (in the collapsible panel) narrows to Rent
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit Gym membership' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: /Clear filter/ }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Gym membership' }).first(),
  ).toBeVisible();
});
