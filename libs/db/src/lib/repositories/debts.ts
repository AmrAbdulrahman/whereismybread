import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { DebtDirection } from '@wib/domain';
import { getDb } from '../client';
import {
  debtAttachments,
  debtEntries,
  debtGrants,
  debtOtps,
  debtPeople,
  debts,
  type Debt,
  type DebtAttachment,
  type DebtEntry,
  type DebtGrant,
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

export interface DebtInput {
  personId: string;
  direction: DebtDirection;
  principalMinor: number;
  currency: string;
  description: string;
  notes: string | null;
  /** `YYYY-MM-DD` — when the debt was incurred. */
  incurredOn: string;
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

export interface DebtWithProgress extends Debt {
  paidMinor: number;
  entryCount: number;
}

async function ownsPerson(userId: string, personId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: debtPeople.id })
    .from(debtPeople)
    .where(and(eq(debtPeople.id, personId), eq(debtPeople.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** Every debt the user owns, each with its repaid sum + entry count. */
export async function listDebtsWithProgress(
  userId: string,
): Promise<DebtWithProgress[]> {
  const rows = await getDb()
    .select({
      debt: debts,
      paidMinor: sql<number>`coalesce(sum(${debtEntries.amountMinor}), 0)::int`,
      entryCount: sql<number>`count(${debtEntries.id})::int`,
    })
    .from(debts)
    .leftJoin(debtEntries, eq(debtEntries.debtId, debts.id))
    .where(eq(debts.userId, userId))
    .groupBy(debts.id)
    .orderBy(desc(debts.createdAt));
  return rows.map((r) => ({
    ...r.debt,
    paidMinor: r.paidMinor,
    entryCount: r.entryCount,
  }));
}

export type DebtEntryWithAttachments = DebtEntry & {
  attachments: DebtAttachment[];
};

export interface DebtWithEntries extends DebtWithProgress {
  person: DebtPerson;
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

export async function getDebtWithEntries(
  userId: string,
  id: string,
): Promise<DebtWithEntries | undefined> {
  const rows = await getDb()
    .select({ debt: debts, person: debtPeople })
    .from(debts)
    .innerJoin(debtPeople, eq(debtPeople.id, debts.personId))
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const [entries, attachmentRows] = await Promise.all([
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
  const paidMinor = entries.reduce((s, e) => s + e.amountMinor, 0);
  return {
    ...row.debt,
    person: row.person,
    entries: entries.map((e) => ({
      ...e,
      attachments: byEntry.get(e.id) ?? [],
    })),
    attachments: debtAtt,
    paidMinor,
    entryCount: entries.length,
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

export async function createDebt(
  userId: string,
  input: DebtInput,
): Promise<Debt | null> {
  if (!(await ownsPerson(userId, input.personId))) return null;
  const rows = await getDb()
    .insert(debts)
    .values({
      userId,
      personId: input.personId,
      direction: input.direction,
      principalMinor: input.principalMinor,
      currency: input.currency,
      description: input.description.trim(),
      notes: input.notes,
      incurredOn: input.incurredOn,
    })
    .returning();
  return rows[0] ?? null;
}

export async function updateDebt(
  userId: string,
  id: string,
  input: DebtInput,
): Promise<Debt | null> {
  if (!(await ownsPerson(userId, input.personId))) return null;
  const rows = await getDb()
    .update(debts)
    .set({
      personId: input.personId,
      direction: input.direction,
      principalMinor: input.principalMinor,
      currency: input.currency,
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

// --- entries (repayments) ----------------------------------------------

export interface DebtEntryInput {
  amountMinor: number;
  note: string | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string;
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
  const [entries, attachmentRows] = ids.length
    ? await Promise.all([
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
    : [[], []];
  const entriesByDebt = new Map<string, DebtEntry[]>();
  for (const e of entries) {
    const list = entriesByDebt.get(e.debtId) ?? [];
    list.push(e);
    entriesByDebt.set(e.debtId, list);
  }
  const attByDebt = new Map<string, DebtAttachment[]>();
  for (const a of attachmentRows) {
    const list = attByDebt.get(a.debtId) ?? [];
    list.push(a);
    attByDebt.set(a.debtId, list);
  }
  return {
    person,
    debts: rows.map((d) => {
      const { debt: debtAtt, byEntry } = groupAttachments(
        attByDebt.get(d.id) ?? [],
      );
      return {
        ...d,
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
