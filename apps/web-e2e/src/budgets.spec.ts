import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the budgets / expenses flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+budget-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Budget Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('budgets: create month budget, add/edit/delete expense, progress tracked, shown on plan header', async ({
  page,
}) => {
  await signUp(page);

  await page.goto('/budgets');
  await expect(
    page.getByRole('heading', { name: 'No budgets yet', level: 1 }),
  ).toBeVisible();

  // Create a whole-month budget.
  await page.getByRole('button', { name: 'New budget' }).click();
  const newBudget = page.getByRole('dialog', { name: 'New budget' });
  await newBudget.getByLabel('Name').fill('Groceries');
  await newBudget.getByLabel('Limit').fill('200');
  await newBudget.getByRole('button', { name: 'Create budget' }).click();

  const card = page.getByRole('listitem').filter({ hasText: 'Groceries' });
  await expect(card).toBeVisible();
  await expect(card.getByText('month', { exact: true })).toBeVisible();
  await expect(card.getByText(/0\.00\s*spent/i)).toBeVisible();
  await expect(card.getByText(/of\s*€?200\.00/)).toBeVisible();

  // Expand → add an expense.
  await card.getByRole('button', { name: /^Groceries/ }).click();
  await expect(card.getByText('No expenses logged yet.')).toBeVisible();
  await card.getByRole('button', { name: 'Add expense' }).click();

  const newExpense = page.getByRole('dialog', { name: 'New expense' });
  await newExpense.getByLabel('Name').fill('Coffee beans');
  await newExpense.getByLabel('Amount').fill('12.50');
  await newExpense.getByRole('button', { name: 'Add expense' }).click();

  const expenseRow = card
    .getByRole('listitem')
    .filter({ hasText: 'Coffee beans' });
  await expect(expenseRow).toBeVisible();
  await expect(card.getByText(/12\.50\s*spent/i)).toBeVisible();
  await expect(card.getByText(/of\s*€?200\.00/)).toBeVisible();

  // Edit the expense's amount.
  await expenseRow.getByRole('button', { name: 'Edit Coffee beans' }).click();
  const editExpense = page.getByRole('dialog', { name: 'Edit expense' });
  await editExpense.getByLabel('Amount').fill('20');
  await editExpense.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByText(/20\.00\s*spent/i)).toBeVisible();

  // The budget shows up pinned to the sticky month header in the plan list.
  await page.goto('/plan');
  const budgetRow = page.getByRole('group', { name: 'Groceries budget' });
  await expect(budgetRow).toBeVisible();
  await expect(budgetRow.getByText(/20\.00\s*\/\s*.*200\.00/)).toBeVisible();

  // Delete the expense, then the budget.
  await page.goto('/budgets');
  const card2 = page.getByRole('listitem').filter({ hasText: 'Groceries' });
  await card2.getByRole('button', { name: /^Groceries/ }).click();
  await card2
    .getByRole('listitem')
    .filter({ hasText: 'Coffee beans' })
    .getByRole('button', { name: 'Delete Coffee beans' })
    .click();
  await page
    .getByRole('dialog', { name: 'Delete expense?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(card2.getByText('No expenses logged yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Delete Groceries' }).click();
  await page
    .getByRole('dialog', { name: 'Delete budget?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('No budgets yet')).toBeVisible();
});

test('budgets: pick a week instead of the whole month', async ({ page }) => {
  await signUp(page);

  await page.goto('/budgets');
  await page.getByRole('button', { name: 'New budget' }).click();
  const dialog = page.getByRole('dialog', { name: 'New budget' });
  await dialog.getByLabel('Name').fill('Weekend trip');
  await dialog.getByRole('button', { name: 'One week' }).click();
  // Week chips render once "One week" is selected — pick the first one.
  await dialog.locator('label:text("Week")').waitFor();
  await dialog
    .locator('button')
    .filter({ hasText: /–/ })
    .first()
    .click();
  await dialog.getByLabel('Limit').fill('80');
  await dialog.getByRole('button', { name: 'Create budget' }).click();

  const card = page.getByRole('listitem').filter({ hasText: 'Weekend trip' });
  await expect(card).toBeVisible();
  await expect(card.getByText('week', { exact: true })).toBeVisible();
});
