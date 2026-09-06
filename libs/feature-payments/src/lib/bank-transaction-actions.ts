'use server';

import { requireUserId } from '@wib/auth/server';
import type { FormState } from '@wib/auth';
import {
  markBankTransactionCategorized,
  markBankTransactionIgnored,
} from '@wib/db';
import { revalidatePath } from 'next/cache';

export async function categorizeBankTransactionAction(
  transactionId: string,
  result: { type: 'expense' | 'payment'; id: string },
): Promise<FormState> {
  const userId = await requireUserId();
  await markBankTransactionCategorized(userId, transactionId, result.type, result.id);
  revalidatePath('/transactions');
  revalidatePath('/plan');
  return { ok: true };
}

export async function ignoreBankTransactionAction(
  transactionId: string,
): Promise<FormState> {
  const userId = await requireUserId();
  await markBankTransactionIgnored(userId, transactionId);
  revalidatePath('/transactions');
  revalidatePath('/plan');
  return { ok: true };
}
