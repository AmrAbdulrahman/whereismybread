import { expect, test } from '@playwright/test';
import { openNewPayment } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the plan day-collapse flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+daycollapse-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Day Collapse Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

// Day headers are toggle buttons carrying a "Wkdy D Mon" date; scope to that
// so the "Filters" and add-menu toggles don't get picked up.
const DAY = /\d{1,2}\s\w{3}/;
const dayToggle = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { expanded: true }).filter({ hasText: DAY });
const collapsedDayToggle = (page: import('@playwright/test').Page) =>
  page
    .getByRole('button', { expanded: false })
    .filter({ hasText: DAY })
    .first();

test('a plan day cycles collapsed / needs-action / expanded', async ({
  page,
}) => {
  await signUp(page);

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

  await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
  const rent = page.getByRole('button', { name: 'Edit Rent' }).first();
  const gym = page.getByRole('button', { name: 'Edit Gym' }).first();
  await expect(rent).toBeVisible();
  await expect(gym).toBeVisible();

  // Mark Rent paid — today still defaults to fully expanded, so it stays shown.
  await page
    .getByRole('button', { name: /Mark Rent paid/ })
    .first()
    .click();
  await expect(rent).toBeVisible();

  // Expanded -> collapsed: everything hides.
  await dayToggle(page).first().click();
  await expect(rent).toBeHidden();
  await expect(gym).toBeHidden();

  // Collapsed -> needs-action: only the unpaid payment shows.
  await collapsedDayToggle(page).click();
  await expect(rent).toBeHidden();
  await expect(gym).toBeVisible();

  // Needs-action -> expanded: both back.
  await dayToggle(page).first().click();
  await expect(rent).toBeVisible();
  await expect(gym).toBeVisible();

  // With every payment ticked and nothing to review, the day is marked done.
  await expect(page.getByLabel('All done')).toHaveCount(0);
  await page
    .getByRole('button', { name: /Mark Gym paid/ })
    .first()
    .click();
  await expect(page.getByLabel('All done').first()).toBeVisible();

  // Nothing needs action now, so the toggle only swaps collapsed <-> expanded
  // (no "needs-action" step). One click hides everything.
  await dayToggle(page).first().click();
  await expect(rent).toBeHidden();
  await expect(gym).toBeHidden();
  await collapsedDayToggle(page).click();
  await expect(rent).toBeVisible();
});
