import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the plan-page budget/expense entry points',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+planbe-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Plan Budget Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('budgets and expenses can be added from the plan page, and roll into the month totals correctly', async ({
  page,
}) => {
  await signUp(page);

  // A one-time payment due today, so it's in scope.
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('100');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  // "Add budget" sits next to "New payment".
  await page.getByRole('button', { name: /add budget|^budget$/i }).click();
  const newBudget = page.getByRole('dialog', { name: 'New budget' });
  await newBudget.getByLabel('Name').fill('Groceries');
  await newBudget.getByLabel('Limit').fill('200');
  await newBudget.getByRole('button', { name: 'Create budget' }).click();

  // It shows pinned at the top of the month, tagged "Budget", no checkbox.
  const budgetRow = page.getByRole('button', { name: /Groceries.*Budget/s });
  await expect(budgetRow).toBeVisible();
  await expect(budgetRow.getByText('Budget', { exact: true })).toBeVisible();
  await expect(budgetRow.getByText('200.00')).toBeVisible();

  // "Add expense" also sits next to "New payment" — unbudgeted by default.
  await page.getByRole('button', { name: /add expense|^expense$/i }).click();
  const newExpense = page.getByRole('dialog', { name: 'New expense' });
  await newExpense.getByLabel('Name').fill('Coffee');
  await newExpense.getByLabel('Amount').fill('10');
  await newExpense.getByRole('button', { name: 'Add expense' }).click();

  const coffeeRow = page.getByRole('button', { name: /Coffee/ });
  await expect(coffeeRow).toBeVisible();

  // Rent (100) + Groceries reserved (200) + unbudgeted Coffee (10) = 310,
  // shown as the month's total in its sticky header.
  await expect(page.getByText(/310\.00/).first()).toBeVisible();

  // A day separator's own "+ expense" quick-add prefills that day's date.
  const today = new Date().toISOString().slice(0, 10);
  await page.getByRole('button', { name: '+ expense' }).first().click();
  const secondExpense = page.getByRole('dialog', { name: 'New expense' });
  await expect(secondExpense.getByLabel('Date')).toHaveValue(today);
  await secondExpense
    .getByLabel('Budget (optional)')
    .selectOption({ label: 'Groceries' });
  await secondExpense.getByLabel('Name').fill('Wine');
  await secondExpense.getByLabel('Amount').fill('15');
  await secondExpense.getByRole('button', { name: 'Add expense' }).click();

  // Wine shows, tagged with its budget — but doesn't add to the total, since
  // Groceries' reserved amount already counts it.
  const wineRow = page.getByRole('button', { name: /Wine/ });
  await expect(wineRow).toBeVisible();
  await expect(wineRow.getByText('Groceries')).toBeVisible();
  await expect(page.getByText(/310\.00/).first()).toBeVisible();
  await expect(page.getByText(/325\.00/)).toBeHidden();

  // Editing an expense offers to delete it; deleting drops it from the total.
  await coffeeRow.click();
  await page
    .getByRole('dialog', { name: 'Edit expense' })
    .getByRole('button', { name: 'Delete expense' })
    .click();
  await page
    .getByRole('dialog', { name: 'Delete expense?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('button', { name: /Coffee/ })).toBeHidden();
  await expect(page.getByText(/300\.00/).first()).toBeVisible();
});
