'use server';

import { del, put } from '@vercel/blob';
import { fieldErrors, type FormState } from '@wib/auth';
import { requireUser } from '@wib/auth/server';
import {
  addDebtAttachment,
  addDebtEntry,
  addDebtLine,
  createDebt,
  createDebtPerson,
  createDebtThing,
  deleteDebt as deleteDebtRow,
  deleteDebtAttachment,
  deleteDebtEntry,
  deleteDebtLine,
  deleteDebtPerson,
  deleteDebtThing,
  getDebtPersonById,
  getDebtRow,
  getDebtWithDetail,
  listDebtThings,
  listDebtsWithLines,
  personHasDebts,
  reconcileDebtAttachments,
  setDebtSettled,
  thingInUse,
  updateDebt,
  updateDebtLine,
  updateDebtPerson,
  updateDebtThing,
  type DebtLineInput,
} from '@wib/db';
import {
  denomBalances,
  denomKey,
  goldUnitFor,
  parseGoldQuantity,
  parseMoneyInput,
  type DebtDenomination,
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
import {
  buildDebtView,
  denomOf,
  getDebtPeople,
  getDebtThings,
  loadPricing,
  personView,
} from './queries';
import { notifyPersonOfDebts } from './notify';
import {
  debtFormSchema,
  debtLineSchema,
  debtMetaSchema,
  personFormSchema,
  repaymentFormSchema,
  thingFormSchema,
  type DebtFormValues,
  type DebtLineValue,
  type DebtMetaValues,
  type PersonFormValues,
  type RepaymentFormValues,
  type ThingFormValues,
} from './schema';
import type { DebtView, PersonView, ThingView } from './types';

/** The denomination + quantity fields every row / repayment form submits. */
interface DenomLine {
  amount: string;
  denomKind: string;
  currency: string;
  goldType: string;
  thingId: string | null;
  thingName: string | null;
  goldUnit: string;
}

const BLANK_DENOM: Omit<DebtLineInput, 'amountMinor' | 'denomKind'> = {
  currency: 'EUR',
  goldType: null,
  goldLabel: null,
  goldUnit: null,
  thingId: null,
  thingName: null,
};

/** Parse a form line's typed amount + denomination into the DB columns. */
function parseDenomLine(line: DenomLine): DebtLineInput | null {
  const isQty = line.denomKind === 'gold' || line.denomKind === 'thing';
  let amountMinor: number;
  try {
    amountMinor = isQty
      ? parseGoldQuantity(line.amount)
      : parseMoneyInput(line.amount, line.currency).minorUnits;
  } catch {
    return null;
  }
  if (line.denomKind === 'thing') {
    if (!line.thingId) return null;
    return {
      ...BLANK_DENOM,
      amountMinor,
      denomKind: 'thing',
      thingId: line.thingId,
      thingName: line.thingName,
      goldUnit: line.goldUnit === 'piece' ? 'piece' : 'g',
    };
  }
  if (line.denomKind === 'gold') {
    return {
      ...BLANK_DENOM,
      amountMinor,
      denomKind: 'gold',
      goldType: line.goldType,
      goldUnit: goldUnitFor(line.goldType, line.goldUnit),
    };
  }
  return {
    ...BLANK_DENOM,
    amountMinor,
    denomKind: 'money',
    currency: line.currency,
  };
}

/** A resolved denomination back into the DB columns (for covering repayments). */
function denomColumns(d: DebtDenomination): Omit<DebtLineInput, 'amountMinor'> {
  if (d.kind === 'money') {
    return { ...BLANK_DENOM, denomKind: 'money', currency: d.currency };
  }
  if (d.kind === 'thing') {
    return {
      ...BLANK_DENOM,
      denomKind: 'thing',
      thingId: d.thingId,
      thingName: d.thingName,
      goldUnit: d.unit,
    };
  }
  return {
    ...BLANK_DENOM,
    denomKind: 'gold',
    goldType: d.goldType,
    goldLabel: d.goldLabel,
    goldUnit: d.unit,
  };
}

const amountErrorFor = (denomKind: string) =>
  denomKind === 'money' ? 'Not a valid amount' : 'Not a valid quantity';

function revalidate(debtId?: string) {
  revalidatePath('/debts');
  if (debtId) revalidatePath(`/debts/${debtId}`);
}

function ownerName(name: string | null): string {
  return name?.trim() || 'Someone';
}

/**
 * Re-derive the whole-debt `settled_at` flag from the current balances: set it
 * when every denomination is clear, clear it when something is outstanding
 * again (a new row, a deleted repayment).
 */
async function reevalSettled(userId: string, debtId: string): Promise<void> {
  const detail = await getDebtWithDetail(userId, debtId);
  if (!detail) return;
  const balances = denomBalances(
    detail.lines.map((l) => ({ denom: denomOf(l), amountMinor: l.amountMinor })),
    detail.entries.map((e) => ({
      denom: denomOf(e),
      amountMinor: e.amountMinor,
    })),
  );
  const allClear =
    balances.length > 0 && balances.every((b) => b.outstandingMinor <= 0);
  if (allClear && detail.settledAt == null) {
    await setDebtSettled(userId, debtId, true);
  } else if (!allClear && detail.settledAt != null) {
    await setDebtSettled(userId, debtId, false);
  }
}

// --- people -------------------------------------------------------------

async function personViewById(
  userId: string,
  id: string,
): Promise<PersonView | null> {
  const [people, rows] = await Promise.all([
    getDebtPersonById(userId, id),
    listDebtsWithLines(userId),
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

// --- things ----------------------------------------------------------

export async function saveThingAction(
  id: string | null,
  values: ThingFormValues,
): Promise<FormState & { thing?: ThingView }> {
  const user = await requireUser();
  const parsed = thingFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  let valueMinor = 0;
  const raw = parsed.data.value.trim();
  if (raw && raw !== '0') {
    try {
      valueMinor = Math.max(
        0,
        parseMoneyInput(raw, parsed.data.valueCurrency).minorUnits,
      );
    } catch {
      return { ok: false, fieldErrors: { value: ['Not a valid amount'] } };
    }
  }
  const input = {
    name: parsed.data.name,
    logoUrl: parsed.data.logoUrl,
    unit: parsed.data.unit,
    valueMinor,
    valueCurrency: parsed.data.valueCurrency,
  };
  try {
    const row = id
      ? await updateDebtThing(user.id, id, input)
      : await createDebtThing(user.id, input);
    if (!row) return { ok: false, error: 'That thing no longer exists.' };
    revalidate();
    const uses = id ? (await thingInUse(user.id, row.id)) ? 1 : 0 : 0;
    return {
      ok: true,
      thing: {
        id: row.id,
        name: row.name,
        logoUrl: row.logoUrl,
        unit: row.unit === 'piece' ? 'piece' : 'g',
        valueMinor: row.valueMinor,
        valueCurrency: row.valueCurrency,
        useCount: uses,
      },
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return {
        ok: false,
        fieldErrors: { name: ['You already have a thing with that name'] },
      };
    }
    throw error;
  }
}

export async function deleteThingAction(id: string): Promise<FormState> {
  const user = await requireUser();
  if (await thingInUse(user.id, id)) {
    return {
      ok: false,
      error: 'Remove it from every debt first, then delete the thing.',
    };
  }
  await deleteDebtThing(user.id, id);
  revalidate();
  return { ok: true };
}

/** Things + use counts, for the manager's optimistic refresh + the denom picker. */
export async function listThingsAction(): Promise<ThingView[]> {
  return getDebtThings();
}

// --- debts -------------------------------------------------------------

/**
 * Create a debt basket (with its rows), or edit an existing debt's metadata.
 * On create, returns the built `DebtView` so the list can show it optimistically.
 */
export async function saveDebtAction(
  id: string | null,
  values: DebtFormValues | DebtMetaValues,
): Promise<FormState & { debtId?: string; debt?: DebtView }> {
  const user = await requireUser();

  if (id) {
    const parsed = debtMetaSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, fieldErrors: fieldErrors(parsed.error) };
    }
    const person = await getDebtPersonById(user.id, parsed.data.personId);
    if (!person) {
      return { ok: false, fieldErrors: { personId: ['Pick a person'] } };
    }
    const row = await updateDebt(user.id, id, {
      personId: parsed.data.personId,
      direction: parsed.data.direction,
      description: parsed.data.description ?? '',
      notes: parsed.data.notes,
      incurredOn: parsed.data.incurredOn,
    });
    if (!row) return { ok: false, error: 'Could not save the debt.' };
    revalidate(id);
    await notifyPersonOfDebts(
      person,
      ownerName(user.name),
      `${ownerName(user.name)} updated a debt you share.`,
    );
    return { ok: true, debtId: id };
  }

  const parsed = debtFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const person = await getDebtPersonById(user.id, parsed.data.personId);
  if (!person) {
    return { ok: false, fieldErrors: { personId: ['Pick a person'] } };
  }

  const lines: DebtLineInput[] = [];
  for (const [i, line] of parsed.data.lines.entries()) {
    const parsedLine = parseDenomLine(line);
    if (!parsedLine) {
      return {
        ok: false,
        fieldErrors: { [`lines.${i}.amount`]: [amountErrorFor(line.denomKind)] },
      };
    }
    lines.push(parsedLine);
  }

  const row = await createDebt(user.id, {
    personId: parsed.data.personId,
    direction: parsed.data.direction,
    description: parsed.data.description ?? '',
    notes: parsed.data.notes,
    incurredOn: parsed.data.incurredOn,
    lines,
  });
  if (!row) return { ok: false, error: 'Could not save the debt.' };

  const drafts = validDrafts(parsed.data.attachments);
  if (drafts.length > 0) {
    await reconcileDebtAttachments(user.id, row.id, null, drafts).catch(
      () => undefined,
    );
  }

  revalidate(row.id);

  const [px, detail] = await Promise.all([
    listDebtThings(user.id).then((t) =>
      loadPricing(user.displayCurrency, t),
    ),
    getDebtWithDetail(user.id, row.id),
  ]);
  const debt = detail
    ? buildDebtView(
        detail,
        detail.lines,
        detail.entries,
        personView(detail.person),
        px,
      )
    : undefined;

  await notifyPersonOfDebts(
    person,
    ownerName(user.name),
    `${ownerName(user.name)} added a debt to keep things transparent between you.`,
  );
  return { ok: true, debtId: row.id, debt };
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
  const detail = await getDebtWithDetail(user.id, debtId);
  if (!detail) return { ok: false, error: 'That debt no longer exists.' };

  if (settled) {
    const balances = denomBalances(
      detail.lines.map((l) => ({
        denom: denomOf(l),
        amountMinor: l.amountMinor,
      })),
      detail.entries.map((e) => ({
        denom: denomOf(e),
        amountMinor: e.amountMinor,
      })),
    );
    const today = new Date().toISOString().slice(0, 10);
    for (const b of balances) {
      if (b.outstandingMinor <= 0) continue;
      await addDebtEntry(user.id, debtId, {
        amountMinor: b.outstandingMinor,
        note: 'Settled in full',
        occurredOn: today,
        ...denomColumns(b.denom),
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

/** Record a covering repayment for one denomination's outstanding balance. */
export async function settleDenomAction(
  debtId: string,
  denomKeyStr: string,
): Promise<FormState> {
  const user = await requireUser();
  const detail = await getDebtWithDetail(user.id, debtId);
  if (!detail) return { ok: false, error: 'That debt no longer exists.' };

  const balances = denomBalances(
    detail.lines.map((l) => ({ denom: denomOf(l), amountMinor: l.amountMinor })),
    detail.entries.map((e) => ({
      denom: denomOf(e),
      amountMinor: e.amountMinor,
    })),
  );
  const balance = balances.find((b) => denomKey(b.denom) === denomKeyStr);
  if (!balance) return { ok: false, error: 'No such balance.' };

  if (balance.outstandingMinor > 0) {
    await addDebtEntry(user.id, debtId, {
      amountMinor: balance.outstandingMinor,
      note: 'Settled',
      occurredOn: new Date().toISOString().slice(0, 10),
      ...denomColumns(balance.denom),
    });
  }
  await reevalSettled(user.id, debtId);
  revalidate(debtId);
  await notifyPersonOfDebts(
    detail.person,
    ownerName(user.name),
    `${ownerName(user.name)} settled a balance on a debt.`,
  );
  return { ok: true };
}

// --- rows -------------------------------------------------------------

export async function addLineAction(
  debtId: string,
  values: DebtLineValue,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = debtLineSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const line = parseDenomLine(parsed.data);
  if (!line) {
    return {
      ok: false,
      fieldErrors: { amount: [amountErrorFor(parsed.data.denomKind)] },
    };
  }
  const row = await addDebtLine(user.id, debtId, line);
  if (!row) return { ok: false, error: 'That debt no longer exists.' };
  await reevalSettled(user.id, debtId);
  revalidate(debtId);
  await notifyDebtChanged(user.id, user.name, debtId, 'added a row to a debt');
  return { ok: true };
}

export async function updateLineAction(
  debtId: string,
  lineId: string,
  values: DebtLineValue,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = debtLineSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const line = parseDenomLine(parsed.data);
  if (!line) {
    return {
      ok: false,
      fieldErrors: { amount: [amountErrorFor(parsed.data.denomKind)] },
    };
  }
  const row = await updateDebtLine(user.id, lineId, line);
  if (!row) return { ok: false, error: 'That row no longer exists.' };
  await reevalSettled(user.id, debtId);
  revalidate(debtId);
  await notifyDebtChanged(user.id, user.name, debtId, 'edited a debt');
  return { ok: true };
}

export async function deleteLineAction(
  debtId: string,
  lineId: string,
): Promise<FormState> {
  const user = await requireUser();
  await deleteDebtLine(user.id, lineId);
  await reevalSettled(user.id, debtId);
  revalidate(debtId);
  await notifyDebtChanged(user.id, user.name, debtId, 'removed a row from a debt');
  return { ok: true };
}

async function notifyDebtChanged(
  userId: string,
  name: string | null,
  debtId: string,
  what: string,
): Promise<void> {
  const detail = await getDebtWithDetail(userId, debtId);
  if (!detail) return;
  await notifyPersonOfDebts(
    detail.person,
    ownerName(name),
    `${ownerName(name)} ${what} you share.`,
  );
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

  const line = parseDenomLine(parsed.data);
  if (!line) {
    return {
      ok: false,
      fieldErrors: { amount: [amountErrorFor(parsed.data.denomKind)] },
    };
  }

  const entry = await addDebtEntry(user.id, debtId, {
    amountMinor: line.amountMinor,
    note: parsed.data.note,
    occurredOn: parsed.data.occurredOn,
    denomKind: line.denomKind,
    currency: line.currency,
    goldType: line.goldType,
    goldLabel: line.goldLabel,
    goldUnit: line.goldUnit,
    thingId: line.thingId,
    thingName: line.thingName,
  });
  if (!entry) return { ok: false, error: 'Could not record the repayment.' };

  const drafts = validDrafts(parsed.data.attachments);
  if (drafts.length > 0) {
    await reconcileDebtAttachments(user.id, debtId, entry.id, drafts).catch(
      () => undefined,
    );
  }

  await reevalSettled(user.id, debtId);
  const detail = await getDebtWithDetail(user.id, debtId);
  if (detail) {
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
  await reevalSettled(user.id, debtId);
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
  const anyDebt = (await listDebtsWithLines(user.id)).some(
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
