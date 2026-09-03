import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the bank-icon flow',
);

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a bank takes a custom icon by upload, then an icon from the grid', async ({
  page,
}) => {
  const email = `e2e+bankicon-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Bank Icon');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });

  await page.goto('/banks');
  await page.getByRole('button', { name: 'New bank' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bank' });
  await dialog.getByLabel('Name').fill('Monzo');

  // upload a logo
  await dialog
    .locator('#mark-image')
    .setInputFiles({ name: 'monzo.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(
    dialog.getByRole('button', { name: 'Use an icon instead' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Add bank' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Monzo' });
  await expect(row.locator('img')).toHaveAttribute('src', /^data:image\//);

  // edit → swap the logo for a grid icon
  await page.getByRole('button', { name: 'Edit Monzo' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit bank' });
  await expect(edit.locator('img').first()).toHaveAttribute(
    'src',
    /^data:image\//,
  );
  await edit.getByRole('button', { name: 'coins', exact: true }).click();
  await edit.getByRole('button', { name: 'Save changes' }).click();

  const monzoRow = page.getByRole('listitem').filter({ hasText: 'Monzo' });
  await expect(monzoRow.locator('svg.lucide-coins')).toBeVisible();
  await expect(monzoRow.locator('img')).toHaveCount(0);
});
