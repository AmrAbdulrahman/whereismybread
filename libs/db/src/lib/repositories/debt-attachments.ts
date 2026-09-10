import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import {
  debtAttachments,
  debtPeople,
  debts,
  type DebtAttachment,
} from '../schema/debts';

export interface DebtAttachmentInput {
  debtId: string;
  /** `null` = attached to the debt itself; set = to that repayment. */
  entryId: string | null;
  name: string;
  contentType: string;
  size: number;
  url: string;
  pathname: string;
}

async function ownsDebt(userId: string, debtId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: debts.id })
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** Insert an attachment row — the caller has already uploaded the blob. */
export async function addDebtAttachment(
  userId: string,
  input: DebtAttachmentInput,
): Promise<DebtAttachment | null> {
  if (!(await ownsDebt(userId, input.debtId))) return null;
  const rows = await getDb()
    .insert(debtAttachments)
    .values({ userId, ...input })
    .returning();
  return rows[0] ?? null;
}

/** Delete one row, returning it so the caller can remove the blob. */
export async function deleteDebtAttachment(
  userId: string,
  id: string,
): Promise<DebtAttachment | null> {
  const rows = await getDb()
    .delete(debtAttachments)
    .where(
      and(eq(debtAttachments.id, id), eq(debtAttachments.userId, userId)),
    )
    .returning();
  return rows[0] ?? null;
}

export async function listDebtAttachments(
  debtId: string,
): Promise<DebtAttachment[]> {
  return getDb()
    .select()
    .from(debtAttachments)
    .where(eq(debtAttachments.debtId, debtId))
    .orderBy(asc(debtAttachments.createdAt));
}

/**
 * Make the attachments for one scope (a debt, or one of its repayments) match
 * `desired` (keyed by `pathname`): insert new, delete gone. Returns the rows
 * removed, for blob cleanup.
 */
export async function reconcileDebtAttachments(
  userId: string,
  debtId: string,
  entryId: string | null,
  desired: Omit<DebtAttachmentInput, 'debtId' | 'entryId'>[],
): Promise<{ removed: DebtAttachment[] }> {
  if (!(await ownsDebt(userId, debtId))) return { removed: [] };

  const scope = and(
    eq(debtAttachments.userId, userId),
    eq(debtAttachments.debtId, debtId),
    entryId == null
      ? isNull(debtAttachments.entryId)
      : eq(debtAttachments.entryId, entryId),
  );
  const existing = await getDb()
    .select()
    .from(debtAttachments)
    .where(scope);

  const keep = new Set(desired.map((d) => d.pathname));
  const have = new Set(existing.map((e) => e.pathname));
  const toRemove = existing.filter((e) => !keep.has(e.pathname));
  const toAdd = desired.filter((d) => !have.has(d.pathname));

  if (toRemove.length > 0) {
    await getDb()
      .delete(debtAttachments)
      .where(
        inArray(
          debtAttachments.id,
          toRemove.map((r) => r.id),
        ),
      );
  }
  if (toAdd.length > 0) {
    await getDb()
      .insert(debtAttachments)
      .values(toAdd.map((d) => ({ userId, debtId, entryId, ...d })));
  }
  return { removed: toRemove };
}

export interface DebtAttachmentGrantCheck {
  pathname: string;
  /** The user who owns the debt (blob path is `debts/<ownerId>/…`). */
  ownerId: string;
  /** The person the debt is with — matched against the grant. */
  personId: string;
}

/**
 * Resolve an attachment by its blob pathname to the debt's owner + person, so
 * the streaming route can authorise an external (OTP-granted) viewer.
 */
export async function getDebtAttachmentGrantInfo(
  pathname: string,
): Promise<DebtAttachmentGrantCheck | undefined> {
  const rows = await getDb()
    .select({
      pathname: debtAttachments.pathname,
      ownerId: debts.userId,
      personId: debts.personId,
    })
    .from(debtAttachments)
    .innerJoin(debts, eq(debts.id, debtAttachments.debtId))
    .innerJoin(debtPeople, eq(debtPeople.id, debts.personId))
    .where(eq(debtAttachments.pathname, pathname))
    .limit(1);
  return rows[0];
}
