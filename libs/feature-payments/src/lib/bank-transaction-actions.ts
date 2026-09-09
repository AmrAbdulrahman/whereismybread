'use server';

import { requireUserId } from '@wib/auth/server';
import type { FormState } from '@wib/auth';
import {
  fetchBranding,
  getBankTransactionsByIds,
  markBankTransactionCategorized,
  markBankTransactionIgnored,
  markBankTransactionsIgnored,
  markOccurrence,
  updateBankTransactionEnrichment,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import { revalidateUserData } from './revalidate';

export interface EnrichTransactionInput {
  name?: string;
  notes?: string;
  accountId?: string | null;
  methodId?: string | null;
  tags?: string[];
  url?: string | null;
}

/**
 * Stamp a pending review transaction with triage hints from the "edit details"
 * modal. When `url` is given, the provider's logo + colour are pulled in too.
 */
export async function enrichBankTransactionAction(
  id: string,
  input: EnrichTransactionInput,
): Promise<FormState> {
  const userId = await requireUserId();
  const patch: Parameters<typeof updateBankTransactionEnrichment>[2] = {};
  if (input.name !== undefined) patch.nameOverride = input.name.trim() || null;
  if (input.notes !== undefined)
    patch.notesOverride = input.notes.trim() || null;
  if (input.accountId !== undefined) patch.accountId = input.accountId || null;
  if (input.methodId !== undefined) patch.methodId = input.methodId || null;
  if (Array.isArray(input.tags)) patch.tags = input.tags;
  if (input.url !== undefined) {
    const url = (input.url ?? '').trim();
    patch.url = url || null;
    patch.logoUrl = null;
    patch.brandColor = null;
    if (url) {
      try {
        const b = await fetchBranding(url);
        if (b.logoUrl) patch.logoUrl = b.logoUrl;
        if (b.color) patch.brandColor = b.color;
      } catch {
        // keep the URL, skip the image
      }
    }
  }
  await updateBankTransactionEnrichment(userId, id, patch);
  revalidatePath('/integrations');
  revalidatePath('/plan');
  revalidateUserData(userId);
  return { ok: true };
}

export async function categorizeBankTransactionAction(
  transactionId: string,
  result: { type: 'expense' | 'payment'; id: string },
): Promise<FormState> {
  const userId = await requireUserId();
  // The payment / expense itself was just created via `savePaymentAction` /
  // `saveExpenseAction`, which already fired the "payment or expense added"
  // automations. This step only links the transaction to that record — running
  // the automations again here would double every notification.
  await markBankTransactionCategorized(
    userId,
    transactionId,
    result.type,
    result.id,
  );

  // A synced transaction is money that already moved — so the first instance
  // of a payment made out of it starts life already ticked off.
  if (result.type === 'payment') {
    const [txn] = await getBankTransactionsByIds(userId, [transactionId]).catch(
      () => [],
    );
    if (txn) {
      const dueDate = new Date(txn.occurredAt).toISOString().slice(0, 10);
      if (dueDate <= new Date().toISOString().slice(0, 10)) {
        await markOccurrence(userId, {
          paymentId: result.id,
          dueDate,
          status: 'paid',
        }).catch(() => undefined);
      }
    }
  }

  revalidatePath('/integrations');
  revalidatePath('/plan');
  revalidateUserData(userId);
  return { ok: true };
}

export async function ignoreBankTransactionAction(
  transactionId: string,
): Promise<FormState> {
  const userId = await requireUserId();
  await markBankTransactionIgnored(userId, transactionId);
  revalidatePath('/integrations');
  revalidatePath('/plan');
  revalidateUserData(userId);
  return { ok: true };
}

export async function bulkIgnoreBankTransactionsAction(
  ids: string[],
): Promise<FormState & { ignored?: number }> {
  const userId = await requireUserId();
  const clean = (Array.isArray(ids) ? ids : []).filter(
    (id) => typeof id === 'string' && id.length > 0,
  );
  const ignored = await markBankTransactionsIgnored(
    userId,
    clean.slice(0, 500),
  );
  revalidatePath('/integrations');
  revalidatePath('/plan');
  revalidateUserData(userId);
  return { ok: true, ignored };
}
