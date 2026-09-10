import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the debts flow',
);

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
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
  await modal.getByLabel('Date').fill('2026-02-14');
  await modal.getByLabel('Note (optional)').fill('Concert tickets');
  await modal.getByRole('button', { name: 'Add debt' }).click();

  // Landed on the detail page.
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole('heading', { name: 'Sarah Cole owes you' }),
  ).toBeVisible();
  await expect(page.getByText(/Incurred 14 Feb 2026/)).toBeVisible();
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

test('debts: a gold-denominated debt tracks quantity and shows on the shared page', async ({
  page,
  browser,
}) => {
  await signUp(page);
  const personEmail = `nabil-${Date.now()}@example.com`;

  await page.goto('/debts');
  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();
  const personModal = page.getByRole('dialog', { name: 'New person' });
  await personModal.getByLabel('Name').fill('Nabil Fahmy');
  await personModal.getByLabel('Email').fill(personEmail);
  await personModal.getByRole('button', { name: 'Add person' }).click();

  // Switch the denomination to Gold, 21K, 10 g.
  await modal.getByRole('button', { name: 'Gold', exact: true }).click();
  await modal.getByLabel('Gold type').selectOption('k21');
  await modal.getByLabel('Quantity (g)').fill('10');
  await modal.getByLabel('Note (optional)').fill('Wedding gift');
  await modal.getByRole('button', { name: 'Add debt' }).click();

  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);
  await expect(
    page.getByText(/0 g of 21K gold repaid of 10 g of 21K gold/),
  ).toBeVisible();

  // Repay 4 g.
  await page.getByRole('button', { name: 'Record repayment' }).click();
  const repay = page.getByRole('dialog', { name: 'Record a repayment' });
  await expect(repay.getByText(/Repay the rest · 10 g of 21K gold/)).toBeVisible();
  await repay.getByLabel('Amount (g)').fill('4');
  await repay.getByRole('button', { name: 'Record repayment' }).click();
  await expect(
    page.getByText(/4 g of 21K gold repaid of 10 g of 21K gold/),
  ).toBeVisible();

  const shareUrl = await page.getByLabel('Shared debt link').inputValue();
  const outsider = await browser.newContext();
  const guest = await outsider.newPage();
  await guest.goto(shareUrl);
  await guest.getByLabel('Email').fill(personEmail);
  await guest.getByRole('button', { name: 'Send me a code' }).click();
  await guest.getByRole('button', { name: 'View the debt' }).click();
  await expect(
    guest.getByText(/4 g of 21K gold repaid of 10 g of 21K gold/),
  ).toBeVisible();
  await outsider.close();
});

test('debts: several entries to one person in one go, grouped under a person panel', async ({
  page,
}) => {
  await signUp(page);
  const personEmail = `dana-${Date.now()}@example.com`;

  await page.goto('/debts');
  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();
  const personModal = page.getByRole('dialog', { name: 'New person' });
  await personModal.getByLabel('Name').fill('Dana Roy');
  await personModal.getByLabel('Email').fill(personEmail);
  await personModal.getByRole('button', { name: 'Add person' }).click();

  // Entry 1 — €20 money, with a note.
  await modal.getByLabel('Amount').fill('20');
  await modal.locator('#nd-0-note').fill('lunch');

  // Entry 2 — 5 g of 21K gold.
  await modal.getByRole('button', { name: 'Add another entry' }).click();
  await modal.getByRole('button', { name: 'Gold', exact: true }).nth(1).click();
  await modal.getByLabel('Gold type').selectOption('k21');
  await modal.getByLabel('Quantity (g)').fill('5');

  await modal.getByRole('button', { name: 'Add 2 debts' }).click();

  // Back on the list — both debts sit under one "Dana Roy" panel.
  await expect(page).toHaveURL(/\/debts$/);
  const panel = page.locator('section').filter({ hasText: 'Dana Roy' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/€20\.00 to you/)).toBeVisible();
  await expect(panel.getByText(/5 g of 21K gold to you/)).toBeVisible();
  await expect(panel.getByRole('listitem')).toHaveCount(2);

  // The panel's own "Add" appends a third to the same person.
  await panel.getByRole('button', { name: 'Add' }).click();
  const add = page.getByRole('dialog', { name: /New debt · Dana Roy/ });
  await add.getByRole('button', { name: 'Gold', exact: true }).click();
  await add.getByLabel('Gold type').selectOption('bar_oz');
  await add.getByLabel('Quantity (pieces)').fill('2');
  await add.getByRole('button', { name: 'Add debt' }).click();
  // The modal closes on success (single line → navigates to the debt).
  await expect(add).toBeHidden();

  await page.goto('/debts');
  const panel2 = page.locator('section').filter({ hasText: 'Dana Roy' });
  await expect(panel2.getByRole('listitem')).toHaveCount(3);
  await expect(
    panel2.getByRole('link').filter({ hasText: '1 oz bar (999)' }),
  ).toHaveCount(1);
});

test('debts: attachments on debt + repayment, visible on the shared page; people manager', async ({
  page,
  browser,
}) => {
  await signUp(page);
  const personEmail = `alex-${Date.now()}@example.com`;

  await page.goto('/debts');
  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();
  const personModal = page.getByRole('dialog', { name: 'New person' });
  await personModal.getByLabel('Name').fill('Alex Kerr');
  await personModal.getByLabel('Email').fill(personEmail);
  await personModal.getByRole('button', { name: 'Add person' }).click();

  await modal.getByLabel('Amount').fill('80');
  await modal.getByLabel('Note (optional)').fill('Groceries');
  await modal.getByRole('button', { name: 'Add debt' }).click();
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);

  // Attach a file to the debt itself (edit mode — hits the server now).
  await page
    .locator('#debt-detail-attachment')
    .setInputFiles({ name: 'iou.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(
    page.getByRole('button', { name: 'Preview iou.png' }),
  ).toBeVisible();

  // Attach a file while recording a repayment.
  await page.getByRole('button', { name: 'Record repayment' }).click();
  const repay = page.getByRole('dialog', { name: 'Record a repayment' });
  await repay.getByLabel(/^Amount/).fill('30');
  await repay
    .locator('#repayment-attachment')
    .setInputFiles({
      name: 'transfer.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });
  await expect(
    repay.getByRole('button', { name: 'Preview transfer.png' }),
  ).toBeVisible();
  await repay.getByRole('button', { name: 'Record repayment' }).click();
  await expect(page.getByText(/€30\.00 repaid of €80\.00/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /transfer\.png/ }),
  ).toBeVisible();

  const shareUrl = await page.getByLabel('Shared debt link').inputValue();

  // The other party sees both files on the shared page.
  const outsider = await browser.newContext();
  const guest = await outsider.newPage();
  await guest.goto(shareUrl);
  await guest.getByLabel('Email').fill(personEmail);
  await guest.getByRole('button', { name: 'Send me a code' }).click();
  await guest.getByRole('button', { name: 'View the debt' }).click();
  await expect(guest.getByRole('heading', { name: 'Hi Alex Kerr' })).toBeVisible();

  const iouLink = guest.getByRole('link', { name: /iou\.png/ });
  await expect(iouLink).toBeVisible();
  await expect(guest.getByRole('link', { name: /transfer\.png/ })).toBeVisible();
  // The private blob streams back for the granted browser.
  const href = await iouLink.getAttribute('href');
  const res = await guest.request.get(href ?? '');
  expect(res.status()).toBe(200);
  await outsider.close();

  // People manager: rename, and deletion is blocked while a debt exists.
  await page.goto('/debts');
  await page.getByRole('button', { name: 'People' }).click();
  const people = page.getByRole('dialog', { name: 'People' });
  await expect(people.getByText(/Alex Kerr/)).toBeVisible();
  await expect(people.getByText(/1 debt/)).toBeVisible();
  await people.getByRole('button', { name: 'Edit Alex Kerr' }).click();
  const editPerson = page.getByRole('dialog', { name: 'Edit person' });
  await editPerson.getByLabel('Name').fill('Alexandra Kerr');
  await editPerson.getByRole('button', { name: 'Save changes' }).click();
  await expect(people.getByText(/Alexandra Kerr/)).toBeVisible();
  await expect(
    people.getByRole('button', { name: 'Delete Alexandra Kerr' }),
  ).toBeDisabled();
});
