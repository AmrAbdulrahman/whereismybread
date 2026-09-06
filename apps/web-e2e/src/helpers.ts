import type { Page } from '@playwright/test';

/**
 * Click whichever of these buttons shows up first — `exact: true` throughout,
 * since Playwright's default name match is a case-insensitive substring, and
 * a short label like "Budget" would otherwise also match a longer, hidden
 * button sitting in the same DOM. Races real `waitFor`s rather than a single
 * `isVisible()` check, since right after navigation none of the candidates
 * may be attached yet.
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
 * The plan header has no add buttons — a single floating "+" (aria-label
 * "Add") expands into "Planned payment" / "Expense" / "Budget". A totally
 * empty board renders a dedicated empty state instead, with its own "Add a
 * payment" / "Add a budget" CTAs (no FAB, no expense there).
 */
async function openViaFab(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

export async function openNewPayment(page: Page): Promise<void> {
  const which = await clickFirstVisible(page, ['Add a payment', 'Add']);
  if (which === 'Add') {
    await page
      .getByRole('button', { name: 'Planned payment', exact: true })
      .click();
  }
}

export async function openNewBudget(page: Page): Promise<void> {
  const which = await clickFirstVisible(page, ['Add a budget', 'Add']);
  if (which === 'Add') {
    await page.getByRole('button', { name: 'Budget', exact: true }).click();
  }
}

export async function openNewExpense(page: Page): Promise<void> {
  // No expense CTA in the empty state — always the FAB.
  await openViaFab(page, 'Expense');
}
