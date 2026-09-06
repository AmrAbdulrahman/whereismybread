import { expect, test } from '@playwright/test';
import { openNewBudget, openNewExpense } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the list "Show" / method filters',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+listkinds-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('List Kinds Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('the "Show" filter segments planned / budgeted / unbudgeted rows', async ({
  page,
}) => {
  await signUp(page);

  // A one-time payment due today.
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('900');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  // A budget, plus one budgeted and one unbudgeted expense.
  await openNewBudget(page);
  const budgetForm = page.getByRole('dialog', { name: 'New budget' });
  await budgetForm.getByLabel('Name').fill('Groceries');
  await budgetForm.getByLabel('Limit').fill('200');
  await budgetForm.getByRole('button', { name: 'Create budget' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await openNewExpense(page);
  let expenseForm = page.getByRole('dialog', { name: 'New expense' });
  await expenseForm.getByLabel('Budget (optional)').selectOption({ label: 'Groceries' });
  await expenseForm.getByLabel('Name').fill('Bread');
  await expenseForm.getByLabel('Amount').fill('20');
  await expenseForm.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await openNewExpense(page);
  expenseForm = page.getByRole('dialog', { name: 'New expense' });
  await expenseForm.getByLabel('Name').fill('Coffee');
  await expenseForm.getByLabel('Amount').fill('4');
  await expenseForm.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'list' }).click();

  // Everything shows by default.
  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Groceries budget' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bread/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Coffee/ }).first()).toBeVisible();

  await page.getByRole('button', { name: /^Filters/ }).click();

  // "Planned" only — payment stays, budget + both expenses drop.
  await page.getByRole('button', { name: 'Planned', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Rent' }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Groceries budget' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Bread/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Coffee/ })).toHaveCount(0);

  // Swap to "Expenses (no budget)" only — just the unbudgeted expense.
  await page.getByRole('button', { name: 'Planned', exact: true }).click();
  await page
    .getByRole('button', { name: 'Expenses (no budget)', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Edit Rent' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Groceries budget' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Bread/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Coffee/ }).first()).toBeVisible();

  // "Budgeted" only — the budget line and the budgeted expense.
  await page
    .getByRole('button', { name: 'Expenses (no budget)', exact: true })
    .click();
  await page.getByRole('button', { name: 'Budgeted', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Groceries budget' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bread/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Coffee/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Rent' })).toHaveCount(0);
});
