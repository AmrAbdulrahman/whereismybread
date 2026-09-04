import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the annual-payment day/month flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+annual-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Annual Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

// Pick months relative to "now" that are guaranteed to land inside the
// board's default ~3-month window (an annual date far from today wouldn't
// show up in the list without scrolling further out).
const now = new Date();
const monthOffset = (n: number) =>
  String(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 1)).getUTCMonth() + 1);
const firstMonth = monthOffset(1);
const secondMonth = monthOffset(2);

test('an annual payment lets you pick which day and month it lands on, and keeps it on edit', async ({
  page,
}) => {
  await signUp(page);

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Home insurance');
  await page.getByLabel('Amount').fill('300');
  await page.getByRole('button', { name: 'Annual', exact: true }).click();

  // Picking "Annual" reveals a Month select alongside the day field.
  const month = page.getByLabel('Month', { exact: true });
  await expect(month).toBeVisible();
  await month.selectOption(firstMonth);
  await page.getByLabel('Day of the month').fill('15');
  await page.getByRole('button', { name: 'Add payment' }).click();

  await page.getByRole('button', { name: 'list' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Home insurance' }).first(),
  ).toBeVisible();

  // Reopen — the chosen month/day round-trip.
  await page
    .getByRole('button', { name: 'Edit Home insurance' })
    .first()
    .click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    firstMonth,
  );
  await expect(page.getByLabel('Day of the month')).toHaveValue('15');

  // Change the month and save — a recurring payment always confirms its
  // scope (default: this & following).
  await page.getByLabel('Month', { exact: true }).selectOption(secondMonth);
  await page.getByRole('button', { name: 'Save changes' }).click();
  const confirmDialog = page.getByRole('dialog', { name: 'Save changes' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Save changes' }).click();
  // The sheet closing only proves the client-side mutation resolved, not
  // that the server-driven route refresh (from the action's revalidatePath)
  // has landed yet — reopening immediately can race it and reload stale
  // data. A full navigation always reads the current DB state.
  await expect(confirmDialog).toBeHidden();
  await page.reload();

  await page.getByRole('button', { name: 'list' }).click();
  await page
    .getByRole('button', { name: 'Edit Home insurance' })
    .first()
    .click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    secondMonth,
  );
  await expect(page.getByLabel('Day of the month')).toHaveValue('15');
});
