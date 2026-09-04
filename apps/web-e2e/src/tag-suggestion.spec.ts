import { expect, test } from '@playwright/test';
import { openNewPayment } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the tag-suggestion flow',
);

test('clicking a tag suggestion adds the full tag, not the typed draft', async ({
  page,
}) => {
  const email = `e2e+tag-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Tag Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });

  // first payment establishes an "Egypt" tag
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Flights');
  await page.getByLabel('Amount').fill('400');
  await page.getByPlaceholder('Add tags…').fill('Egypt');
  await page.getByPlaceholder('Add tags…').press('Enter');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  // second payment: type a prefix, then click the suggestion
  await openNewPayment(page);
  await page.getByLabel('Description').fill('Hotel');
  await page.getByLabel('Amount').fill('250');
  await page.getByPlaceholder('Add tags…').fill('eg');
  await page.getByRole('button', { name: 'Egypt', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Remove Egypt' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove eg', exact: true }),
  ).toHaveCount(0);
  // exactly one tag chip — the draft "eg" was not committed alongside it
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(1);
});
