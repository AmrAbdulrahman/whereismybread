'use server';

import { del, put } from '@vercel/blob';
import { fieldErrors, type FormState } from '@wib/auth';
import { requireUser } from '@wib/auth/server';
import {
  addDebtAttachment,
  addDebtEntry,
  createDebt,
  createDebtPerson,
  deleteDebt as deleteDebtRow,
  deleteDebtAttachment,
  deleteDebtEntry,
  deleteDebtPerson,
  getDebtRow,
  getDebtWithEntries,
  getDebtPersonById,
  listDebtsWithProgress,
  personHasDebts,
  reconcileDebtAttachments,
  setDebtSettled,
  updateDebt,
  updateDebtPerson,
} from '@wib/db';
import {
  debtProgress,
  goldUnitFor,
  parseGoldQuantity,
  parseMoneyInput,
} from '@wib/domain';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  isBlobUrl,
  resolveAttachmentType,
  type AttachmentDraft,
  type StoredAttachment,
} from '@wib/ui';
import { revalidatePath } from 'next/cache';
import { buildDebtView, getDebtPeople, loadPricing, personView } from './queries';
import { notifyPersonOfDebts } from './notify';
import {
  debtFormSchema,
  newDebtsSchema,
  personFormSchema,
  repaymentFormSchema,
  type DebtFormValues,
  type NewDebtsValues,
  type PersonFormValues,
  type RepaymentFormValues,
} from './schema';
import type { DebtView, PersonView } from './types';

/** Shared denomination fields, validated by `denomLineShape` in both schemas. */
interface DenomLine {
  amount: string;
  denomKind: string;
  currency: string;
  goldType: string;
  goldLabel: string | null;
  goldUnit: string;
}

/** Parse a line's typed amount + denomination into the columns `createDebt` writes. */
function denomColumns(line: DenomLine):
  | {
      ok: true;
      value: {
        principalMinor: number;
        denomKind: string;
        currency: string;
        goldType: string | null;
        goldLabel: string | null;
        goldUnit: string | null;
      };
    }
  | { ok: false } {
  const isGold = line.denomKind === 'gold';
  let principalMinor: number;
  try {
    principalMinor = isGold
      ? parseGoldQuantity(line.amount)
      : parseMoneyInput(line.amount, line.currency).minorUnits;
  } catch {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      principalMinor,
      denomKind: line.denomKind,
      currency: line.currency,
      goldType: isGold ? line.goldType : null,
      goldLabel: isGold ? line.goldLabel : null,
      goldUnit: isGold ? goldUnitFor(line.goldType, line.goldUnit) : null,
    },
  };
}

function revalidate(debtId?: string) {
  revalidatePath('/debts');
  if (debtId) revalidatePath(`/debts/${debtId}`);
}

function ownerName(name: string | null): string {
  return name?.trim() || 'Someone';
}

// --- people -------------------------------------------------------------

async function personViewById(
  userId: string,
  id: string,
): Promise<PersonView | null> {
  const [people, rows] = await Promise.all([
    getDebtPersonById(userId, id),
    listDebtsWithProgress(userId),
  ]);
  if (!people) return null;
  return {
    id: people.id,
    name: people.name,
    email: people.email,
    photoUrl: people.photoUrl,
    shareId: people.shareId,
    debtCount: rows.filter((d) => d.personId === id).length,
  };
}

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
    const person = (await personViewById(user.id, row.id)) ?? {
      id: row.id,
      name: row.name,
      email: row.email,
      photoUrl: row.photoUrl,
      shareId: row.shareId,
      debtCount: 0,
    };
    return { ok: true, person };
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

export async function deletePersonAction(id: string): Promise<FormState> {
  const user = await requireUser();
  if (await personHasDebts(user.id, id)) {
    return {
      ok: false,
      error: 'Delete or settle their debts first, then remove the person.',
    };
  }
  await deleteDebtPerson(user.id, id);
  revalidate();
  return { ok: true };
}

/** People + debt counts, for the manager's optimistic refresh. */
export async function listPeopleAction(): Promise<PersonView[]> {
  return getDebtPeople();
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

  const denom = denomColumns(parsed.data);
  if (!denom.ok) {
    return {
      ok: false,
      fieldErrors: {
        amount: [
          parsed.data.denomKind === 'gold'
            ? 'Not a valid quantity'
            : 'Not a valid amount',
        ],
      },
    };
  }

  const input = {
    personId: parsed.data.personId,
    direction: parsed.data.direction,
    ...denom.value,
    incurredOn: parsed.data.incurredOn,
    description: parsed.data.description ?? '',
    notes: parsed.data.notes,
  };

  const row = id
    ? await updateDebt(user.id, id, input)
    : await createDebt(user.id, input);
  if (!row) return { ok: false, error: 'Could not save the debt.' };

  // Files staged while creating — attach them to the fresh debt.
  if (!id) {
    const drafts = validDrafts(parsed.data.attachments);
    if (drafts.length > 0) {
      await reconcileDebtAttachments(user.id, row.id, null, drafts).catch(
        () => undefined,
      );
    }
  }

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

/**
 * Create several debts with one person in one go — each line its own
 * denomination + optional note + date. One notification email at the end.
 */
export async function saveDebtsAction(
  values: NewDebtsValues,
): Promise<FormState & { debtIds?: string[]; debts?: DebtView[] }> {
  const user = await requireUser();
  const parsed = newDebtsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const person = await getDebtPersonById(user.id, parsed.data.personId);
  if (!person) {
    return { ok: false, fieldErrors: { personId: ['Pick a person'] } };
  }

  const created: Awaited<ReturnType<typeof createDebt>>[] = [];
  for (const [i, line] of parsed.data.lines.entries()) {
    const denom = denomColumns(line);
    if (!denom.ok) {
      return {
        ok: false,
        fieldErrors: {
          [`lines.${i}.amount`]: [
            line.denomKind === 'gold'
              ? 'Not a valid quantity'
              : 'Not a valid amount',
          ],
        },
      };
    }
    const row = await createDebt(user.id, {
      personId: parsed.data.personId,
      direction: parsed.data.direction,
      ...denom.value,
      incurredOn: line.occurredOn,
      description: line.note ?? '',
      notes: null,
    });
    if (!row) return { ok: false, error: 'Could not save the debts.' };
    created.push(row);
  }

  const rows = created.filter((r): r is NonNullable<typeof r> => r != null);
  const debtIds = rows.map((r) => r.id);

  // Shape the created debts so the list can render them optimistically.
  const [px, existing] = await Promise.all([
    loadPricing(user.displayCurrency),
    listDebtsWithProgress(user.id),
  ]);
  const count = existing.filter((d) => d.personId === person.id).length;
  const pv = personView(person, count);
  const debts = rows.map((r) => buildDebtView(r, 0, 0, pv, px));

  revalidate();
  debtIds.forEach((id) => revalidate(id));
  await notifyPersonOfDebts(
    person,
    ownerName(user.name),
    debtIds.length === 1
      ? `${ownerName(user.name)} added a debt to keep things transparent between you.`
      : `${ownerName(user.name)} added ${debtIds.length} debts to keep things transparent between you.`,
  );
  return { ok: true, debtIds, debts };
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
    amountMinor =
      debt.denomKind === 'gold'
        ? parseGoldQuantity(parsed.data.amount)
        : parseMoneyInput(parsed.data.amount, debt.currency).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }

  const entry = await addDebtEntry(user.id, debtId, {
    amountMinor,
    note: parsed.data.note,
    occurredOn: parsed.data.occurredOn,
  });
  if (!entry) return { ok: false, error: 'Could not record the repayment.' };

  const drafts = validDrafts(parsed.data.attachments);
  if (drafts.length > 0) {
    await reconcileDebtAttachments(user.id, debtId, entry.id, drafts).catch(
      () => undefined,
    );
  }

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

// --- attachments -----------------------------------------------------

const SAFE_NAME = /[^\w.\- ]+/g;

/** Keep only well-formed drafts pointing at our blob store with an allowed type. */
function validDrafts(
  drafts: readonly AttachmentDraft[] | undefined,
): AttachmentDraft[] {
  return (Array.isArray(drafts) ? drafts : [])
    .filter(
      (d) =>
        d &&
        typeof d.url === 'string' &&
        isBlobUrl(d.url) &&
        typeof d.pathname === 'string' &&
        d.pathname.length > 0 &&
        typeof d.contentType === 'string' &&
        d.contentType in ATTACHMENT_TYPES &&
        Number.isFinite(d.size) &&
        d.size >= 0 &&
        d.size <= ATTACHMENT_MAX_BYTES,
    )
    .slice(0, 20)
    .map((d) => ({
      name: String(d.name || 'file').slice(0, 255),
      contentType: d.contentType,
      size: Math.round(d.size),
      url: d.url,
      pathname: d.pathname,
    }));
}

/**
 * Upload a file to Blob and, when the debt/entry already exists, record it
 * straight away. When staging (`debtId` null) the blob is stored and returned
 * as a draft that `saveDebtAction` / `recordRepaymentAction` attaches later.
 */
export async function uploadDebtAttachmentAction(
  debtId: string | null,
  entryId: string | null,
  form: FormData,
): Promise<
  | { ok: true; draft: AttachmentDraft; attachment: StoredAttachment | null }
  | { ok: false; error: string }
> {
  const user = await requireUser();

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file received.' };
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'That file is too large (max 10 MB).' };
  }
  const contentType = resolveAttachmentType(file.name, file.type);
  if (!contentType) {
    return { ok: false, error: 'Only images, PDFs and text files are allowed.' };
  }

  const safeName = file.name.replace(SAFE_NAME, '_').slice(0, 120) || 'file';
  const blob = await put(
    `debts/${user.id}/${crypto.randomUUID()}-${safeName}`,
    file,
    { access: 'private', contentType, addRandomSuffix: false },
  );

  const draft: AttachmentDraft = {
    name: file.name.slice(0, 255),
    contentType,
    size: file.size,
    url: blob.url,
    pathname: blob.pathname,
  };

  if (!debtId) return { ok: true, draft, attachment: null };

  const attachment = await addDebtAttachment(user.id, { debtId, entryId, ...draft });
  if (!attachment) {
    await del(blob.url).catch(() => undefined);
    return { ok: false, error: 'That debt no longer exists.' };
  }
  revalidate(debtId);
  return {
    ok: true,
    draft,
    attachment: {
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      url: attachment.url,
      pathname: attachment.pathname,
    },
  };
}

export async function removeDebtAttachmentAction(
  id: string,
): Promise<FormState> {
  const user = await requireUser();
  if (typeof id !== 'string' || !id) return { ok: false, error: 'Bad file.' };
  const row = await deleteDebtAttachment(user.id, id);
  if (row) await del(row.url).catch(() => undefined);
  if (row) revalidate(row.debtId);
  return { ok: true };
}

export async function discardDebtBlobsAction(
  urls: string[],
): Promise<{ ok: true }> {
  await requireUser();
  const safe = (Array.isArray(urls) ? urls : [])
    .filter((u) => typeof u === 'string' && isBlobUrl(u))
    .slice(0, 20);
  if (safe.length > 0) await del(safe).catch(() => undefined);
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
