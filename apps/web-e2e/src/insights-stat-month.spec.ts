import { expect, test, type Page } from '@playwright/test';
import { openNewExpense, openNewPayment } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the insights stat month-scoping check',
);

async function signUp(page: Page) {
  const email = `e2e+statmonth-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Stat Month');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

function ym(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

test('a single-value stat only counts the selected month', async ({ page }) => {
  await signUp(page);

  const today = new Date();
  const thisMonthDate = `${ym(today)}-05`;
  const lastMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 12),
  );

  const addExpense = async (name: string, amount: string, date: string) => {
    await openNewExpense(page);
    const form = page.getByRole('dialog', { name: 'New expense' });
    await form.getByLabel('Name').fill(name);
    await form.getByLabel('Amount').fill(amount);
    await form.getByLabel('Date').fill(date);
    await form.getByRole('button', { name: 'Add expense' }).click();
    await expect(form).toBeHidden();
  };

  // A one-time payment (this month) + a this-month and a last-month expense.
  await openNewPayment(page);
  await page.getByLabel('Description').fill('Licence');
  await page.getByLabel('Amount').fill('40');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await addExpense('This month coffee', '50', thisMonthDate);
  await addExpense('Last month rent', '200', `${ym(lastMonth)}-12`);

  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible({
    timeout: 20_000,
  });

  // Plain "Total" stat, no filter, comparing to the previous month.
  await page.getByRole('button', { name: 'Add stat' }).click();
  const builder = page.getByRole('dialog', { name: 'New stat' });
  await builder.getByLabel('Title').fill('All spend');
  await builder.getByRole('button', { name: 'Total', exact: true }).click();
  await builder.getByRole('checkbox', { name: /previous month/i }).check();
  await builder.getByRole('button', { name: 'Add stat' }).click();
  await expect(builder).toBeHidden();

  const tile = page
    .locator('div', { has: page.getByText('All spend') })
    .filter({ hasText: /Total ·/ })
    .last();

  // This month: €50 coffee + €40 payment = €90 (2 items). The compare line
  // must read against last month's €200 — a €110 drop — not mix months.
  await expect(tile).toContainText('€90.00');
  await expect(tile).toContainText('2 items');
  await expect(tile).toContainText('€110.00');
  await expect(tile).toContainText('vs last month');

  // Step to last month → €200, 1 item.
  const monthHeading = page.locator('span', { hasText: /^\w+ \d{4}$/ }).first();
  const label = (await monthHeading.textContent())?.trim();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(monthHeading).not.toHaveText(label ?? '');
  await expect(tile).toContainText('€200.00');
  await expect(tile).toContainText('1 item');
  await expect(tile).not.toContainText('€90.00');
});
