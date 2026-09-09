import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { expenses } from '../schema/budgets';
import {
  payments,
  providerTags,
  providers,
  tags,
  type Provider,
  type Tag,
} from '../schema/payments';

/** A provider plus usage counts and the ids of its default tags. */
export type ProviderWithUsage = Provider & {
  paymentCount: number;
  expenseCount: number;
  defaultTagIds: string[];
};

const PROVIDER_PALETTE = [
  '#6321d6',
  '#0e8074',
  '#a8641a',
  '#a83f77',
  '#4f7a34',
  '#2d6a9f',
] as const;

/** The registrable host of a URL — `www.` stripped, lower-cased. `null` when unparseable. */
export function providerHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export async function listProviders(userId: string): Promise<Provider[]> {
  return getDb()
    .select()
    .from(providers)
    .where(eq(providers.userId, userId))
    .orderBy(asc(providers.sortOrder), asc(sql`lower(${providers.name})`));
}

export async function listProvidersWithUsage(
  userId: string,
): Promise<ProviderWithUsage[]> {
  const rows = await getDb()
    .select({
      id: providers.id,
      userId: providers.userId,
      name: providers.name,
      url: providers.url,
      logoUrl: providers.logoUrl,
      color: providers.color,
      sortOrder: providers.sortOrder,
      createdAt: providers.createdAt,
      updatedAt: providers.updatedAt,
      paymentCount: sql<number>`count(distinct ${payments.id})`,
      expenseCount: sql<number>`count(distinct ${expenses.id})`,
      defaultTagIds: sql<
        string[]
      >`coalesce(array_agg(distinct ${providerTags.tagId}) filter (where ${providerTags.tagId} is not null), '{}')`,
    })
    .from(providers)
    .leftJoin(
      payments,
      and(
        eq(payments.providerId, providers.id),
        sql`${payments.archivedAt} is null`,
      ),
    )
    .leftJoin(expenses, eq(expenses.providerId, providers.id))
    .leftJoin(providerTags, eq(providerTags.providerId, providers.id))
    .where(eq(providers.userId, userId))
    .groupBy(providers.id)
    .orderBy(asc(providers.sortOrder), asc(sql`lower(${providers.name})`));

  return rows.map((r) => ({
    ...r,
    paymentCount: Number(r.paymentCount),
    expenseCount: Number(r.expenseCount),
    defaultTagIds: r.defaultTagIds ?? [],
  }));
}

export async function getProvider(
  userId: string,
  id: string,
): Promise<Provider | null> {
  const rows = await getDb()
    .select()
    .from(providers)
    .where(and(eq(providers.id, id), eq(providers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProviderByName(
  userId: string,
  name: string,
): Promise<Provider | null> {
  const rows = await getDb()
    .select()
    .from(providers)
    .where(
      and(
        eq(providers.userId, userId),
        sql`lower(${providers.name}) = lower(${name.trim()})`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getProviderByHost(
  userId: string,
  host: string,
): Promise<Provider | null> {
  const h = host.trim().toLowerCase();
  if (!h) return null;
  const rows = await getDb()
    .select()
    .from(providers)
    .where(
      and(
        eq(providers.userId, userId),
        sql`lower(regexp_replace(coalesce(${providers.url}, ''), '^(https?://)?(www\\.)?([^/]+).*$', '\\3')) = ${h}`,
        sql`coalesce(${providers.url}, '') <> ''`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface ProviderInput {
  name: string;
  url?: string | null;
  logoUrl?: string | null;
  color?: string | null;
}

export async function createProvider(
  userId: string,
  input: ProviderInput,
): Promise<Provider> {
  const color =
    input.color ??
    PROVIDER_PALETTE[Math.floor(Math.random() * PROVIDER_PALETTE.length)] ??
    PROVIDER_PALETTE[0];

  const rows = await getDb()
    .insert(providers)
    .values({
      userId,
      name: input.name.trim(),
      url: input.url ?? null,
      logoUrl: input.logoUrl ?? null,
      color,
    })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];

  const found = await getProviderByName(userId, input.name);
  if (!found) throw new Error('createProvider: conflict but no existing row');
  return found;
}

/**
 * Resolve a provider by URL host, then by name, creating one when neither
 * matches. Used by the automations engine + rule migration.
 */
export async function getOrCreateProvider(
  userId: string,
  input: { name: string; url?: string | null },
): Promise<Provider> {
  const host = providerHost(input.url);
  if (host) {
    const byHost = await getProviderByHost(userId, host);
    if (byHost) return byHost;
  }
  const name = input.name.trim() || host || 'Provider';
  const byName = await getProviderByName(userId, name);
  if (byName) return byName;
  return createProvider(userId, { name, url: input.url ?? null });
}

export async function updateProvider(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    url: string | null;
    logoUrl: string | null;
    color: string | null;
    sortOrder: number;
  }>,
): Promise<Provider | null> {
  if (patch.name != null) {
    const clash = await getDb()
      .select({ id: providers.id })
      .from(providers)
      .where(
        and(
          eq(providers.userId, userId),
          sql`lower(${providers.name}) = lower(${patch.name.trim()})`,
          sql`${providers.id} <> ${id}`,
        ),
      )
      .limit(1);
    if (clash[0]) return null;
  }

  const rows = await getDb()
    .update(providers)
    .set({
      ...patch,
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(providers.id, id), eq(providers.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteProvider(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(providers)
    .where(and(eq(providers.id, id), eq(providers.userId, userId)));
}

/** Replace a provider's default-tag set. `tagIds` are validated against the user. */
export async function setProviderDefaultTags(
  userId: string,
  providerId: string,
  tagIds: string[],
): Promise<void> {
  const db = getDb();
  const owns = await db
    .select({ id: providers.id })
    .from(providers)
    .where(and(eq(providers.id, providerId), eq(providers.userId, userId)))
    .limit(1);
  if (!owns[0]) return;

  const wanted =
    tagIds.length === 0
      ? []
      : (
          await db
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)))
        ).map((r) => r.id);

  await db.transaction(async (tx) => {
    await tx
      .delete(providerTags)
      .where(eq(providerTags.providerId, providerId));
    if (wanted.length > 0) {
      await tx
        .insert(providerTags)
        .values(wanted.map((tagId) => ({ providerId, tagId })))
        .onConflictDoNothing();
    }
  });
}

export async function getProviderDefaultTags(
  userId: string,
  providerId: string,
): Promise<Tag[]> {
  return getDb()
    .select({
      id: tags.id,
      userId: tags.userId,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    })
    .from(providerTags)
    .innerJoin(tags, eq(tags.id, providerTags.tagId))
    .innerJoin(providers, eq(providers.id, providerTags.providerId))
    .where(
      and(
        eq(providerTags.providerId, providerId),
        eq(providers.userId, userId),
      ),
    )
    .orderBy(asc(sql`lower(${tags.name})`));
}
