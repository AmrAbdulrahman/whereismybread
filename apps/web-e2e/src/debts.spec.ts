import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the debts flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+debt-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Debt Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

test('debts: create, repay, settle, and view via the OTP shared page', async ({
  page,
  browser,
}) => {
  await signUp(page);

  const personEmail = `sarah-${Date.now()}@example.com`;

  await page.goto('/debts');
  await expect(
    page.getByRole('heading', { name: 'No debts tracked yet' }),
  ).toBeVisible();

  // New debt → add a person on the fly.
  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();

  const personModal = page.getByRole('dialog', { name: 'New person' });
  await personModal.getByLabel('Name').fill('Sarah Cole');
  await personModal.getByLabel('Email').fill(personEmail);
  await personModal.getByRole('button', { name: 'Add person' }).click();

  // Back on the debt form.
  await modal.getByRole('button', { name: 'They owe me' }).click();
  await modal.getByLabel('Amount').fill('120');
  await modal.getByLabel("What's it for?").fill('Concert tickets');
  await modal.getByRole('button', { name: 'Create debt' }).click();

  // Landed on the detail page.
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole('heading', { name: 'Sarah Cole owes you' }),
  ).toBeVisible();
  await expect(page.getByText(/€0\.00 repaid of €120\.00/)).toBeVisible();

  // Grab the transparency link.
  const shareUrl = await page
    .getByLabel('Shared debt link')
    .inputValue();
  expect(shareUrl).toMatch(/\/d\/[0-9a-f-]{36}$/);

  // Record a €50 repayment.
  await page.getByRole('button', { name: 'Record repayment' }).click();
  const repay = page.getByRole('dialog', { name: 'Record a repayment' });
  await repay.getByLabel(/^Amount/).fill('50');
  await repay.getByRole('button', { name: 'Record repayment' }).click();

  await expect(page.getByText(/€50\.00 repaid of €120\.00/)).toBeVisible();

  // Settle in full.
  await page.getByRole('button', { name: 'Settle in full' }).click();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await expect(page.getByText(/€120\.00 repaid of €120\.00/)).toBeVisible();

  // --- external party opens the shared link ---
  const outsider = await browser.newContext();
  const guestPage = await outsider.newPage();
  await guestPage.goto(shareUrl);

  await expect(
    guestPage.getByRole('heading', { name: 'A debt was shared with you' }),
  ).toBeVisible();
  await guestPage.getByLabel('Email').fill(personEmail);
  await guestPage.getByRole('button', { name: 'Send me a code' }).click();

  // Under AUTH_E2E the code is pre-filled into the field.
  await guestPage.getByRole('button', { name: 'View the debt' }).click();

  await expect(
    guestPage.getByRole('heading', { name: 'Hi Sarah Cole' }),
  ).toBeVisible();
  await expect(guestPage.getByText('You owe Debt Tester')).toBeVisible();
  await expect(guestPage.getByText(/€120\.00 repaid of €120\.00/)).toBeVisible();

  await outsider.close();
});
