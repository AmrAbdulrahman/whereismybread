'use server';

import { requireUserId } from '@wib/auth/server';
import type { FormState } from '@wib/auth';
import {
  markBankTransactionCategorized,
  markBankTransactionIgnored,
  markBankTransactionsIgnored,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import { revalidateUserData } from './revalidate';

export async function categorizeBankTransactionAction(
  transactionId: string,
  result: { type: 'expense' | 'payment'; id: string },
): Promise<FormState> {
  const userId = await requireUserId();
  await markBankTransactionCategorized(
    userId,
    transactionId,
    result.type,
    result.id,
  );
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
