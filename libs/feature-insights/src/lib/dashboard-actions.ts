'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@wib/auth/server';
import {
  createDashboardChart,
  deleteDashboardChart,
  reorderDashboardCharts,
  updateDashboardChart,
  type ChartDisplay,
  type ChartGroupBy,
  type DashboardChartConfig,
  type SpendFilterConfig,
  type StatMeasure,
} from '@wib/db';
import {
  buildCustomSeries,
  computeStat,
  type ChartSeries,
  type StatResult,
} from './dashboard-compute';
import { loadSpendItems } from './dashboard';

const MEASURES: StatMeasure[] = ['sum', 'count', 'avg', 'min', 'max'];
const GROUP_BYS: ChartGroupBy[] = [
  'account',
  'tag',
  'method',
  'bank',
  'source',
  'budgeted',
  'day',
  'weekday',
];
const DISPLAYS: ChartDisplay[] = ['bar', 'pie'];

function cleanIds(v: unknown, max = 40): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === 'string')
    .slice(0, max)
    .map((s) => s.slice(0, 64));
  return out.length > 0 ? out : undefined;
}

function cleanInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined;
}

/** Sanitised faceted filter — bounds every list, drops anything unexpected. */
function cleanFilter(v: unknown): SpendFilterConfig | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const raw = v as Record<string, unknown>;
  const out: SpendFilterConfig = {};
  if (typeof raw.search === 'string' && raw.search.trim()) {
    out.search = raw.search.trim().slice(0, 200);
  }
  const accountIds = cleanIds(raw.accountIds);
  if (accountIds) out.accountIds = accountIds;
  const tagIds = cleanIds(raw.tagIds);
  if (tagIds) out.tagIds = tagIds;
  const methodIds = cleanIds(raw.methodIds);
  if (methodIds) out.methodIds = methodIds;
  const bankIds = cleanIds(raw.bankIds);
  if (bankIds) out.bankIds = bankIds;
  if (raw.source === 'planned' || raw.source === 'expense') {
    out.source = raw.source;
  }
  if (typeof raw.budgeted === 'boolean') out.budgeted = raw.budgeted;
  const lo = cleanInt(raw.amountMinMinor);
  if (lo != null && lo >= 0) out.amountMinMinor = lo;
  const hi = cleanInt(raw.amountMaxMinor);
  if (hi != null && hi >= 0) out.amountMaxMinor = hi;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Sanitised tile config — drops anything unexpected. */
function cleanConfig(v: unknown): DashboardChartConfig {
  if (!v || typeof v !== 'object') return {};
  const raw = v as Record<string, unknown>;
  const out: DashboardChartConfig = {};
  if (typeof raw.span === 'number' && Number.isFinite(raw.span)) {
    out.span = Math.min(2, Math.max(1, Math.round(raw.span)));
  }
  const filter = cleanFilter(raw.filter);
  if (filter) out.filter = filter;
  if (MEASURES.includes(raw.measure as StatMeasure)) {
    out.measure = raw.measure as StatMeasure;
  }
  if (raw.compare === 'prev_month') out.compare = 'prev_month';
  if (GROUP_BYS.includes(raw.groupBy as ChartGroupBy)) {
    out.groupBy = raw.groupBy as ChartGroupBy;
  }
  if (DISPLAYS.includes(raw.display as ChartDisplay)) {
    out.display = raw.display as ChartDisplay;
  }
  const limit = cleanInt(raw.limit);
  if (limit != null && limit > 0) out.limit = Math.min(50, limit);
  // legacy preset settings, preserved on re-save of an un-migrated row
  const exclude = cleanIds(raw.excludeAccountIds);
  if (exclude) out.excludeAccountIds = exclude;
  const include = cleanIds(raw.includeTagIds);
  if (include) out.includeTagIds = include;
  if (raw.dimension === 'account' || raw.dimension === 'tag') {
    out.dimension = raw.dimension;
  }
  return out;
}

/**
 * Run a stat's filter + measure without saving it — powers the builder's
 * "Test query" preview. `month` is the dashboard's current `?m=` value.
 */
export async function previewStatAction(
  month: string | undefined,
  config: unknown,
): Promise<{ ok: true; result: StatResult } | { ok: false }> {
  await requireUserId();
  const clean = cleanConfig(config);
  const {
    allItems,
    month: resolvedMonth,
    prevMonth,
  } = await loadSpendItems(typeof month === 'string' ? month : undefined);
  return {
    ok: true,
    result: computeStat(allItems, clean, resolvedMonth, prevMonth),
  };
}

export type ChartPreview = Omit<ChartSeries, 'id' | 'kind' | 'title' | 'config'>;

/** Run a custom chart's config without saving it — the builder's preview. */
export async function previewChartAction(
  month: string | undefined,
  config: unknown,
): Promise<{ ok: true; series: ChartPreview } | { ok: false }> {
  await requireUserId();
  const clean = cleanConfig(config);
  const { allItems, month: resolvedMonth, currency } = await loadSpendItems(
    typeof month === 'string' ? month : undefined,
  );
  return {
    ok: true,
    series: buildCustomSeries(clean, allItems, resolvedMonth, currency),
  };
}

export async function addStatAction(patch: {
  title?: string;
  config?: unknown;
}): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const title =
    typeof patch.title === 'string' && patch.title.trim()
      ? patch.title.trim().slice(0, 80)
      : 'New stat';
  await createDashboardChart(userId, {
    kind: 'stat',
    title,
    config: cleanConfig(patch.config),
  });
  revalidatePath('/insights');
  return { ok: true };
}

export async function addChartAction(patch: {
  title?: string;
  config?: unknown;
}): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const title =
    typeof patch.title === 'string' && patch.title.trim()
      ? patch.title.trim().slice(0, 80)
      : 'Chart';
  await createDashboardChart(userId, {
    kind: 'custom',
    title,
    config: cleanConfig(patch.config),
  });
  revalidatePath('/insights');
  return { ok: true };
}

export async function saveChartAction(
  id: string,
  patch: { title?: string; config?: unknown },
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) return { ok: false };
  const next: { title?: string; config?: DashboardChartConfig } = {};
  if (typeof patch.title === 'string') {
    next.title = patch.title.trim().slice(0, 80) || 'Chart';
  }
  if (patch.config !== undefined) next.config = cleanConfig(patch.config);
  await updateDashboardChart(userId, id, next);
  revalidatePath('/insights');
  return { ok: true };
}

export async function deleteChartAction(id: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) return { ok: false };
  await deleteDashboardChart(userId, id);
  revalidatePath('/insights');
  return { ok: true };
}

export async function reorderChartsAction(
  ids: string[],
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const clean = cleanIds(ids);
  if (!clean || clean.length === 0) return { ok: false };
  await reorderDashboardCharts(userId, clean);
  revalidatePath('/insights');
  return { ok: true };
}
