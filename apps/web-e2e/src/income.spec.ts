import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed income flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+income-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Income Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
}

test('set a monthly income, see the risk level, override one month', async ({
  page,
}) => {
  await signUp(page);

  // set a global monthly income
  await page.goto('/account');
  const prefs = page.locator('section', {
    has: page.getByRole('heading', { name: 'Preferences' }),
  });
  await prefs.getByLabel('Monthly income').fill('3000');
  await prefs.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();

  // add a recurring payment well within budget
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('1200');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByRole('button', { name: 'Add payment' }).click();

  // list view shows the income line and an "On track" risk label
  await page.getByRole('button', { name: 'list' }).click();
  const firstMonth = page.locator('section').first();
  await expect(
    firstMonth.getByRole('button', { name: /^Income €3,000/ }),
  ).toBeVisible();
  await expect(firstMonth.getByText('On track')).toBeVisible();

  // override the first month's income down so it runs tight
  await firstMonth.getByRole('button', { name: /^Income/ }).click();
  const dialog = page.getByRole('dialog', { name: /^Income for/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Take-home this month/).fill('1300');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(
    firstMonth.getByRole('button', { name: /^Income €1,300.*custom/ }),
  ).toBeVisible();
  await expect(firstMonth.getByText('Running tight')).toBeVisible();

  // and reset it back to the default
  await firstMonth.getByRole('button', { name: /^Income/ }).click();
  await page
    .getByRole('dialog', { name: /^Income for/ })
    .getByRole('button', { name: 'Reset to default' })
    .click();
  await expect(
    firstMonth.getByRole('button', { name: /^Income €3,000/ }),
  ).toBeVisible();
});
