import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the scoped edit/delete flow',
);

/** First-of-month, `offset` months from now, as `YYYY-MM`. */
function isoMonth(offset: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
}

async function signUp(page: Page) {
  const email = `e2e+scope-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Scope Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
}

/** A monthly Gym payment starting this month (day-of-month defaults to today). */
async function addGym(page: Page) {
  await page.getByRole('button', { name: /Add a payment|New payment/ }).click();
  await page.getByLabel('Description').fill('Gym');
  await page.getByLabel('Amount').fill('30');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Description')).toBeHidden();
}

async function openGymEditor(page: Page) {
  await page.getByRole('button').filter({ hasText: 'Gym' }).first().click();
  await page.getByRole('button', { name: 'Edit Gym' }).click();
}

/** Drive the confirmation modal that follows a Save / Delete click. */
async function confirm(
  page: Page,
  button: 'Save changes' | 'Delete',
  scope?: 'This month only' | 'This and following months',
) {
  const dialog = page.getByRole('dialog', {
    name: button === 'Delete' ? /^Delete/ : 'Save changes',
  });
  if (scope) {
    await dialog.getByRole('radio', { name: new RegExp(scope) }).click();
  }
  await dialog.getByRole('button', { name: button }).click();
}

test('"this & following" delete removes the payment from that month on, keeps earlier months', async ({
  page,
}) => {
  await signUp(page);
  const start = isoMonth(0);
  const cutoff = isoMonth(2);

  await addGym(page);

  await page.goto(`/plan?view=calendar&month=${start}`);
  await expect(page.getByText('Gym').first()).toBeVisible();
  await page.goto(`/plan?view=calendar&month=${cutoff}`);
  await expect(page.getByText('Gym').first()).toBeVisible();

  await openGymEditor(page);
  await page
    .getByRole('button', { name: /^Delete (payment|subscription)$/ })
    .click();
  await confirm(page, 'Delete', 'This and following months');

  await expect(page.getByText('Gym')).toHaveCount(0);
  // the starting month still has it
  await page.goto(`/plan?view=calendar&month=${start}`);
  await expect(page.getByText('Gym').first()).toBeVisible();
});

test('"this month only" delete skips just that occurrence', async ({
  page,
}) => {
  await signUp(page);
  const future = isoMonth(1);

  await addGym(page);

  await page.goto(`/plan?view=calendar&month=${future}`);
  await expect(page.getByText('Gym').first()).toBeVisible();

  await openGymEditor(page);
  await page
    .getByRole('button', { name: /^Delete (payment|subscription)$/ })
    .click();
  await confirm(page, 'Delete', 'This month only');

  await expect(page.getByRole('button', { name: 'Restore Gym' })).toBeVisible();

  await page.goto(`/plan?view=calendar&month=${isoMonth(2)}`);
  await page.getByRole('button').filter({ hasText: 'Gym' }).first().click();
  await expect(page.getByRole('button', { name: 'Edit Gym' })).toBeVisible();
});

test('"this month only" edit overrides just that month, not the series', async ({
  page,
}) => {
  await signUp(page);
  const future = isoMonth(1);
  const later = isoMonth(2);

  await addGym(page);

  await page.goto(`/plan?view=calendar&month=${future}`);
  await openGymEditor(page);
  await page.getByLabel('Amount').fill('99');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await confirm(page, 'Save changes', 'This month only');
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.getByRole('button').filter({ hasText: 'Gym' }).first().click();
  await expect(page.getByText('€99.00').first()).toBeVisible();
  await expect(page.getByText('Edited').first()).toBeVisible();

  // the month after is untouched at €30
  await page.goto(`/plan?view=calendar&month=${later}`);
  await page.getByRole('button').filter({ hasText: 'Gym' }).first().click();
  await expect(page.getByText('€30.00').first()).toBeVisible();

  // reset the override → back to €30
  await page.goto(`/plan?view=calendar&month=${future}`);
  await openGymEditor(page);
  await page
    .getByRole('button', { name: 'Reset this month’s changes' })
    .click();
  await expect(page.getByLabel('Amount')).toBeHidden();
  await page.getByRole('button').filter({ hasText: 'Gym' }).first().click();
  await expect(page.getByText('€30.00').first()).toBeVisible();
});
