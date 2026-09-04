import { expect, test } from '@playwright/test';
import { openNewPayment } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the unpaid-only list toggle flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+unpaid-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Unpaid Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('the "Unpaid only" toggle hides paid payments and drops days left empty', async ({
  page,
}) => {
  await signUp(page);

  // Two payments due today.
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('900');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await openNewPayment(page);
  await page.getByLabel('Description').fill('Gym');
  await page.getByLabel('Amount').fill('30');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.getByRole('button', { name: 'list' }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Gym' }).first()).toBeVisible();

  // Mark Rent paid.
  await page
    .getByRole('button', { name: /Mark Rent paid/ })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: /Mark Rent unpaid/ }).first(),
  ).toBeVisible();

  // Flip the toggle — Rent (now paid) disappears, Gym (still unpaid) stays.
  await page.getByRole('switch', { name: 'Unpaid only' }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Gym' }).first()).toBeVisible();

  // Flip it back — both show again.
  await page.getByRole('switch', { name: 'Unpaid only' }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Gym' }).first()).toBeVisible();

  // Mark both paid — with the toggle on, today's whole day section (now
  // empty of anything unpaid) drops out entirely, not just its items.
  await page
    .getByRole('button', { name: /Mark Gym paid/ })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: /Mark Gym unpaid/ }).first(),
  ).toBeVisible();
  await page.getByRole('switch', { name: 'Unpaid only' }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Gym' })).toHaveCount(0);
  await expect(page.getByText('Nothing scheduled')).toBeVisible();
});
