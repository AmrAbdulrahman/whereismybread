import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the recipient-method flow',
);

/** A 1×1 PNG — enough for the icon picker's <img> + canvas downscale. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a manual payment can pick a recipient method, added on the fly', async ({
  page,
}) => {
  const email = `e2e+recip-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Recip Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent to landlord');
  await page.getByLabel('Amount').fill('900');

  // no recipient method field until a manual method is chosen
  await expect(
    page.getByText('Recipient method', { exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Manual transfer' }).click();
  await expect(
    page.getByText('Recipient method', { exact: true }),
  ).toBeVisible();

  // add one on the fly, with a custom uploaded image instead of an icon
  await page.getByRole('button', { name: 'New recipient method' }).click();
  await page.getByLabel('Name').fill('Wise');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'wise.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByRole('button', { name: 'Use an icon' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Add recipient method' })
    .click();
  // it's created and selected as a chip
  await expect(page.getByRole('button', { name: 'Wise' })).toBeVisible();

  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  // the link survives a re-open of the edit form (Wise chip stays selected)
  await page.getByRole('button', { name: 'list' }).click();
  await page
    .getByRole('button', { name: 'Edit Rent to landlord' })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Wise' })).toHaveClass(
    /text-accent/,
  );
});

test('a recipient method can pull its logo from a website', async ({ page }) => {
  const email = `e2e+recip-url-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Recip URL Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Send to mum');
  await page.getByLabel('Amount').fill('50');
  await page.getByRole('button', { name: 'Manual transfer' }).click();
  await page.getByRole('button', { name: 'New recipient method' }).click();

  // paste a bare domain — the branding fetch fills in the logo
  await page
    .getByRole('textbox', { name: 'Fetch logo from a website' })
    .fill('monzo.com');
  await expect(page.locator('form img').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole('button', { name: 'Use an icon instead' }),
  ).toBeVisible();
});
