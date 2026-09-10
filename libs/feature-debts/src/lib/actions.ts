'use server';

import { fieldErrors, type FormState } from '@wib/auth';
import { requireUser } from '@wib/auth/server';
import {
  addDebtEntry,
  createDebt,
  createDebtPerson,
  deleteDebt as deleteDebtRow,
  deleteDebtEntry,
  getDebtRow,
  getDebtWithEntries,
  getDebtPersonById,
  listDebtsWithProgress,
  setDebtSettled,
  updateDebt,
  updateDebtPerson,
} from '@wib/db';
import { debtProgress, parseMoneyInput } from '@wib/domain';
import { revalidatePath } from 'next/cache';
import { notifyPersonOfDebts } from './notify';
import {
  debtFormSchema,
  personFormSchema,
  repaymentFormSchema,
  type DebtFormValues,
  type PersonFormValues,
  type RepaymentFormValues,
} from './schema';
import type { PersonView } from './types';

function revalidate(debtId?: string) {
  revalidatePath('/debts');
  if (debtId) revalidatePath(`/debts/${debtId}`);
}

function ownerName(name: string | null): string {
  return name?.trim() || 'Someone';
}

// --- people -------------------------------------------------------------

export async function savePersonAction(
  id: string | null,
  values: PersonFormValues,
): Promise<FormState & { person?: PersonView }> {
  const user = await requireUser();
  const parsed = personFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const input = {
    name: parsed.data.name,
    email: parsed.data.email,
    photoUrl: parsed.data.photoUrl,
  };
  try {
    const row = id
      ? await updateDebtPerson(user.id, id, input)
      : await createDebtPerson(user.id, input);
    if (!row) return { ok: false, error: 'That person no longer exists.' };
    revalidate();
    return {
      ok: true,
      person: {
        id: row.id,
        name: row.name,
        email: row.email,
        photoUrl: row.photoUrl,
        shareId: row.shareId,
      },
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return {
        ok: false,
        fieldErrors: { email: ['You already track debts with that email'] },
      };
    }
    throw error;
  }
}

// --- debts -------------------------------------------------------------

export async function saveDebtAction(
  id: string | null,
  values: DebtFormValues,
): Promise<FormState & { debtId?: string }> {
  const user = await requireUser();
  const parsed = debtFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const person = await getDebtPersonById(user.id, parsed.data.personId);
  if (!person) {
    return { ok: false, fieldErrors: { personId: ['Pick a person'] } };
  }

  let principalMinor: number;
  try {
    principalMinor = parseMoneyInput(
      parsed.data.amount,
      parsed.data.currency,
    ).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }

  const input = {
    personId: parsed.data.personId,
    direction: parsed.data.direction,
    principalMinor,
    currency: parsed.data.currency,
    description: parsed.data.description ?? '',
    notes: parsed.data.notes,
  };

  const row = id
    ? await updateDebt(user.id, id, input)
    : await createDebt(user.id, input);
  if (!row) return { ok: false, error: 'Could not save the debt.' };

  revalidate(row.id);
  await notifyPersonOfDebts(
    person,
    ownerName(user.name),
    id
      ? `${ownerName(user.name)} updated a debt you share.`
      : `${ownerName(user.name)} added a debt to keep things transparent between you.`,
  );
  return { ok: true, debtId: row.id };
}

export async function deleteDebtAction(id: string): Promise<FormState> {
  const user = await requireUser();
  await deleteDebtRow(user.id, id);
  revalidate(id);
  return { ok: true };
}

export async function settleDebtAction(
  debtId: string,
  settled: boolean,
): Promise<FormState> {
  const user = await requireUser();
  const detail = await getDebtWithEntries(user.id, debtId);
  if (!detail) return { ok: false, error: 'That debt no longer exists.' };

  if (settled) {
    const { remainingMinor } = debtProgress({
      principalMinor: detail.principalMinor,
      paidMinor: detail.paidMinor,
    });
    if (remainingMinor > 0) {
      await addDebtEntry(user.id, debtId, {
        amountMinor: remainingMinor,
        note: 'Settled in full',
        occurredOn: new Date().toISOString().slice(0, 10),
      });
    }
    await setDebtSettled(user.id, debtId, true);
  } else {
    await setDebtSettled(user.id, debtId, false);
  }

  revalidate(debtId);
  await notifyPersonOfDebts(
    detail.person,
    ownerName(user.name),
    settled
      ? `${ownerName(user.name)} marked a debt settled.`
      : `${ownerName(user.name)} reopened a debt.`,
  );
  return { ok: true };
}

// --- repayments -------------------------------------------------------

export async function recordRepaymentAction(
  debtId: string,
  values: RepaymentFormValues,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = repaymentFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const debt = await getDebtRow(user.id, debtId);
  if (!debt) return { ok: false, error: 'That debt no longer exists.' };

  let amountMinor: number;
  try {
    amountMinor = parseMoneyInput(parsed.data.amount, debt.currency).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }

  const entry = await addDebtEntry(user.id, debtId, {
    amountMinor,
    note: parsed.data.note,
    occurredOn: parsed.data.occurredOn,
  });
  if (!entry) return { ok: false, error: 'Could not record the repayment.' };

  const detail = await getDebtWithEntries(user.id, debtId);
  if (detail) {
    const { settled } = debtProgress({
      principalMinor: detail.principalMinor,
      paidMinor: detail.paidMinor,
    });
    if (settled && detail.settledAt == null) {
      await setDebtSettled(user.id, debtId, true);
    }
    await notifyPersonOfDebts(
      detail.person,
      ownerName(user.name),
      `${ownerName(user.name)} recorded a repayment.`,
    );
  }

  revalidate(debtId);
  return { ok: true };
}

export async function deleteRepaymentAction(
  debtId: string,
  entryId: string,
): Promise<FormState> {
  const user = await requireUser();
  await deleteDebtEntry(user.id, entryId);
  const detail = await getDebtWithEntries(user.id, debtId);
  if (detail && detail.settledAt != null) {
    const { settled } = debtProgress({
      principalMinor: detail.principalMinor,
      paidMinor: detail.paidMinor,
    });
    if (!settled) await setDebtSettled(user.id, debtId, false);
  }
  revalidate(debtId);
  return { ok: true };
}

// --- share link ------------------------------------------------------

export async function resendPersonLinkAction(
  personId: string,
): Promise<FormState> {
  const user = await requireUser();
  const person = await getDebtPersonById(user.id, personId);
  if (!person) return { ok: false, error: 'That person no longer exists.' };
  const anyDebt = (await listDebtsWithProgress(user.id)).some(
    (d) => d.personId === personId,
  );
  if (!anyDebt) {
    return { ok: false, error: 'Add a debt for them first.' };
  }
  await notifyPersonOfDebts(
    person,
    ownerName(user.name),
    `${ownerName(user.name)} shared your debt summary again.`,
  );
  return { ok: true, message: `Sent to ${person.email}.` };
}
