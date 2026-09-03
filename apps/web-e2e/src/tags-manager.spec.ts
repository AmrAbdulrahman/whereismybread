import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the tag-management flow',
);

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+tagmgr-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Tag Manager');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
}

test('list, add, edit, count and delete tags', async ({ page }) => {
  await signUp(page);

  await page.goto('/tags');
  await expect(
    page.getByRole('heading', { name: 'Tags', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('No tags yet.')).toBeVisible();

  // add
  await page.getByRole('button', { name: 'New tag' }).click();
  const dialog = page.getByRole('dialog', { name: 'New tag' });
  await dialog.getByLabel('Name').fill('Groceries');
  await dialog.getByRole('radio').nth(2).click();
  await dialog.getByRole('button', { name: 'Add tag' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Groceries' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Not used yet')).toBeVisible();

  // duplicate name is rejected
  await page.getByRole('button', { name: 'New tag' }).click();
  await page
    .getByRole('dialog', { name: 'New tag' })
    .getByLabel('Name')
    .fill('groceries');
  await page
    .getByRole('dialog', { name: 'New tag' })
    .getByRole('button', { name: 'Add tag' })
    .click();
  await expect(
    page.getByText('You already have a tag with that name'),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'New tag' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  // rename
  await page.getByRole('button', { name: 'Edit Groceries' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit tag' });
  await edit.getByLabel('Name').fill('Food');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Food' }),
  ).toBeVisible();

  // attach it to a payment, then the count reflects that
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Weekly shop');
  await page.getByLabel('Amount').fill('80');
  await page.getByPlaceholder('Add tags…').fill('Food');
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByLabel('Amount')).toBeHidden();

  await page.goto('/tags');
  await expect(page.getByText('Used in 1 payment')).toBeVisible();

  // delete
  await page.getByRole('button', { name: 'Delete Food' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Food' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('No tags yet.')).toBeVisible();
});
