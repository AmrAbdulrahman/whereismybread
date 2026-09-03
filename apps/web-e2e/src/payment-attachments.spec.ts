import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB + Vercel Blob
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the attachment upload flow (hits Vercel Blob)',
);

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('attach a file to a payment, preview it, then remove it', async ({
  page,
}) => {
  const email = `e2e+att-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Attach Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });

  // a plain one-time payment
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Car service');
  await page.getByLabel('Amount').fill('320');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  // reopen in edit mode and attach a file (immediate upload → server action)
  await page.getByRole('button', { name: 'list' }).click();
  await page.getByRole('button', { name: 'Edit Car service' }).first().click();

  await page
    .locator('#attachment-file')
    .setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });

  const row = page.getByRole('button', { name: 'Preview receipt.png' });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // preview opens in-app
  await row.click();
  const dialog = page.getByRole('dialog', { name: 'receipt.png' });
  await expect(dialog.locator('img')).toBeVisible();
  await expect(dialog.locator('img')).toHaveAttribute(
    'src',
    /\/api\/attachments\?path=/,
  );
  await page.keyboard.press('Escape');

  // close the form; the occurrence now shows a paperclip chip
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: /1 attachment/ }).first(),
  ).toBeVisible();

  // remove it again (also deletes the blob)
  await page.getByRole('button', { name: 'Edit Car service' }).first().click();
  await page.getByRole('button', { name: 'Remove receipt.png' }).click();
  await expect(
    page.getByRole('button', { name: 'Preview receipt.png' }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: /1 attachment/ }),
  ).toBeHidden();
});
