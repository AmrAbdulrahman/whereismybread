import { cache } from 'react';
import { requireUser } from '@wib/auth/server';
import { money, todayIn } from '@wib/domain';
import { canonicalWindow, loadBundle } from './queries';
import type { ExpenseLine } from './types';

/** Every expense the signed-in user has (budgeted or not). */
export const getExpensesData = cache(async (): Promise<ExpenseLine[]> => {
  const user = await requireUser();
  const { from, to } = canonicalWindow(todayIn(user.timezone));
  // Rides on the shared page bundle — no extra round trip on `/plan` / `/insights`.
  const rows = (await loadBundle(user.id, from, to)).expenses;
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    occurredAt: e.occurredAt,
    amount: money(e.amountMinor, e.currency),
    notes: e.notes,
    url: e.url,
    logoUrl: e.logoUrl,
    brandColor: e.brandColor,
    budgetId: e.budgetId,
    budgetName: e.budgetName,
    budgetColor: e.budgetColor,
    accountId: e.accountId,
    accountName: e.accountName,
    accountColor: e.accountColor,
    bankId: e.bankId,
    bankName: e.bankName,
    bankColor: e.bankColor,
    bankIconKey: e.bankIconKey,
    bankLogoUrl: e.bankLogoUrl,
    tags: e.tags,
    attachments: e.attachments,
  }));
});
