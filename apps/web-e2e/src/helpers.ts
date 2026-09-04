import type { Page } from '@playwright/test';

/**
 * Click whichever of these buttons shows up first — `exact: true` throughout,
 * since Playwright's default name match is a case-insensitive substring, and
 * a short label like "Payment" would otherwise also match a longer, hidden
 * button sitting in the same DOM. Races real `waitFor`s rather than a single
 * `isVisible()` check, since right after navigation none of the candidates
 * may be attached yet — an instant check can race the client render and find
 * none of them, even though the right one shows up moments later.
 */
async function clickFirstVisible(page: Page, names: string[]): Promise<string> {
  const candidates = names.map((name) => ({
    name,
    locator: page.getByRole('button', { name, exact: true }),
  }));
  const winner = await Promise.any(
    candidates.map((c) =>
      c.locator.waitFor({ state: 'visible', timeout: 15_000 }).then(() => c),
    ),
  );
  await winner.locator.click();
  return winner.name;
}

/**
 * Open the "New payment" form. On desktop it's its own header button; on
 * mobile the header collapses to a single "Add" button that opens a sheet
 * with "Payment" / "Expense" / "Budget" options. A totally empty board (no
 * payments, no budgets) renders a dedicated empty state instead, with its
 * own "Add a payment" button — same across breakpoints, no sheet there.
 */
export async function openNewPayment(page: Page): Promise<void> {
  const which = await clickFirstVisible(page, [
    'Add a payment',
    'New payment',
    'Add',
  ]);
  if (which === 'Add') {
    await page.getByRole('button', { name: 'Payment', exact: true }).click();
  }
}

/** Same as {@link openNewPayment}, but for the header's budget entry point. */
export async function openNewBudget(page: Page): Promise<void> {
  const which = await clickFirstVisible(page, [
    'Add a budget',
    'Add budget',
    'Add',
  ]);
  if (which === 'Add') {
    await page.getByRole('button', { name: 'Budget', exact: true }).click();
  }
}

/** Same as {@link openNewPayment}, but for the header's expense entry point. */
export async function openNewExpense(page: Page): Promise<void> {
  const which = await clickFirstVisible(page, ['Add expense', 'Add']);
  if (which === 'Add') {
    await page.getByRole('button', { name: 'Expense', exact: true }).click();
  }
}
