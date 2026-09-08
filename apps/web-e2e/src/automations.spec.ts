import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the automations flow',
);

function todayDmy(): string {
  const d = new Date();
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}
const T = todayDmy();

const WISE_CSV = `"TransferWise ID","Date","Date Time","Amount","Currency","Description","Running Balance"
"A-1","${T}","${T} 09:30:00.000","-12.50","GBP","Tesco","487.50"
"A-2","${T}","${T} 00:00:00.000","1000.00","GBP","Salary from Acme","1487.50"
"A-3","${T}","${T} 14:07:41.512","-4.20","GBP","Pret coffee","1483.30"`;

async function signUp(page: Page) {
  const email = `e2e+auto-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Automation Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('an "ignore small coffees" rule auto-ignores a matching import and notifies', async ({
  page,
}) => {
  await signUp(page);

  await page.goto('/automations');
  await page.getByRole('button', { name: 'New automation' }).click();

  const dialog = page.getByRole('dialog', { name: 'New automation' });
  await dialog.getByLabel('Name').fill('Ignore small coffees');

  // Pattern 1: merchant name contains "Pret" (text field defaults to "contains").
  await dialog
    .getByLabel('Pattern field')
    .first()
    .selectOption({ label: 'Merchant name' });
  await dialog.getByLabel('Value').first().fill('Pret');

  // Pattern 2: amount is less than 5.
  await dialog.getByRole('button', { name: '+ Pattern' }).click();
  await dialog
    .getByLabel('Pattern field')
    .nth(1)
    .selectOption({ label: 'Amount' });
  await dialog.getByLabel('Condition').nth(1).selectOption({ label: 'is less than' });
  await dialog.getByLabel('Value').nth(1).fill('5');

  // Actions: ignore + notify (in-app only, templated message).
  await dialog.getByLabel('Action').first().selectOption({ label: 'Ignore the expense' });
  await dialog.getByRole('button', { name: '+ Action' }).click();
  await dialog.getByLabel('Action').nth(1).selectOption({ label: 'Send a notification' });
  await dialog
    .getByLabel('Notification channel')
    .selectOption({ label: 'In-app only' });
  await dialog
    .getByLabel('Notification message')
    .fill('Skipped <title> for <amount>');

  await dialog.getByRole('button', { name: 'Create automation' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Ignore small coffees')).toBeVisible();

  // Import a statement — "Pret coffee" (£4.20) should be swept, the rest stay.
  await page.goto('/integrations');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wise.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(WISE_CSV),
  });

  await expect(page.getByText('Needs review (2)')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Salary from Acme')).toBeVisible();
  await expect(page.getByText('Tesco')).toBeVisible();
  await expect(page.getByText('Pret coffee')).toHaveCount(0);

  // The notify action left a templated in-app note.
  await page.goto('/notifications');
  await expect(
    page.getByText('Ignore small coffees', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Skipped Pret coffee for .*4\.20/),
  ).toBeVisible();
});

const AUJLA_CSV = `"TransferWise ID","Date","Date Time","Amount","Currency","Description","Running Balance"
"B-1","${T}","${T} 12:00:00.000","-18.40","GBP","Card payment to Aujla Superstore","200.00"
"B-2","${T}","${T} 09:00:00.000","-9.00","GBP","Boots","191.00"`;

test('an enrich rule stamps title + tags, inherited into the triage form', async ({
  page,
}) => {
  await signUp(page);

  await page.goto('/automations');
  await page.getByRole('button', { name: 'New automation' }).click();
  const dialog = page.getByRole('dialog', { name: 'New automation' });
  await dialog.getByLabel('Name').fill('Tidy up the corner shop');

  await dialog
    .getByLabel('Pattern field')
    .first()
    .selectOption({ label: 'Merchant name' });
  await dialog.getByLabel('Value').first().fill('Aujla');

  // Action 1: set the title.
  await dialog.getByLabel('Action').first().selectOption({ label: 'Set the title' });
  await dialog.getByLabel('New title', { exact: true }).fill('Corner Shop');
  // Action 2: set tags (autocomplete tag input).
  await dialog.getByRole('button', { name: '+ Action' }).click();
  await dialog.getByLabel('Action').nth(1).selectOption({ label: 'Set tags' });
  await dialog.getByPlaceholder('Add tags…').fill('groceries');
  await dialog.getByPlaceholder('Add tags…').press('Enter');

  await dialog.getByRole('button', { name: 'Create automation' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/integrations');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wise.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(AUJLA_CSV),
  });

  // The row is renamed and chipped, still pending.
  await expect(page.getByText('Needs review (2)')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Corner Shop')).toBeVisible();
  await expect(page.getByText('groceries')).toBeVisible();

  // Triage it — the expense form inherits the title + tag.
  await page
    .getByRole('button', { name: 'Log as expense' })
    .first()
    .click();
  const form = page.getByRole('dialog', { name: 'New expense' });
  await expect(form.getByLabel('Name')).toHaveValue('Corner Shop');
  await expect(form.getByText('groceries')).toBeVisible();
});

test('the "edit details" modal stamps a review transaction by hand', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/integrations');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wise.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(AUJLA_CSV),
  });
  await expect(page.getByText('Needs review (2)')).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Edit details' }).first().click();
  const modal = page.getByRole('dialog', { name: 'Edit details' });
  await modal.getByLabel('Title').fill('Renamed Shop');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Renamed Shop')).toBeVisible();
});

test('"log it as expense" applies its own templated title', async ({ page }) => {
  await signUp(page);

  await page.goto('/automations');
  await page.getByRole('button', { name: 'New automation' }).click();
  const dialog = page.getByRole('dialog', { name: 'New automation' });
  await dialog.getByLabel('Name').fill('Auto-file the shop');

  await dialog
    .getByLabel('Pattern field')
    .first()
    .selectOption({ label: 'Merchant name' });
  await dialog.getByLabel('Value').first().fill('Aujla');

  await dialog
    .getByLabel('Action')
    .first()
    .selectOption({ label: 'Log it as an expense' });
  await dialog.getByLabel('Title', { exact: true }).fill('<title> (auto)');

  await dialog.getByRole('button', { name: 'Create automation' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/integrations');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wise.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(AUJLA_CSV),
  });

  // Aujla is auto-filed (only Boots left to review); the expense keeps the
  // templated title and shows on the plan.
  await expect(page.getByText('Needs review (1)')).toBeVisible({
    timeout: 15_000,
  });
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Aujla Superstore \(auto\)/ }),
  ).toBeVisible();
});
