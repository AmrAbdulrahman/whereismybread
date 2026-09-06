import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the statement-import flow',
);

// Dates near "now" so they land in the plan's default window. The runner's
// clock is fixed well after these, so they're recent-past transactions.
function isoDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

const WISE_CSV = `"TransferWise ID","Date","Date Time","Amount","Currency","Description","Running Balance"
"T-1","${isoDay(3)}","${isoDay(3)} 09:30:00.000","-12.50","GBP","Tesco","487.50"
"T-2","${isoDay(2)}","${isoDay(2)} 00:00:00.000","1000.00","GBP","Salary from Acme","1487.50"
"T-3","${isoDay(1)}","${isoDay(1)} 14:07:41.512","-4.20","GBP","Pret coffee","1483.30"`;

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+statement-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Statement Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

async function upload(page: import('@playwright/test').Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wise.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(WISE_CSV),
  });
}

test('uploading a statement pulls in new transactions and dedups a re-upload', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/transactions');

  await upload(page);

  await expect(page.getByText('Needs review (3)')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Pret coffee')).toBeVisible();
  await expect(page.getByText('Salary from Acme')).toBeVisible();

  // Rows are most-recent-first, so "Pret coffee" (yesterday) is the first row.
  await page.getByRole('button', { name: 'Log as expense' }).first().click();

  const expenseForm = page.getByRole('dialog', { name: 'New expense' });
  await expect(expenseForm.getByLabel('Name')).toHaveValue('Pret coffee');
  await expenseForm.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await expect(page.getByText('Needs review (2)')).toBeVisible();

  // Re-uploading the same statement adds nothing.
  await upload(page);
  await expect(page.getByText('Needs review (2)')).toBeVisible();
  await expect(page.getByText('Needs review (3)')).toHaveCount(0);

  // The expense logged from the transaction carries its CSV time (14:07).
  await page.goto('/plan');
  await page.getByRole('button', { name: 'list' }).click();
  const coffee = page.getByRole('button', { name: /Pret coffee/ });
  await expect(coffee).toBeVisible();
  await expect(coffee.getByText('14:07')).toBeVisible();

  // The two still-pending transactions show per-day in the plan, flagged for
  // review, and never counted — their day headers carry a "to review" badge.
  await expect(page.getByText(/\d+ to review/).first()).toBeVisible();
  await expect(page.getByText('Salary from Acme')).toBeVisible();
});
