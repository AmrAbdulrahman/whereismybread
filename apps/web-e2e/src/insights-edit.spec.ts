import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the insights edit-in-place flow',
);

async function signUp(page: Page) {
  const email = `e2e+insedit-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Insights Editor');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('a payment row in an insight card opens its edit modal on /insights', async ({
  page,
}) => {
  await signUp(page);

  // A big one-time charge due today → lands in "Big charges soon".
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('New laptop');
  await page.getByLabel('Amount').fill('900');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.goto('/insights');
  await expect(page.getByText('Big charges soon')).toBeVisible({
    timeout: 20_000,
  });

  // The row is a button now, not a link to /plan.
  await page
    .getByRole('button', { name: /New laptop/ })
    .first()
    .click();

  const dialog = page.getByRole('dialog', { name: 'Edit payment' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Description')).toHaveValue('New laptop');
  // Never navigated away.
  await expect(page).toHaveURL(/\/insights/);

  // Editing from here writes through and the card reflects it.
  await dialog.getByLabel('Description').fill('Refurb laptop');
  await dialog
    .getByRole('button', { name: /^(Save changes|Add payment)$/ })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: /Refurb laptop/ }).first(),
  ).toBeVisible();
});
