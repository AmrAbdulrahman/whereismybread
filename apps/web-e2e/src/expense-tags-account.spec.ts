import { expect, test } from '@playwright/test';
import { openNewExpense } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the expense tags/account flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+exptag-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Expense Tag Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('an expense can carry a tag and an account, and the tag filters the list', async ({
  page,
}) => {
  await signUp(page);

  // Need one payment so the plan list renders (an all-expenses account hits
  // the empty-state branch instead).
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('900');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await openNewExpense(page);
  const form = page.getByRole('dialog', { name: 'New expense' });
  await form.getByLabel('Name').fill('Client lunch');
  await form.getByLabel('Amount').fill('40');

  // Create an account inline — it auto-selects on creation.
  await form.getByRole('button', { name: 'New account' }).click();
  const accountForm = page.getByRole('dialog', { name: 'New account' });
  await accountForm.getByLabel('Name').fill('Freelance');
  await accountForm.getByRole('button', { name: 'Add account' }).click();
  await expect(
    form.getByRole('button', { name: 'Freelance' }),
  ).toBeVisible();

  // Add a tag.
  await form.getByPlaceholder('Add tags…').fill('work');
  await form.getByPlaceholder('Add tags…').press('Enter');

  await form.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // The list row shows both the account and the tag.
  const row = page.getByRole('button', { name: /Client lunch/ });
  await expect(row).toBeVisible();
  await expect(row.getByText('Freelance')).toBeVisible();
  await expect(row.getByText('work')).toBeVisible();

  // A second, untagged expense.
  await openNewExpense(page);
  const form2 = page.getByRole('dialog', { name: 'New expense' });
  await form2.getByLabel('Name').fill('Groceries');
  await form2.getByLabel('Amount').fill('25');
  await form2.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'list' }).click();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: 'work', exact: true }).click();

  await expect(page.getByRole('button', { name: /Client lunch/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Groceries/ })).toHaveCount(0);
});
