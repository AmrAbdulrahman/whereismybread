import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { paymentTags, payments, tags, type Tag } from '../schema/payments';

/** A tag plus how many of the user's active payments carry it. */
export type TagWithUsage = Tag & { paymentCount: number };

const TAG_PALETTE = [
  '#6321d6',
  '#0e8074',
  '#a8641a',
  '#a83f77',
  '#4f7a34',
  '#2d6a9f',
] as const;

export async function listTags(userId: string): Promise<Tag[]> {
  return getDb()
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(sql`lower(${tags.name})`));
}

export async function createTag(
  userId: string,
  name: string,
  color?: string,
): Promise<Tag> {
  const fallback =
    TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)] ??
    TAG_PALETTE[0];

  const rows = await getDb()
    .insert(tags)
    .values({ userId, name: name.trim(), color: color ?? fallback })
    .onConflictDoNothing()
    .returning();

  if (rows[0]) return rows[0];
  // conflict — return the existing one
  const found = await getDb()
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        sql`lower(${tags.name}) = lower(${name.trim()})`,
      ),
    )
    .limit(1);
  if (!found[0]) throw new Error('createTag: conflict but no existing row');
  return found[0];
}

/**
 * Resolve a list of tag names to tag rows, creating any that are new.
 * Batched: one select for the existing rows, one insert for the rest.
 */
export async function getOrCreateTags(
  userId: string,
  names: string[],
): Promise<Tag[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];

  const matchName = (list: string[]) =>
    or(...list.map((n) => sql`lower(${tags.name}) = lower(${n})`));

  const byLower = new Map<string, Tag>();
  const existing = await getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), matchName(wanted)));
  for (const t of existing) byLower.set(t.name.toLowerCase(), t);

  const missing = wanted.filter((n) => !byLower.has(n.toLowerCase()));
  if (missing.length > 0) {
    const offset = byLower.size;
    const inserted = await getDb()
      .insert(tags)
      .values(
        missing.map((name, i) => ({
          userId,
          name,
          color:
            TAG_PALETTE[(offset + i) % TAG_PALETTE.length] ?? TAG_PALETTE[0],
        })),
      )
      .onConflictDoNothing()
      .returning();
    for (const t of inserted) byLower.set(t.name.toLowerCase(), t);

    // Anything still absent lost an insert race — read those back.
    const raced = missing.filter((n) => !byLower.has(n.toLowerCase()));
    if (raced.length > 0) {
      const rows = await getDb()
        .select()
        .from(tags)
        .where(and(eq(tags.userId, userId), matchName(raced)));
      for (const t of rows) byLower.set(t.name.toLowerCase(), t);
    }
  }

  return wanted
    .map((n) => byLower.get(n.toLowerCase()))
    .filter((t): t is Tag => t != null);
}

/**
 * Every tag the user owns, each with a count of the active (non-archived)
 * payments that carry it. Ordered by name.
 */
export async function listTagsWithUsage(
  userId: string,
): Promise<TagWithUsage[]> {
  const rows = await getDb()
    .select({
      id: tags.id,
      userId: tags.userId,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
      paymentCount: sql<number>`count(distinct ${payments.id})`,
    })
    .from(tags)
    .leftJoin(paymentTags, eq(paymentTags.tagId, tags.id))
    .leftJoin(
      payments,
      and(
        eq(payments.id, paymentTags.paymentId),
        sql`${payments.archivedAt} is null`,
      ),
    )
    .where(eq(tags.userId, userId))
    .groupBy(tags.id)
    .orderBy(asc(sql`lower(${tags.name})`));

  return rows.map((r) => ({ ...r, paymentCount: Number(r.paymentCount) }));
}

/**
 * Rename / recolour a tag. Returns the updated row, or `null` when the row
 * isn't the user's or the new name collides with another of their tags.
 */
export async function updateTag(
  userId: string,
  id: string,
  patch: { name: string; color: string },
): Promise<Tag | null> {
  const name = patch.name.trim();

  const clash = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        sql`lower(${tags.name}) = lower(${name})`,
        sql`${tags.id} <> ${id}`,
      ),
    )
    .limit(1);
  if (clash[0]) return null;

  const rows = await getDb()
    .update(tags)
    .set({ name, color: patch.color, updatedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteTag(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)));
}

export async function getTagByName(
  userId: string,
  name: string,
): Promise<Tag | null> {
  const rows = await getDb()
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        sql`lower(${tags.name}) = lower(${name.trim()})`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function tagsByIds(userId: string, ids: string[]): Promise<Tag[]> {
  if (ids.length === 0) return [];
  return getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, ids)));
}
