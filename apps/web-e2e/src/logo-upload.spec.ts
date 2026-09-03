import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the logo-upload flow',
);

/** A 1×1 PNG — enough for the form's <img> + canvas downscale to accept. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a subscription logo can be uploaded by hand', async ({ page }) => {
  const email = `e2e+logo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Logo Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Netflix');
  await page.getByLabel('Amount').fill('12.99');
  // a recurring payment shows the Provider field with its logo control
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();

  await page
    .locator('#provider-logo')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX });

  // the preview swaps from the placeholder icon to the uploaded image
  await expect(page.locator('form img').first()).toHaveAttribute(
    'src',
    /^data:image\//,
    { timeout: 10_000 },
  );

  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.getByRole('button', { name: 'list' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Netflix' }).first(),
  ).toBeVisible();
  // the occurrence in the list renders the uploaded logo
  await expect(page.locator('main img').first()).toHaveAttribute(
    'src',
    /^data:image\//,
  );
});
