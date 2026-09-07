import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import {
  dashboardCharts,
  type DashboardChart,
  type DashboardChartConfig,
  type DashboardChartKind,
} from '../schema/insights';

/** The user's dashboard charts, in display order. */
export async function listDashboardCharts(
  userId: string,
): Promise<DashboardChart[]> {
  return getDb()
    .select()
    .from(dashboardCharts)
    .where(eq(dashboardCharts.userId, userId))
    .orderBy(asc(dashboardCharts.sortOrder), asc(dashboardCharts.createdAt));
}

export interface NewChartInput {
  kind: DashboardChartKind;
  title: string;
  config?: DashboardChartConfig;
}

/** Append a chart to the end of the user's dashboard. */
export async function createDashboardChart(
  userId: string,
  input: NewChartInput,
): Promise<DashboardChart> {
  const existing = await getDb()
    .select({ sortOrder: dashboardCharts.sortOrder })
    .from(dashboardCharts)
    .where(eq(dashboardCharts.userId, userId));
  const nextOrder =
    existing.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

  const rows = await getDb()
    .insert(dashboardCharts)
    .values({
      userId,
      kind: input.kind,
      title: input.title,
      config: input.config ?? {},
      sortOrder: nextOrder,
    })
    .returning();
  if (!rows[0]) throw new Error('createDashboardChart: no row');
  return rows[0];
}

/** Seed several charts at once (first-visit defaults). */
export async function seedDashboardCharts(
  userId: string,
  charts: NewChartInput[],
): Promise<DashboardChart[]> {
  if (charts.length === 0) return [];
  const rows = await getDb()
    .insert(dashboardCharts)
    .values(
      charts.map((c, i) => ({
        userId,
        kind: c.kind,
        title: c.title,
        config: c.config ?? {},
        sortOrder: i,
      })),
    )
    .returning();
  return rows;
}

export async function updateDashboardChart(
  userId: string,
  id: string,
  patch: { title?: string; config?: DashboardChartConfig },
): Promise<void> {
  await getDb()
    .update(dashboardCharts)
    .set({
      ...(patch.title != null ? { title: patch.title } : {}),
      ...(patch.config != null ? { config: patch.config } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(dashboardCharts.id, id), eq(dashboardCharts.userId, userId)),
    );
}

export async function deleteDashboardChart(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(dashboardCharts)
    .where(
      and(eq(dashboardCharts.id, id), eq(dashboardCharts.userId, userId)),
    );
}

/** Persist a new order — `ids` is the full list in the desired sequence. */
export async function reorderDashboardCharts(
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const owned = await getDb()
    .select({ id: dashboardCharts.id })
    .from(dashboardCharts)
    .where(
      and(
        eq(dashboardCharts.userId, userId),
        inArray(dashboardCharts.id, ids),
      ),
    );
  const ownedIds = new Set(owned.map((r) => r.id));
  const db = getDb();
  let order = 0;
  for (const id of ids) {
    if (!ownedIds.has(id)) continue;
    await db
      .update(dashboardCharts)
      .set({ sortOrder: order++, updatedAt: new Date() })
      .where(eq(dashboardCharts.id, id));
  }
}
