import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed amount/income modes flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+modes-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Modes Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
}

test('a per-unit payment charges rate × units, editable per month', async ({
  page,
}) => {
  await signUp(page);

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Physio');
  await page.getByRole('button', { name: 'Per unit' }).click();
  await page.locator('#amount').fill('45');
  await page.locator('#unitName').fill('visit');
  await page.locator('#defaultUnits').fill('2');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByRole('button', { name: 'Add payment' }).click();

  // list view: 2 × €45.00 → €90.00
  await page.getByRole('button', { name: 'list' }).click();
  await expect(page.getByText('2 × €45.00').first()).toBeVisible();
  await expect(page.getByText('€90.00').first()).toBeVisible();

  // bump this month's visits to 4 → €180.00, other months stay at €90.00
  await page.getByRole('button', { name: 'Edit Physio' }).first().click();
  await page.locator('#defaultUnits').fill('4');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save changes' });
  await dialog.getByRole('radio', { name: /This month only/ }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('4 × €45.00').first()).toBeVisible();
  await expect(page.getByText('€180.00').first()).toBeVisible();
  await expect(page.getByText('2 × €45.00').first()).toBeVisible(); // later months
});

test('hourly income = rate × hours, with a per-month hours override', async ({
  page,
}) => {
  await signUp(page);

  // switch income to hourly: €30/h, 160 h/month → €4,800 default
  await page.goto('/account');
  const prefs = page.locator('section', {
    has: page.getByRole('heading', { name: 'Preferences' }),
  });
  await prefs.getByRole('button', { name: 'Per hour' }).click();
  await prefs.getByLabel(/Rate per hour/).fill('30');
  await prefs.getByLabel('Usual hours / month').fill('160');
  await prefs.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();

  // a small recurring payment so the list renders month sections
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Gym');
  await page.locator('#amount').fill('40');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByRole('button', { name: 'Add payment' }).click();

  await page.getByRole('button', { name: 'list' }).click();
  const firstMonth = page.locator('section').first();
  await expect(
    firstMonth.getByRole('button', { name: /^Income €4,800/ }),
  ).toBeVisible();

  // this month I only worked 100 h → €3,000
  await firstMonth.getByRole('button', { name: /^Income/ }).click();
  const dialog = page.getByRole('dialog', { name: /^Income for/ });
  await dialog.getByLabel('Hours worked').fill('100');
  await expect(dialog.getByText('€3,000.00 this month')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(
    firstMonth.getByRole('button', { name: /^Income €3,000/ }),
  ).toBeVisible();
});
