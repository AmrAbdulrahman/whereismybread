import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the checklist flow',
);

async function signUp(page: Page) {
  const email = `e2e+checklist-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Checklist Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

async function addMonthly(
  page: Page,
  name: string,
  amount: string,
  method: 'Manual transfer' | 'Direct debit',
) {
  await page
    .getByRole('button', { name: /^(Add a payment|New payment)$/ })
    .click();
  const form = page.getByRole('dialog', { name: 'New payment' });
  await form.getByLabel('Description').fill(name);
  await form.getByLabel('Amount').fill(amount);
  await form.getByRole('button', { name: 'Monthly', exact: true }).click();
  await form.getByLabel('Day of the month').fill('7');
  await form.getByRole('button', { name: method }).click();
  await form.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'New payment' })).toBeVisible();
}

test('checklist shows manual payments month-by-month, current month open', async ({
  page,
}) => {
  await signUp(page);
  await addMonthly(page, 'Cleaner', '60', 'Manual transfer');
  await addMonthly(page, 'Broadband', '35', 'Direct debit');

  await page.goto('/checklist');
  await expect(
    page.getByRole('heading', { name: 'Manual transfers', level: 1 }),
  ).toBeVisible();

  // the current month is expanded and lists the manual payment
  const current = page.getByRole('button', { name: /This month/ });
  await expect(current).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('button', { name: 'Mark Cleaner paid' }),
  ).toBeVisible();

  // the direct debit is filtered out entirely
  await expect(page.getByText('Broadband')).toHaveCount(0);

  // ticking it updates the month's progress
  await expect(current).toContainText('0/1 done');
  await page.getByRole('button', { name: 'Mark Cleaner paid' }).click();
  await expect(current).toContainText('1/1 done', { timeout: 12_000 });

  // collapsing hides the items; expanding brings them back
  await current.click();
  await expect(current).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('button', { name: 'Mark Cleaner unpaid' }),
  ).toBeHidden();
  await current.click();
  await expect(
    page.getByRole('button', { name: 'Mark Cleaner unpaid' }),
  ).toBeVisible();
});
