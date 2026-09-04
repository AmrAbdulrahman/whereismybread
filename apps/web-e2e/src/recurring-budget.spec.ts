import { expect, test } from '@playwright/test';
import { openNewBudget, openNewExpense } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the recurring-budget flow',
);

// Matches the "Groceries — Mon YYYY" disambiguation the expense form's
// budget dropdown adds once a recurring series has more than one instance.
const now = new Date();
const thisMonthLabel = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+recurbudget-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Recurring Budget Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('a recurring budget gets its own instance (and its own spend) every month', async ({
  page,
}) => {
  await signUp(page);

  // Need at least one payment so the plan list renders (an all-expenses,
  // no-payments account hits the empty-state branch instead).
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('900');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await openNewBudget(page);
  const form = page.getByRole('dialog', { name: 'New budget' });
  await form.getByLabel('Name').fill('Groceries');
  await form.getByLabel('Limit').fill('300');
  await form.getByLabel('Repeat this budget every month').check();
  await form.getByRole('button', { name: 'Create budget' }).click();

  // Materialized instances show up in both the current and next month's
  // sections, each starting out with nothing spent.
  const thisMonthRow = page
    .getByRole('group', { name: 'Groceries budget' })
    .first();
  await expect(thisMonthRow).toBeVisible();
  await expect(thisMonthRow.getByText(/0\.00\s*\/\s*.*300\.00/)).toBeVisible();

  const nextMonthRow = page
    .getByRole('group', { name: 'Groceries budget' })
    .nth(1);
  await expect(nextMonthRow).toBeVisible();
  await expect(nextMonthRow.getByText(/0\.00\s*\/\s*.*300\.00/)).toBeVisible();

  // Each instance's small pencil button opens its own edit form.
  await thisMonthRow
    .getByRole('button', { name: /Edit Groceries budget/ })
    .click();
  const editForm = page.getByRole('dialog', { name: 'Edit budget' });
  await editForm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await openNewExpense(page);
  const expenseForm = page.getByRole('dialog', { name: 'New expense' });
  await expenseForm
    .getByLabel('Budget (optional)')
    .selectOption({ label: `Groceries — ${thisMonthLabel}` });
  await expenseForm.getByLabel('Name').fill('Bread');
  await expenseForm.getByLabel('Amount').fill('50');
  await expenseForm.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // This month's instance reflects the spend — next month's stays at zero,
  // since each recurring instance tracks its own expenses independently.
  await expect(
    page
      .getByRole('group', { name: 'Groceries budget' })
      .first()
      .getByText(/50\.00\s*\/\s*.*300\.00/),
  ).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Groceries budget' })
      .nth(1)
      .getByText(/0\.00\s*\/\s*.*300\.00/),
  ).toBeVisible();
});
