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
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
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

  // a second tag, so the filter has something to narrow
  await page.getByRole('button', { name: 'New tag' }).click();
  await page
    .getByRole('dialog', { name: 'New tag' })
    .getByLabel('Name')
    .fill('Gym');
  await page
    .getByRole('dialog', { name: 'New tag' })
    .getByRole('button', { name: 'Add tag' })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(2);

  await page.getByPlaceholder('Filter tags…').fill('gro');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Groceries' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);

  // drop the extra (unused → inline confirm)
  await page.getByRole('button', { name: 'Delete Gym' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Gym' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(1);

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
  // stats strip is present
  await expect(page.getByText('in use', { exact: true })).toBeVisible();

  // a referenced tag opens a confirmation modal showing the usage count
  await page.getByRole('button', { name: 'Delete Food' }).click();
  const del = page.getByRole('dialog', { name: 'Delete tag?' });
  await expect(del.getByText(/used by\s*1\s*payment/)).toBeVisible();
  await del.getByRole('button', { name: 'Delete anyway' }).click();
  await expect(page.getByText('No tags yet.')).toBeVisible();
});
