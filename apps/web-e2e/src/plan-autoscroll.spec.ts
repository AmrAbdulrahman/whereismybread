import { expect, test } from '@playwright/test';
import { openNewPayment } from './helpers';

// eslint-disable-next-line playwright/no-skipped-test -- env-gated: needs a live DB
test.skip(
  process.env['AUTH_E2E'] !== '1',
  'set AUTH_E2E=1 to run the plan auto-scroll flow',
);

const now = new Date();
const day = (d: number) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

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

test('the plan lands on the first day of the month that still needs action', async ({
  page,
}) => {
  await signUp(page);
  await addMonthly(page, 'Early bill', '20', 1);
  await addMonthly(page, 'Late bill', '30', 28);

  // Tick the 1st off, so the 28th is the first day still needing action.
  await page
    .getByRole('button', { name: /Mark Early bill paid/ })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: /Mark Early bill unpaid/ }).first(),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit Late bill' }).first(),
  ).toBeVisible();

  // The list scrolled down (past the paid 1st) and the 28th's section is
  // pulled up near the top rather than sitting below the fold.
  await expect(page.locator(`[data-day="${day(28)}"]`)).toBeInViewport();
  const scrolledY = Number(await page.evaluate('window.scrollY'));
  const lateTop = Number(
    await page.evaluate(
      `document.querySelector('[data-day="${day(28)}"]').getBoundingClientRect().top`,
    ),
  );
  expect(scrolledY).toBeGreaterThan(0);
  expect(lateTop).toBeLessThan(220);
});
