'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@wib/auth/server';
import {
  createDashboardChart,
  deleteDashboardChart,
  reorderDashboardCharts,
  updateDashboardChart,
  type DashboardChartConfig,
  type DashboardChartKind,
} from '@wib/db';

const KINDS: DashboardChartKind[] = [
  'month_spend_line',
  'account_pie',
  'tag_pie',
  'category_bar',
];

const DEFAULT_TITLE: Record<DashboardChartKind, string> = {
  month_spend_line: 'Spending this month',
  account_pie: 'By account',
  tag_pie: 'By tag',
  category_bar: 'Top categories',
};

function cleanIds(v: unknown, max = 40): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((x): x is string => typeof x === 'string')
    .slice(0, max)
    .map((s) => s.slice(0, 64));
}

/** Sanitised chart config — drops anything unexpected. */
function cleanConfig(v: unknown): DashboardChartConfig {
  if (!v || typeof v !== 'object') return {};
  const raw = v as Record<string, unknown>;
  const out: DashboardChartConfig = {};
  const exclude = cleanIds(raw.excludeAccountIds);
  if (exclude) out.excludeAccountIds = exclude;
  const include = cleanIds(raw.includeTagIds);
  if (include) out.includeTagIds = include;
  if (raw.dimension === 'account' || raw.dimension === 'tag') {
    out.dimension = raw.dimension;
  }
  if (typeof raw.span === 'number' && Number.isFinite(raw.span)) {
    out.span = Math.min(2, Math.max(1, Math.round(raw.span)));
  }
  return out;
}

export async function addChartAction(
  kind: DashboardChartKind,
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!KINDS.includes(kind)) return { ok: false };
  await createDashboardChart(userId, {
    kind,
    title: DEFAULT_TITLE[kind],
    config: {},
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
