import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import {
  insightsLayouts,
  type InsightsLayoutData,
} from '../schema/insights';

const EMPTY: InsightsLayoutData = { order: {}, spans: {} };

/** The user's Insights card arrangement, or an empty layout. */
export async function getInsightsLayout(
  userId: string,
): Promise<InsightsLayoutData> {
  const rows = await getDb()
    .select({ data: insightsLayouts.data })
    .from(insightsLayouts)
    .where(eq(insightsLayouts.userId, userId))
    .limit(1);
  return rows[0]?.data ?? EMPTY;
}

/** Replace the user's Insights card arrangement (upsert). */
export async function setInsightsLayout(
  userId: string,
  data: InsightsLayoutData,
): Promise<void> {
  await getDb()
    .insert(insightsLayouts)
    .values({ userId, data })
    .onConflictDoUpdate({
      target: insightsLayouts.userId,
      set: { data, updatedAt: new Date() },
    });
}
