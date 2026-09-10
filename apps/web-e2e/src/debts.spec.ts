import { expect, test, type Page } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the debts flow',
);

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function signUp(page: Page) {
  const email = `e2e+debt-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Debt Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

async function addPerson(page: Page, modalName: string | RegExp, name: string) {
  const modal = page.getByRole('dialog', { name: modalName });
  await modal.getByRole('button', { name: 'New' }).click();
  const personModal = page.getByRole('dialog', { name: 'New person' });
  await personModal.getByLabel('Name').fill(name);
  await personModal
    .getByLabel('Email')
    .fill(`${name.toLowerCase().replace(/\W+/g, '.')}-${Date.now()}@example.com`);
  await personModal.getByRole('button', { name: 'Add person' }).click();
  await expect(personModal).toBeHidden();
  return modal;
}

/** Person panels start collapsed — expand the one for `personName`. */
async function expandPanel(page: Page, personName: string) {
  const panel = page.locator('section').filter({ hasText: personName });
  const toggle = panel.getByRole('button', { expanded: false });
  if (await toggle.count()) await toggle.click();
  return panel;
}

async function unlockShared(page: Page, shareUrl: string, email: string) {
  await page.goto(shareUrl);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  // Under AUTH_E2E the code is pre-filled into the field.
  await page.getByRole('button', { name: 'View the debt' }).click();
}

test('debts: a basket with several denomination rows — repay, settle, add a row, shared page', async ({
  page,
  browser,
}) => {
  await signUp(page);
  const personEmail = `sarah-${Date.now()}@example.com`;

  await page.goto('/debts');
  await expect(
    page.getByRole('heading', { name: 'No debts tracked yet' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();
  const personModal = page.getByRole('dialog', { name: 'New person' });
  await personModal.getByLabel('Name').fill('Sarah Cole');
  await personModal.getByLabel('Email').fill(personEmail);
  await personModal.getByRole('button', { name: 'Add person' }).click();
  await expect(personModal).toBeHidden();

  await modal.getByRole('button', { name: 'They owe me' }).click();
  await modal.getByLabel('Date incurred').fill('2026-02-14');
  await modal.getByLabel("What's it for?").fill('Trip costs');

  // Row 0 — 100 USD.
  await modal.locator('#row-0-amount').fill('100');
  await modal.getByRole('button', { name: 'EUR' }).first().click();
  const ccy = page.getByRole('dialog', { name: 'Choose currency' });
  await ccy.getByPlaceholder('Search currencies…').fill('USD');
  await ccy.getByRole('button', { name: /USD/ }).first().click();

  // Row 1 — 30 EUR.
  await modal.getByRole('button', { name: 'Add a row' }).click();
  await modal.locator('#row-1-amount').fill('30');

  // Row 2 — a 50 g gold bar.
  await modal.getByRole('button', { name: 'Add a row' }).click();
  await modal.getByRole('button', { name: 'Gold', exact: true }).nth(2).click();
  await modal.getByLabel('Gold type').selectOption('bar_50g');
  await modal.getByLabel('Quantity (pieces)').fill('1');

  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/debts$/);

  // The card shows a chip per denomination + an app-currency equivalent.
  await expandPanel(page, 'Sarah Cole');
  const card = page.getByRole('link', { name: /Trip costs/ });
  await expect(card).toBeVisible();
  await expect(card.getByText(/\$100\.00/)).toBeVisible();
  await expect(card.getByText(/€30\.00/)).toBeVisible();
  await expect(card.getByText(/50 g bar/)).toBeVisible();
  await expect(card.getByText(/≈\s*€/)).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole('heading', { name: 'Sarah Cole owes you' }),
  ).toBeVisible();
  await expect(page.getByText(/Incurred 14 Feb 2026/)).toBeVisible();

  await expect(page.getByText(/\$0\.00 repaid of \$100\.00/)).toBeVisible();
  await expect(page.getByText(/€0\.00 repaid of €30\.00/)).toBeVisible();

  const shareUrl = await page.getByLabel('Shared debt link').inputValue();
  expect(shareUrl).toMatch(/\/d\/[0-9a-f-]{36}$/);

  // Record a $50 repayment from the USD balance.
  const usdBlock = page
    .getByRole('listitem')
    .filter({ hasText: '$100.00' });
  await usdBlock.getByRole('button', { name: 'Record repayment' }).click();
  const repay = page.getByRole('dialog', { name: 'Record a repayment' });
  await repay.getByLabel(/^Amount/).fill('50');
  await repay.getByRole('button', { name: 'Record repayment' }).click();
  await expect(repay).toBeHidden();
  await expect(page.getByText(/\$50\.00 repaid of \$100\.00/)).toBeVisible();
  await expect(page.getByText(/€0\.00 repaid of €30\.00/)).toBeVisible();

  // Settle just the EUR balance.
  await page
    .getByRole('listitem')
    .filter({ hasText: '€30.00' })
    .getByRole('button', { name: 'Settle this' })
    .click();
  await expect(page.getByText(/€30\.00 repaid of €30\.00/)).toBeVisible();

  // Settle the whole debt.
  await page.getByRole('button', { name: 'Settle in full' }).click();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await expect(page.getByText(/\$100\.00 repaid of \$100\.00/)).toBeVisible();

  // Add a fourth row on the detail page.
  await page
    .getByRole('button', { name: 'Add a row' })
    .click();
  const lineModal = page.getByRole('dialog', { name: 'Add a row' });
  await lineModal.locator('#line-amount').fill('10');
  await lineModal.getByRole('button', { name: /USD|EUR|GBP/ }).first().click();
  const ccy2 = page.getByRole('dialog', { name: 'Choose currency' });
  await ccy2.getByPlaceholder('Search currencies…').fill('GBP');
  await ccy2.getByRole('button', { name: /GBP/ }).first().click();
  await lineModal.getByRole('button', { name: 'Add row' }).click();
  await expect(lineModal).toBeHidden();
  await expect(page.getByText(/£0\.00 repaid of £10\.00/)).toBeVisible();

  // The other party sees the same rows + balances.
  const outsider = await browser.newContext();
  const guest = await outsider.newPage();
  await unlockShared(guest, shareUrl, personEmail);
  await expect(
    guest.getByRole('heading', { name: 'Hi Sarah Cole' }),
  ).toBeVisible();
  await expect(guest.getByText('You owe Debt Tester').first()).toBeVisible();
  // USD + EUR were settled; the GBP row added afterwards is still outstanding.
  await expect(guest.getByText(/\$100\.00 repaid of \$100\.00/)).toBeVisible();
  await expect(guest.getByText(/£0\.00 repaid of £10\.00/)).toBeVisible();
  await outsider.close();
});

test('debts: a gold-denominated row tracks quantity and shows on the shared page', async ({
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
  await expect(personModal).toBeHidden();

  await modal.getByRole('button', { name: 'Gold', exact: true }).click();
  await modal.getByLabel('Gold type').selectOption('k21');
  await modal.getByLabel('Quantity (g)').fill('10');
  await modal.getByLabel("What's it for?").fill('Wedding gift');
  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();

  await expandPanel(page, 'Nabil Fahmy');
  await page.getByRole('link', { name: /Wedding gift/ }).click();
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);
  await expect(
    page.getByText(/0 g of 21K gold repaid of 10 g of 21K gold/),
  ).toBeVisible();

  await page
    .getByRole('listitem')
    .filter({ hasText: '21K gold' })
    .getByRole('button', { name: 'Record repayment' })
    .click();
  const repay = page.getByRole('dialog', { name: 'Record a repayment' });
  await expect(
    repay.getByText(/Repay the rest · 10 g of 21K gold/),
  ).toBeVisible();
  await repay.getByLabel('Amount (g)').fill('4');
  await repay.getByRole('button', { name: 'Record repayment' }).click();
  await expect(repay).toBeHidden();
  await expect(
    page.getByText(/4 g of 21K gold repaid of 10 g of 21K gold/),
  ).toBeVisible();

  const shareUrl = await page.getByLabel('Shared debt link').inputValue();
  const outsider = await browser.newContext();
  const guest = await outsider.newPage();
  await unlockShared(guest, shareUrl, personEmail);
  await expect(
    guest.getByText(/4 g of 21K gold repaid of 10 g of 21K gold/),
  ).toBeVisible();
  await outsider.close();
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
  await expect(personModal).toBeHidden();

  await modal.locator('#row-0-amount').fill('80');
  await modal.getByLabel("What's it for?").fill('Groceries');
  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();

  await expandPanel(page, 'Alex Kerr');
  await page.getByRole('link', { name: /Groceries/ }).click();
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);

  await page
    .locator('#debt-detail-attachment')
    .setInputFiles({ name: 'iou.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(
    page.getByRole('button', { name: 'Preview iou.png' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Record repayment' }).first().click();
  const repay = page.getByRole('dialog', { name: 'Record a repayment' });
  await repay.getByLabel(/^Amount/).fill('30');
  await repay.locator('#repayment-attachment').setInputFiles({
    name: 'transfer.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });
  await expect(
    repay.getByRole('button', { name: 'Preview transfer.png' }),
  ).toBeVisible();
  await repay.getByRole('button', { name: 'Record repayment' }).click();
  await expect(repay).toBeHidden();
  await expect(page.getByText(/€30\.00 repaid of €80\.00/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /transfer\.png/ }),
  ).toBeVisible();

  const shareUrl = await page.getByLabel('Shared debt link').inputValue();
  const outsider = await browser.newContext();
  const guest = await outsider.newPage();
  await unlockShared(guest, shareUrl, personEmail);
  await expect(guest.getByRole('heading', { name: 'Hi Alex Kerr' })).toBeVisible();

  const iouLink = guest.getByRole('link', { name: /iou\.png/ });
  await expect(iouLink).toBeVisible();
  await expect(guest.getByRole('link', { name: /transfer\.png/ })).toBeVisible();
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

test('debts: optimistic add, per-person grouping, collapse', async ({ page }) => {
  await signUp(page);

  await page.goto('/debts');
  await page.getByRole('button', { name: 'New debt' }).first().click();
  await addPerson(page, 'New debt', 'Dana Roy');
  const modal = page.getByRole('dialog', { name: 'New debt' });

  await modal.getByRole('button', { name: 'They owe me' }).click();
  await modal.locator('#row-0-amount').fill('20');
  await modal.getByLabel("What's it for?").fill('lunch');

  const t0 = Date.now();
  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/debts$/);

  // Optimistic — the person panel + its summary appear with no reload.
  const panel = page.locator('section').filter({ hasText: 'Dana Roy' });
  await expect(panel.getByText(/€20\.00 to you/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(10_000);

  // Panels start collapsed — expand to see the card.
  await panel.getByRole('button', { expanded: false }).click();
  const card = page.getByRole('link', { name: /lunch/ });
  await expect(card).toBeVisible();
  await expect(card.getByText(/€20\.00/)).toBeVisible();

  // The panel's own "Add" appends a second gold debt to the same person.
  await panel.getByRole('button', { name: 'Add' }).click();
  const add = page.getByRole('dialog', { name: /New debt · Dana Roy/ });
  await add.getByRole('button', { name: 'Gold', exact: true }).click();
  await add.getByLabel('Gold type').selectOption('bar_oz');
  await add.getByLabel('Quantity (pieces)').fill('2');
  await add.getByRole('button', { name: 'Create debt' }).click();
  await expect(add).toBeHidden();

  await page.goto('/debts');
  const panel2 = page.locator('section').filter({ hasText: 'Dana Roy' });
  // Collapsed by default — the summary shows, the cards don't.
  await expect(panel2.getByRole('listitem')).toHaveCount(0);
  await expect(panel2.getByText(/€20\.00 to you/)).toBeVisible();

  // Expand — both cards appear.
  await panel2.getByRole('button', { expanded: false }).click();
  await expect(panel2.getByRole('listitem')).toHaveCount(2);
  await expect(panel2.getByText(/1 oz bar/).first()).toBeVisible();
});
