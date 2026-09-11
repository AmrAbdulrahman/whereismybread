import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { DebtDirection } from '@wib/domain';
import { getDb } from '../client';
import {
  debtAttachments,
  debtEntries,
  debtGrants,
  debtLines,
  debtOtps,
  debtPeople,
  debts,
  type Debt,
  type DebtAttachment,
  type DebtEntry,
  type DebtGrant,
  type DebtLine,
  type DebtOtp,
  type DebtPerson,
} from '../schema/debts';

// --- people ---------------------------------------------------------------

export interface DebtPersonInput {
  name: string;
  email: string;
  photoUrl: string | null;
}

export async function listDebtPeople(userId: string): Promise<DebtPerson[]> {
  return getDb()
    .select()
    .from(debtPeople)
    .where(eq(debtPeople.userId, userId))
    .orderBy(asc(debtPeople.name));
}

export async function getDebtPersonById(
  userId: string,
  id: string,
): Promise<DebtPerson | undefined> {
  const rows = await getDb()
    .select()
    .from(debtPeople)
    .where(and(eq(debtPeople.id, id), eq(debtPeople.userId, userId)))
    .limit(1);
  return rows[0];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public lookup by the shared-page slug — no user scoping. */
export async function getDebtPersonByShareId(
  shareId: string,
): Promise<DebtPerson | undefined> {
  if (!UUID_RE.test(shareId)) return undefined;
  const rows = await getDb()
    .select()
    .from(debtPeople)
    .where(eq(debtPeople.shareId, shareId))
    .limit(1);
  return rows[0];
}

export async function getDebtPersonByEmail(
  userId: string,
  email: string,
): Promise<DebtPerson | undefined> {
  const rows = await getDb()
    .select()
    .from(debtPeople)
    .where(
      and(
        eq(debtPeople.userId, userId),
        sql`lower(${debtPeople.email}) = lower(${email})`,
      ),
    )
    .limit(1);
  return rows[0];
}

export async function createDebtPerson(
  userId: string,
  input: DebtPersonInput,
): Promise<DebtPerson> {
  const rows = await getDb()
    .insert(debtPeople)
    .values({
      userId,
      name: input.name.trim(),
      email: input.email.trim(),
      photoUrl: input.photoUrl,
    })
    .returning();
  if (!rows[0]) throw new Error('createDebtPerson: no row');
  return rows[0];
}

export async function updateDebtPerson(
  userId: string,
  id: string,
  input: DebtPersonInput,
): Promise<DebtPerson | undefined> {
  const rows = await getDb()
    .update(debtPeople)
    .set({
      name: input.name.trim(),
      email: input.email.trim(),
      photoUrl: input.photoUrl,
      updatedAt: new Date(),
    })
    .where(and(eq(debtPeople.id, id), eq(debtPeople.userId, userId)))
    .returning();
  return rows[0];
}

// --- debts ---------------------------------------------------------------

/** One principal row of a debt basket — a quantity in one denomination. */
export interface DebtLineInput {
  denomKind: string;
  currency: string;
  goldType: string | null;
  goldLabel: string | null;
  goldUnit: string | null;
  thingId: string | null;
  thingName: string | null;
  /** Minor currency units, or thousandths of a gram/piece for gold/things. */
  amountMinor: number;
}

export interface DebtInput {
  personId: string;
  direction: DebtDirection;
  description: string;
  notes: string | null;
  /** `YYYY-MM-DD` — when the debt was incurred. */
  incurredOn: string;
  /** The principal rows. `updateDebt` ignores this (edit rows via the line ops). */
  lines: DebtLineInput[];
}

/** `true` when the person still has at least one debt (blocks deletion). */
export async function personHasDebts(
  userId: string,
  personId: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: debts.id })
    .from(debts)
    .where(and(eq(debts.userId, userId), eq(debts.personId, personId)))
    .limit(1);
  return rows.length > 0;
}

export async function deleteDebtPerson(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(debtPeople)
    .where(and(eq(debtPeople.id, id), eq(debtPeople.userId, userId)));
}

async function ownsPerson(userId: string, personId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: debtPeople.id })
    .from(debtPeople)
    .where(and(eq(debtPeople.id, personId), eq(debtPeople.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function ownsDebt(userId: string, debtId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: debts.id })
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export interface DebtWithLines extends Debt {
  lines: DebtLine[];
  entries: DebtEntry[];
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

/** Every debt the user owns, each with its principal rows + repayments. */
export async function listDebtsWithLines(
  userId: string,
): Promise<DebtWithLines[]> {
  const rows = await getDb()
    .select()
    .from(debts)
    .where(eq(debts.userId, userId))
    .orderBy(desc(debts.createdAt));
  const ids = rows.map((d) => d.id);
  const [lines, entries] = ids.length
    ? await Promise.all([
        getDb()
          .select()
          .from(debtLines)
          .where(inArray(debtLines.debtId, ids))
          .orderBy(asc(debtLines.sortOrder), asc(debtLines.createdAt)),
        getDb()
          .select()
          .from(debtEntries)
          .where(inArray(debtEntries.debtId, ids))
          .orderBy(desc(debtEntries.occurredOn), desc(debtEntries.createdAt)),
      ])
    : [[], []];
  const linesByDebt = groupBy(lines, (l) => l.debtId);
  const entriesByDebt = groupBy(entries, (e) => e.debtId);
  return rows.map((d) => ({
    ...d,
    lines: linesByDebt.get(d.id) ?? [],
    entries: entriesByDebt.get(d.id) ?? [],
  }));
}

export type DebtEntryWithAttachments = DebtEntry & {
  attachments: DebtAttachment[];
};

export interface DebtWithDetail extends Debt {
  person: DebtPerson;
  lines: DebtLine[];
  entries: DebtEntryWithAttachments[];
  /** Debt-level attachments (`entry_id` null). */
  attachments: DebtAttachment[];
}

function groupAttachments(
  rows: DebtAttachment[],
): { debt: DebtAttachment[]; byEntry: Map<string, DebtAttachment[]> } {
  const debt: DebtAttachment[] = [];
  const byEntry = new Map<string, DebtAttachment[]>();
  for (const a of rows) {
    if (a.entryId == null) {
      debt.push(a);
    } else {
      const list = byEntry.get(a.entryId) ?? [];
      list.push(a);
      byEntry.set(a.entryId, list);
    }
  }
  return { debt, byEntry };
}

export async function getDebtWithDetail(
  userId: string,
  id: string,
): Promise<DebtWithDetail | undefined> {
  const rows = await getDb()
    .select({ debt: debts, person: debtPeople })
    .from(debts)
    .innerJoin(debtPeople, eq(debtPeople.id, debts.personId))
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const [lines, entries, attachmentRows] = await Promise.all([
    getDb()
      .select()
      .from(debtLines)
      .where(eq(debtLines.debtId, id))
      .orderBy(asc(debtLines.sortOrder), asc(debtLines.createdAt)),
    getDb()
      .select()
      .from(debtEntries)
      .where(eq(debtEntries.debtId, id))
      .orderBy(desc(debtEntries.occurredOn), desc(debtEntries.createdAt)),
    getDb()
      .select()
      .from(debtAttachments)
      .where(eq(debtAttachments.debtId, id))
      .orderBy(asc(debtAttachments.createdAt)),
  ]);
  const { debt: debtAtt, byEntry } = groupAttachments(attachmentRows);
  return {
    ...row.debt,
    person: row.person,
    lines,
    entries: entries.map((e) => ({
      ...e,
      attachments: byEntry.get(e.id) ?? [],
    })),
    attachments: debtAtt,
  };
}

/** Bare row (no joins), for ownership re-checks in actions. */
export async function getDebtRow(
  userId: string,
  id: string,
): Promise<Debt | undefined> {
  const rows = await getDb()
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .limit(1);
  return rows[0];
}

function lineValues(debtId: string, userId: string, l: DebtLineInput, i: number) {
  return {
    debtId,
    userId,
    denomKind: l.denomKind,
    currency: l.currency,
    goldType: l.goldType,
    goldLabel: l.goldLabel,
    goldUnit: l.goldUnit,
    thingId: l.thingId,
    thingName: l.thingName,
    amountMinor: l.amountMinor,
    sortOrder: i,
  };
}

export async function createDebt(
  userId: string,
  input: DebtInput,
): Promise<Debt | null> {
  if (!(await ownsPerson(userId, input.personId))) return null;
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .insert(debts)
      .values({
        userId,
        personId: input.personId,
        direction: input.direction,
        description: input.description.trim(),
        notes: input.notes,
        incurredOn: input.incurredOn,
      })
      .returning();
    const debt = rows[0];
    if (!debt) return null;
    if (input.lines.length > 0) {
      await tx
        .insert(debtLines)
        .values(
          input.lines.map((l, i) => lineValues(debt.id, userId, l, i)),
        );
    }
    return debt;
  });
}

/** Update a debt's metadata only — rows are managed via the line ops. */
export async function updateDebt(
  userId: string,
  id: string,
  input: Pick<
    DebtInput,
    'personId' | 'direction' | 'description' | 'notes' | 'incurredOn'
  >,
): Promise<Debt | null> {
  if (!(await ownsPerson(userId, input.personId))) return null;
  const rows = await getDb()
    .update(debts)
    .set({
      personId: input.personId,
      direction: input.direction,
      description: input.description.trim(),
      notes: input.notes,
      incurredOn: input.incurredOn,
      updatedAt: new Date(),
    })
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDebt(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)));
}

/** Mark a debt settled (or reopen it). Returns the updated row. */
export async function setDebtSettled(
  userId: string,
  id: string,
  settled: boolean,
): Promise<Debt | undefined> {
  const rows = await getDb()
    .update(debts)
    .set({ settledAt: settled ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .returning();
  return rows[0];
}

// --- lines (the principal rows) --------------------------------------

export async function addDebtLine(
  userId: string,
  debtId: string,
  input: DebtLineInput,
): Promise<DebtLine | null> {
  if (!(await ownsDebt(userId, debtId))) return null;
  const maxRow = await getDb()
    .select({ n: sql<number>`coalesce(max(${debtLines.sortOrder}), -1)::int` })
    .from(debtLines)
    .where(eq(debtLines.debtId, debtId));
  const next = (maxRow[0]?.n ?? -1) + 1;
  const rows = await getDb()
    .insert(debtLines)
    .values(lineValues(debtId, userId, input, next))
    .returning();
  return rows[0] ?? null;
}

export async function updateDebtLine(
  userId: string,
  lineId: string,
  input: DebtLineInput,
): Promise<DebtLine | null> {
  const rows = await getDb()
    .update(debtLines)
    .set({
      denomKind: input.denomKind,
      currency: input.currency,
      goldType: input.goldType,
      goldLabel: input.goldLabel,
      goldUnit: input.goldUnit,
      amountMinor: input.amountMinor,
    })
    .where(and(eq(debtLines.id, lineId), eq(debtLines.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDebtLine(
  userId: string,
  lineId: string,
): Promise<void> {
  await getDb()
    .delete(debtLines)
    .where(and(eq(debtLines.id, lineId), eq(debtLines.userId, userId)));
}

// --- entries (repayments) ----------------------------------------------

export interface DebtEntryInput {
  amountMinor: number;
  note: string | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  denomKind: string;
  currency: string;
  goldType: string | null;
  goldLabel: string | null;
  goldUnit: string | null;
  thingId: string | null;
  thingName: string | null;
}

export async function addDebtEntry(
  userId: string,
  debtId: string,
  input: DebtEntryInput,
): Promise<DebtEntry | null> {
  const debt = await getDebtRow(userId, debtId);
  if (!debt) return null;
  const rows = await getDb()
    .insert(debtEntries)
    .values({
      debtId,
      userId,
      amountMinor: input.amountMinor,
      note: input.note,
      occurredOn: input.occurredOn,
      denomKind: input.denomKind,
      currency: input.currency,
      goldType: input.goldType,
      goldLabel: input.goldLabel,
      goldUnit: input.goldUnit,
      thingId: input.thingId,
      thingName: input.thingName,
    })
    .returning();
  return rows[0] ?? null;
}

export async function deleteDebtEntry(
  userId: string,
  entryId: string,
): Promise<void> {
  await getDb()
    .delete(debtEntries)
    .where(and(eq(debtEntries.id, entryId), eq(debtEntries.userId, userId)));
}

// --- external shared view --------------------------------------------

export interface SharedPersonDebts {
  person: DebtPerson;
  debts: Array<
    Debt & {
      lines: DebtLine[];
      entries: DebtEntryWithAttachments[];
      attachments: DebtAttachment[];
    }
  >;
}

/** Everything the OTP-verified shared page shows for one person. */
export async function getSharedPersonDebts(
  shareId: string,
): Promise<SharedPersonDebts | undefined> {
  const person = await getDebtPersonByShareId(shareId);
  if (!person) return undefined;
  const rows = await getDb()
    .select()
    .from(debts)
    .where(eq(debts.personId, person.id))
    .orderBy(desc(debts.createdAt));
  const ids = rows.map((d) => d.id);
  const [lines, entries, attachmentRows] = ids.length
    ? await Promise.all([
        getDb()
          .select()
          .from(debtLines)
          .where(inArray(debtLines.debtId, ids))
          .orderBy(asc(debtLines.sortOrder), asc(debtLines.createdAt)),
        getDb()
          .select()
          .from(debtEntries)
          .where(inArray(debtEntries.debtId, ids))
          .orderBy(desc(debtEntries.occurredOn), desc(debtEntries.createdAt)),
        getDb()
          .select()
          .from(debtAttachments)
          .where(inArray(debtAttachments.debtId, ids))
          .orderBy(asc(debtAttachments.createdAt)),
      ])
    : [[], [], []];
  const linesByDebt = groupBy(lines, (l) => l.debtId);
  const entriesByDebt = groupBy(entries, (e) => e.debtId);
  const attByDebt = groupBy(attachmentRows, (a) => a.debtId);
  return {
    person,
    debts: rows.map((d) => {
      const { debt: debtAtt, byEntry } = groupAttachments(
        attByDebt.get(d.id) ?? [],
      );
      return {
        ...d,
        lines: linesByDebt.get(d.id) ?? [],
        entries: (entriesByDebt.get(d.id) ?? []).map((e) => ({
          ...e,
          attachments: byEntry.get(e.id) ?? [],
        })),
        attachments: debtAtt,
      };
    }),
  };
}

// --- OTP + grants ----------------------------------------------------

export async function deletePersonDebtOtps(personId: string): Promise<void> {
  await getDb().delete(debtOtps).where(eq(debtOtps.personId, personId));
}

export async function createDebtOtp(
  personId: string,
  email: string,
  codeHash: string,
  expiresAt: Date,
): Promise<DebtOtp> {
  const rows = await getDb()
    .insert(debtOtps)
    .values({ personId, email, codeHash, expiresAt })
    .returning();
  if (!rows[0]) throw new Error('createDebtOtp: no row');
  return rows[0];
}

/** The newest unconsumed, unexpired code for a person. */
export async function findLiveDebtOtp(
  personId: string,
): Promise<DebtOtp | undefined> {
  const rows = await getDb()
    .select()
    .from(debtOtps)
    .where(
      and(
        eq(debtOtps.personId, personId),
        isNull(debtOtps.consumedAt),
        gt(debtOtps.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(debtOtps.createdAt))
    .limit(1);
  return rows[0];
}

export async function bumpDebtOtpAttempts(id: string): Promise<number> {
  const rows = await getDb()
    .update(debtOtps)
    .set({ attempts: sql`${debtOtps.attempts} + 1` })
    .where(eq(debtOtps.id, id))
    .returning({ attempts: debtOtps.attempts });
  return rows[0]?.attempts ?? 0;
}

export async function consumeDebtOtp(id: string): Promise<void> {
  await getDb()
    .update(debtOtps)
    .set({ consumedAt: new Date() })
    .where(eq(debtOtps.id, id));
}

export async function createDebtGrant(
  personId: string,
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<DebtGrant> {
  const rows = await getDb()
    .insert(debtGrants)
    .values({ personId, email, tokenHash, expiresAt })
    .returning();
  if (!rows[0]) throw new Error('createDebtGrant: no row');
  return rows[0];
}

export async function findLiveDebtGrant(
  tokenHash: string,
): Promise<DebtGrant | undefined> {
  const rows = await getDb()
    .select()
    .from(debtGrants)
    .where(
      and(
        eq(debtGrants.tokenHash, tokenHash),
        gt(debtGrants.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function touchDebtGrant(id: string): Promise<void> {
  await getDb()
    .update(debtGrants)
    .set({ lastSeenAt: new Date() })
    .where(eq(debtGrants.id, id));
}
