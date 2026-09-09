import { expect, test } from '@playwright/test';
import { openNewPayment } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the plan auto-scroll flow',
);

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: number) =>
  `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(d)}`;
const todayIso = day(now.getUTCDate());

async function signUp(page: import('@playwright/test').Page) {
  const email = `e2e+autoscroll-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Auto Scroll Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-strong-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 35_000 });
}

async function addMonthly(
  page: import('@playwright/test').Page,
  name: string,
  amount: string,
  dayOfMonth: number,
) {
  await openNewPayment(page);
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await page.getByLabel('Description').fill(name);
  await page.getByLabel('Amount').fill(amount);
  await page.getByLabel('Day of the month').fill(String(dayOfMonth));
  await page.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
}

// Today gets its own dated section when a payment falls on it, otherwise it's
// the "Today" divider between the days before and after.
const todayAnchor = (page: import('@playwright/test').Page) =>
  page.locator(`[data-plan-today], [data-day="${todayIso}"]`).first();

test('the plan lands on today every time it opens', async ({ page }) => {
  await signUp(page);
  // Bills on the 1st and 28th, so there is content both above and below
  // today for most of the month.
  await addMonthly(page, 'Early bill', '20', 1);
  await addMonthly(page, 'Late bill', '30', 28);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();

  // The list opened scrolled to today rather than the top of the month —
  // the 1st's row is only reachable by scrolling back up.
  await expect(todayAnchor(page)).toBeInViewport();

  // Navigate away and back: the list is once again parked at today, not
  // wherever it was left.
  const insights = page.getByRole('link', { name: 'Insights', exact: true });
  const payments = page.getByRole('link', { name: 'Payments', exact: true });
  /* eslint-disable playwright/no-conditional-expect -- nav layout varies by viewport */
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (await insights.isVisible()) {
    await insights.click();
    await expect(page).toHaveURL(/\/insights/);
    await payments.click();
    await expect(page).toHaveURL(/\/plan/);
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await expect(todayAnchor(page)).toBeInViewport();
  }
  /* eslint-enable playwright/no-conditional-expect */
});
