import { expect, test, type Locator, type Page } from '@playwright/test';

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

/** Open the unified unit picker from `trigger` and choose the row matching `name`. */
async function pickUnit(page: Page, trigger: Locator, name: string | RegExp) {
  await trigger.click();
  const dlg = page.getByRole('dialog', { name: 'Amount in…' });
  const search = typeof name === 'string' ? name : '';
  if (search) await dlg.getByPlaceholder(/Search/).fill(search);
  await dlg.getByRole('button', { name }).first().click();
  await expect(dlg).toBeHidden();
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
  // Under AUTH_E2E the code is pre-filled into the field — wait for it.
  await expect(page.getByLabel('Code')).not.toHaveValue('', { timeout: 15_000 });
  await page.getByRole('button', { name: 'View the debt' }).click();
}

test('debts: a basket with several denomination rows — repay, settle, add a row, shared page', async ({
  page,
  browser,
}) => {
  test.slow();
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
  await pickUnit(page, modal.getByRole('button', { name: 'Change unit' }).nth(0), 'US Dollar');

  // Row 1 — 30 EUR (default).
  await modal.getByRole('button', { name: 'Add a row' }).click();
  await modal.locator('#row-1-amount').fill('30');

  // Row 2 — a 50 g gold bar.
  await modal.getByRole('button', { name: 'Add a row' }).click();
  await pickUnit(page, modal.getByRole('button', { name: 'Change unit' }).nth(2), '50 g bar (999)');
  await modal.locator('#row-2-amount').fill('1');

  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/debts$/);

  // The totals card shows a row per denomination.
  await expect(page.getByText(/\$100\.00 to you/).first()).toBeVisible();

  // The card shows a chip per denomination + an app-currency equivalent.
  await expandPanel(page, 'Sarah Cole');
  const card = page.getByRole('link', { name: /Trip costs/ });
  await expect(card).toBeVisible();
  await expect(card.getByText(/\$100\.00/)).toBeVisible();
  await expect(card.getByText(/€30\.00/)).toBeVisible();
  await expect(card.getByText(/1 × 50 g bar/)).toBeVisible();
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
  await page
    .getByRole('listitem')
    .filter({ hasText: '$100.00' })
    .getByRole('button', { name: 'Record repayment' })
    .click();
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

  // Add a fourth row (10 GBP) on the detail page.
  await page.getByRole('button', { name: 'Add a row' }).click();
  const lineModal = page.getByRole('dialog', { name: 'Add a row' });
  await lineModal.locator('#line-amount').fill('10');
  await pickUnit(page, lineModal.getByRole('button', { name: 'Change unit' }), 'British Pound');
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

  await pickUnit(page, modal.getByRole('button', { name: 'Change unit' }), '21K gold');
  await modal.locator('#row-0-amount').fill('10');
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

test('debts: an original value at lending shows a value-drift badge', async ({
  page,
}) => {
  await signUp(page);

  await page.goto('/debts');
  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();
  const pm = page.getByRole('dialog', { name: 'New person' });
  await pm.getByLabel('Name').fill('Drift Test');
  await pm.getByLabel('Email').fill(`drift-${Date.now()}@example.com`);
  await pm.getByRole('button', { name: 'Add person' }).click();
  await expect(pm).toBeHidden();

  await modal.getByRole('button', { name: 'They owe me' }).click();
  await modal.locator('#row-0-amount').fill('100');
  await modal.getByLabel("What's it for?").fill('Loan with history');
  await modal.getByLabel(/Original value at lending/).fill('50');
  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();

  // Both amounts are EUR (the default) — same-currency drift is exact: +100%.
  await expandPanel(page, 'Drift Test');
  const card = page.getByRole('link', { name: /Loan with history/ });
  await expect(card).toBeVisible();
  await expect(card.getByText('+100.0%')).toBeVisible();

  await card.click();
  await expect(page.getByText('Lending value €50.00')).toBeVisible();
  await expect(
    page.getByText('+€50.00 (+100.0%) since lending'),
  ).toBeVisible();

  // Clearing it in the edit form drops the whole line.
  await page.getByRole('button', { name: 'Edit debt' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit debt' });
  await expect(edit.getByLabel(/Original value at lending/)).toHaveValue(
    '50.00',
  );
  await edit.getByLabel(/Original value at lending/).fill('');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText(/Lending value/)).toBeHidden();
});

test('debts: a custom "thing" — catalogue, use as a denomination, ≈ from its value', async ({
  page,
  browser,
}) => {
  await signUp(page);
  const personEmail = `omar-${Date.now()}@example.com`;

  await page.goto('/debts');

  // Add a thing via the Things manager.
  await page.getByRole('button', { name: 'Things' }).click();
  const things = page.getByRole('dialog', { name: 'Things' });
  await things.getByRole('button', { name: 'Add a thing' }).click();
  const tf = page.getByRole('dialog', { name: 'New thing' });
  await tf.getByLabel('Name').fill('Rolex Submariner');
  await tf.getByLabel(/Reference value/).fill('12000');
  await tf.getByRole('button', { name: 'Add thing' }).click();
  await expect(tf).toBeHidden();
  await expect(things.getByText('Rolex Submariner')).toBeVisible();
  await things.getByRole('button', { name: 'Done' }).click();

  // New debt denominated in that thing.
  await page.getByRole('button', { name: 'New debt' }).first().click();
  const modal = page.getByRole('dialog', { name: 'New debt' });
  await modal.getByRole('button', { name: 'New' }).click();
  const pm = page.getByRole('dialog', { name: 'New person' });
  await pm.getByLabel('Name').fill('Omar Said');
  await pm.getByLabel('Email').fill(personEmail);
  await pm.getByRole('button', { name: 'Add person' }).click();
  await expect(pm).toBeHidden();

  await modal.getByRole('button', { name: 'They owe me' }).click();
  await pickUnit(page, modal.getByRole('button', { name: 'Change unit' }), 'Rolex Submariner');
  await modal.locator('#row-0-amount').fill('2');
  await modal.getByLabel("What's it for?").fill('Borrowed pieces');
  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();

  await expect(page.getByText(/2 × Rolex Submariner to you/).first()).toBeVisible();
  await expandPanel(page, 'Omar Said');
  const card = page.getByRole('link', { name: /Borrowed pieces/ });
  await expect(card.getByText(/2 × Rolex Submariner/)).toBeVisible();
  await expect(card.getByText(/≈\s*€/)).toBeVisible();

  await card.click();
  await expect(
    page.getByText(/0 × Rolex Submariner repaid of 2 × Rolex Submariner/),
  ).toBeVisible();

  const shareUrl = await page.getByLabel('Shared debt link').inputValue();
  const outsider = await browser.newContext();
  const guest = await outsider.newPage();
  await unlockShared(guest, shareUrl, personEmail);
  await expect(
    guest.getByText(/0 × Rolex Submariner repaid of 2 × Rolex Submariner/),
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
  await modal.getByLabel('Notes (optional)').fill('split with the group');

  const t0 = Date.now();
  await modal.getByRole('button', { name: 'Create debt' }).click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/debts$/);

  // Optimistic — the person panel + its summary appear with no reload.
  const panel = page.locator('section').filter({ hasText: 'Dana Roy' });
  await expect(panel.getByText(/€20\.00 to you/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(10_000);

  // While collapsed, no per-debt description/notes — just the balance summary.
  await expect(panel.getByText('lunch')).toBeHidden();
  await expect(panel.getByText('split with the group')).toBeHidden();

  // Panels start collapsed — expand to see the card, description and notes.
  await panel.getByRole('button', { expanded: false }).click();
  const card = page.getByRole('link', { name: /lunch/ });
  await expect(card).toBeVisible();
  await expect(card.getByText(/€20\.00/)).toBeVisible();
  await expect(card.getByText('split with the group')).toBeVisible();

  // The panel's own "Add" appends a second gold debt to the same person.
  await panel.getByRole('button', { name: 'Add' }).click();
  const add = page.getByRole('dialog', { name: /New debt · Dana Roy/ });
  await pickUnit(page, add.getByRole('button', { name: 'Change unit' }), '1 oz bar (999)');
  await add.locator('#row-0-amount').fill('2');
  await add.getByRole('button', { name: 'Create debt' }).click();
  await expect(add).toBeHidden();

  // Expanded state is remembered per tab (sessionStorage) — even a full
  // reload keeps this panel open, not just an in-app back-navigation.
  await page.goto('/debts');
  const panel2 = page.locator('section').filter({ hasText: 'Dana Roy' });
  await expect(panel2.getByRole('listitem')).toHaveCount(2);
  await expect(panel2.getByText(/2 × 1 oz bar/).first()).toBeVisible();

  // Collapsing it also persists across a reload.
  await panel2.getByRole('button', { expanded: true }).click();
  await expect(panel2.getByRole('listitem')).toHaveCount(0);
  await expect(panel2.getByText(/€20\.00 to you/)).toBeVisible();
  await page.goto('/debts');
  const panel3 = page.locator('section').filter({ hasText: 'Dana Roy' });
  await expect(panel3.getByRole('listitem')).toHaveCount(0);
});

test('debts: back-navigation from a debt keeps the /debts scroll position and expanded panels', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/debts');

  // Four people, every panel expanded — tall enough to overflow any
  // viewport (including mobile) without needing a large, pooler-unfriendly
  // batch of creates.
  const names = Array.from({ length: 4 }, (_, i) => `Nav Person ${i}`);
  for (const name of names) {
    await page.getByRole('button', { name: 'New debt' }).first().click();
    await addPerson(page, 'New debt', name);
    const modal = page.getByRole('dialog', { name: 'New debt' });
    await modal.locator('#row-0-amount').fill('15');
    await modal.getByLabel("What's it for?").fill(`For ${name}`);
    await modal.getByRole('button', { name: 'Create debt' }).click();
    await expect(modal).toBeHidden();
  }

  for (const name of names) {
    await page
      .locator('section')
      .filter({ hasText: name })
      .getByRole('button', { expanded: false })
      .click();
  }
  const panelA = page.locator('section').filter({ hasText: 'Nav Person 0' });
  const panelB = page.locator('section').filter({ hasText: 'Nav Person 1' });

  // page.mouse.wheel doesn't reliably scroll under mobile/touch emulation.
  await page.evaluate('window.scrollBy(0, 300)');
  await page.waitForTimeout(150);
  const scrollBefore = await page.evaluate<number>('window.scrollY');
  expect(scrollBefore).toBeGreaterThan(0);

  await page.getByRole('link', { name: /For Nav Person 1/ }).click();
  await expect(page).toHaveURL(/\/debts\/[0-9a-f-]{36}/);
  await page.getByRole('link', { name: 'All debts' }).click();
  await expect(page).toHaveURL(/\/debts$/);

  // Both panels are still expanded, and the scroll position held.
  await expect(panelA.getByRole('button', { expanded: true })).toBeVisible();
  await expect(panelB.getByRole('button', { expanded: true })).toBeVisible();
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate<number>('window.scrollY');
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(150);
});
