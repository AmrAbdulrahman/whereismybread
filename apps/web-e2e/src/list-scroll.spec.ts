import { expect, test } from '@playwright/test';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the DB-backed list scroll flow',
);

test('the list lazy-loads later months on scroll; start marker stays hidden', async ({
  page,
}) => {
  const email = `e2e+scroll-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Scroll Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });

  // a monthly payment so every month has a row to render
  await page.getByRole('button', { name: 'Add a payment' }).click();
  await page.getByLabel('Description').fill('Rent');
  await page.getByLabel('Amount').fill('900');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Day of the month').fill('12');
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'New payment' })).toBeVisible();

  // the "this is where you started" marker only appears once the reader has
  // scrolled up looking for earlier months — never on the initial render.
  await expect(page.getByText('This is where you started')).toBeHidden();

  // scrolling to the bottom pulls later months in, two at a time
  const monthHeadings = page.getByRole('heading', { level: 3 });
  const before = await monthHeadings.count();
  expect(before).toBeGreaterThan(0);

  await page.mouse.move(240, 400);
  await expect(async () => {
    await page.mouse.wheel(0, 8000);
    expect(await monthHeadings.count()).toBeGreaterThan(before);
  }).toPass({ timeout: 15_000 });
});
